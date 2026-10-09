-- Tomapuntes: datos sincronizados por usuario.
-- Cada tabla guarda filas de un solo usuario (RLS) y lleva:
--   updated_at         ms del cliente: decide qué cambio gana (el más reciente)
--   deleted            borrado lógico, para que el borrado llegue a los otros dispositivos
--   server_updated_at  lo pone el servidor; el cliente baja "lo nuevo desde X" con esto

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table if not exists public.folders (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.docs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text not null default '',
  folder_id text,
  file_hash text,
  size bigint not null default 0,
  pages int not null default 0,
  last_page int not null default 1,
  max_page int not null default 0,
  scale real,
  added_at bigint not null default 0,
  opened_at bigint not null default 0,
  changed_at bigint,
  saved_at bigint,
  thumb text,
  updated_at bigint not null default 0,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists docs_file_hash on public.docs (file_hash);

create table if not exists public.highlights (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  doc_id text not null,
  color text not null,
  rects jsonb not null default '[]',
  page int not null default 1,
  text text not null default '',
  note text not null default '',
  created_at bigint not null default 0,
  review jsonb,
  updated_at bigint not null default 0,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.evaluations (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  kind text not null default 'parcial',
  title text not null default '',
  folder_id text,
  date text not null,
  done boolean not null default false,
  notes jsonb not null default '[]',
  doc_ids jsonb not null default '[]',
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Minutos leídos por libro, día y dispositivo (cada dispositivo escribe solo sus filas: nunca se pisan).
create table if not exists public.reading (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  doc_id text not null,
  date text not null,
  ms bigint not null default 0,
  updated_at bigint not null default 0,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.pomodoros (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  date text not null,
  at bigint not null default 0,
  minutes int not null default 25,
  updated_at bigint not null default 0,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- server_updated_at automático + índices para "lo nuevo desde X"
-- ---------------------------------------------------------------------------
create or replace function public.touch_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['folders', 'docs', 'highlights', 'evaluations', 'reading', 'pomodoros'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$I', t);
    execute format(
      'create trigger touch_%1$s before insert or update on public.%1$I
         for each row execute function public.touch_server_updated_at()', t);
    execute format('create index if not exists %1$s_sync on public.%1$I (user_id, server_updated_at)', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: cada uno ve y toca solo lo suyo
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['folders', 'docs', 'highlights', 'evaluations', 'reading', 'pomodoros'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dueño" on public.%I', t);
    execute format(
      'create policy "dueño" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cuota: 300 MB de PDFs por usuario (contando los que comparte con otros)
-- ---------------------------------------------------------------------------
create or replace function public.check_doc_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  used bigint;
  quota constant bigint := 300 * 1024 * 1024;
begin
  if new.deleted then
    return new;
  end if;
  select coalesce(sum(size), 0) into used
    from public.docs
   where user_id = new.user_id and not deleted and id <> new.id;
  if used + coalesce(new.size, 0) > quota then
    raise exception 'quota_exceeded' using hint = 'Llegaste al límite de 300 MB de PDFs';
  end if;
  return new;
end;
$$;

drop trigger if exists docs_quota on public.docs;
create trigger docs_quota before insert or update of size, deleted on public.docs
  for each row execute function public.check_doc_quota();

-- ---------------------------------------------------------------------------
-- Storage: PDFs por huella (blobs/<sha256>.pdf), una sola copia aunque lo suban muchos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfs', 'pdfs', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

-- Solo podés leer o subir un archivo si tenés un libro (no borrado) con esa huella.
-- No hay políticas de update/delete: nadie puede pisar ni borrar un archivo compartido.
drop policy if exists "pdfs: leer los míos" on storage.objects;
create policy "pdfs: leer los míos" on storage.objects for select to authenticated
  using (
    bucket_id = 'pdfs'
    and exists (
      select 1 from public.docs d
       where d.user_id = (select auth.uid())
         and not d.deleted
         and storage.objects.name = 'blobs/' || d.file_hash || '.pdf'
    )
  );

drop policy if exists "pdfs: subir los míos" on storage.objects;
create policy "pdfs: subir los míos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pdfs'
    and exists (
      select 1 from public.docs d
       where d.user_id = (select auth.uid())
         and not d.deleted
         and storage.objects.name = 'blobs/' || d.file_hash || '.pdf'
    )
  );
