/**
 * Sincronización "local primero" con Supabase.
 *
 * - Cada escritura local marca la fila como pendiente (dirty) y anota cuándo cambió.
 * - Subir: las filas pendientes van con upsert; los borrados, como borrado lógico.
 * - Bajar: lo que cambió en el servidor desde la última vez (server_updated_at).
 * - Conflictos: gana el cambio más reciente (updated_at del cliente).
 * - PDFs: en el storage por huella SHA-256, una sola copia aunque lo suban muchos.
 */
import Dexie, { type Table } from 'dexie';
import { useSyncExternalStore } from 'react';
import { db, type Doc } from './db';
import { sha256 } from './hash';
import { lsGet, lsSet } from './storage';
import { supabase } from './supabase';

type Row = Record<string, unknown>;

interface Spec {
  table: Table<Row, string>;
  remote: string;
  /** [campo local, columna remota] además de id / updatedAt / deleted. */
  fields: [string, string][];
}

const SPECS: Spec[] = [
  { table: db.folders as never, remote: 'folders', fields: [['name', 'name'], ['createdAt', 'created_at']] },
  {
    table: db.docs as never,
    remote: 'docs',
    fields: [
      ['name', 'name'],
      ['folderId', 'folder_id'],
      ['fileHash', 'file_hash'],
      ['size', 'size'],
      ['pages', 'pages'],
      ['lastPage', 'last_page'],
      ['maxPage', 'max_page'],
      ['scale', 'scale'],
      ['addedAt', 'added_at'],
      ['openedAt', 'opened_at'],
      ['changedAt', 'changed_at'],
      ['savedAt', 'saved_at'],
      ['thumb', 'thumb'],
    ],
  },
  {
    table: db.highlights as never,
    remote: 'highlights',
    fields: [
      ['docId', 'doc_id'],
      ['color', 'color'],
      ['rects', 'rects'],
      ['page', 'page'],
      ['text', 'text'],
      ['note', 'note'],
      ['createdAt', 'created_at'],
      ['review', 'review'],
    ],
  },
  {
    table: db.evaluations as never,
    remote: 'evaluations',
    fields: [
      ['kind', 'kind'],
      ['title', 'title'],
      ['folderId', 'folder_id'],
      ['date', 'date'],
      ['done', 'done'],
      ['notes', 'notes'],
      ['docIds', 'doc_ids'],
      ['createdAt', 'created_at'],
    ],
  },
  { table: db.reading as never, remote: 'reading', fields: [['docId', 'doc_id'], ['date', 'date'], ['ms', 'ms']] },
  { table: db.pomodoros as never, remote: 'pomodoros', fields: [['date', 'date'], ['at', 'at'], ['minutes', 'minutes']] },
];
const byLocalName = new Map(SPECS.map((s) => [s.table.name, s]));

const toRemote = (spec: Spec, row: Row) => {
  const out: Row = { id: row.id, updated_at: row.updatedAt ?? Date.now(), deleted: false };
  for (const [local, remote] of spec.fields) out[remote] = row[local] ?? null;
  return out;
};

const fromRemote = (spec: Spec, row: Row, keep?: Row) => {
  // Campos solo locales (por ejemplo, "ya subido") se conservan.
  const out: Row = { ...(keep ?? {}), id: row.id, updatedAt: Number(row.updated_at), dirty: 0 };
  for (const [local, remote] of spec.fields) {
    const v = row[remote];
    if (v === null || v === undefined) delete out[local];
    else out[local] = typeof v === 'string' && /^(size|pages|lastPage|maxPage|addedAt|openedAt|changedAt|savedAt|createdAt|page|ms|at|minutes)$/.test(local) ? Number(v) : v;
  }
  return out;
};

// --- Escrituras desde la nube: no tienen que volver a marcarse como pendientes ----
const REMOTE = Symbol('remote');
const fromSync = () => !!(Dexie.currentTransaction as unknown as Record<symbol, boolean> | null)?.[REMOTE];

function applyRemote<T>(tables: Table[], fn: () => Promise<T>) {
  return db.transaction('rw', tables, async (tx) => {
    (tx as unknown as Record<symbol, boolean>)[REMOTE] = true;
    return fn();
  });
}

for (const spec of SPECS) {
  spec.table.hook('creating', function (_key, obj) {
    if (fromSync()) return;
    obj.updatedAt = Date.now();
    obj.dirty = 1;
    scheduleSync();
  });
  spec.table.hook('updating', function () {
    if (fromSync()) return;
    scheduleSync();
    return { updatedAt: Date.now(), dirty: 1 };
  });
  spec.table.hook('deleting', function (key) {
    if (fromSync()) return;
    this.onsuccess = () => {
      // Fuera de la transacción actual: anotamos el borrado para avisarle a la nube.
      setTimeout(() => {
        void db.tombstones.put({ key: `${spec.table.name}:${key}`, table: spec.table.name, id: String(key), at: Date.now() });
        scheduleSync();
      });
    };
  });
}

// --- Estado visible en la interfaz ------------------------------------------------
export interface SyncState {
  status: 'off' | 'syncing' | 'ok' | 'offline' | 'error';
  lastSync: number | null;
  message?: string;
}
let state: SyncState = { status: 'off', lastSync: null };
const listeners = new Set<() => void>();
const setState = (next: Partial<SyncState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
export function useSyncState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// --- Subir -----------------------------------------------------------------------
async function pushTable(spec: Spec) {
  const pending = await spec.table.where('dirty').equals(1).toArray();
  if (!pending.length) return;
  // Los libros de a uno: si alguno pasa la cuota, que no frene a los demás.
  const chunkSize = spec.remote === 'docs' ? 1 : 200;
  for (let i = 0; i < pending.length; i += chunkSize) {
    const chunk = pending.slice(i, i + chunkSize);
    const { error } = await supabase!
      .from(spec.remote)
      .upsert(chunk.map((r) => toRemote(spec, r)), { onConflict: 'user_id,id' });
    if (error) {
      if (error.message.includes('quota_exceeded')) {
        setState({ message: 'Llegaste a los 300 MB de PDFs en la nube: algunos libros quedan solo en este dispositivo.' });
        continue;
      }
      throw error;
    }
    // Solo se marca como subido si no cambió mientras tanto.
    await applyRemote([spec.table], async () => {
      for (const r of chunk) {
        const cur = await spec.table.get(r.id as string);
        if (cur && cur.updatedAt === r.updatedAt) await spec.table.update(r.id as string, { dirty: 0 });
      }
    });
  }
}

async function pushTombstones() {
  const all = await db.tombstones.toArray();
  for (const [table, items] of Map.groupBy(all, (t) => t.table)) {
    const spec = byLocalName.get(table);
    if (!spec) continue;
    const at = Math.max(...items.map((t) => t.at));
    // update (no upsert): si la fila nunca llegó a la nube, no hay nada que borrar.
    const { error } = await supabase!
      .from(spec.remote)
      .update({ deleted: true, updated_at: at })
      .in(
        'id',
        items.map((t) => t.id),
      );
    if (error) throw error;
    await db.tombstones.bulkDelete(items.map((t) => t.key));
  }
}

/** Sube los PDFs que todavía no están en la nube (si ya lo subió otro, no hace falta). */
async function uploadFiles() {
  const docs = await db.docs.filter((d) => !d.uploaded).toArray();
  for (const doc of docs) {
    const file = await db.files.get(doc.id);
    if (!file) continue;
    if (!doc.fileHash) {
      // Libros de antes de la nube: calculamos la huella (esto marca el libro para subir).
      await db.docs.update(doc.id, { fileHash: await sha256(file.blob) });
      continue;
    }
    if (doc.dirty) continue; // primero tiene que existir la fila del libro (lo exige la política del storage)
    const { error } = await supabase!.storage
      .from('pdfs')
      .upload(`blobs/${doc.fileHash}.pdf`, file.blob, { upsert: false, contentType: 'application/pdf' });
    const exists = error && /exist|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`);
    if (error && !exists) {
      console.warn('No se pudo subir el PDF', doc.name, error);
      continue;
    }
    await applyRemote([db.docs], () => db.docs.update(doc.id, { uploaded: true }));
  }
}

// --- Bajar -----------------------------------------------------------------------
const PAGE = 500;

async function pullTable(spec: Spec, userId: string) {
  const key = `apuntes.sync.${userId}.${spec.remote}`;
  let cursor = lsGet(key, '1970-01-01T00:00:00Z');
  for (;;) {
    const { data, error } = await supabase!
      .from(spec.remote)
      .select('*')
      .gt('server_updated_at', cursor)
      .order('server_updated_at')
      .limit(PAGE);
    if (error) throw error;
    if (!data.length) break;

    await applyRemote([spec.table, db.files], async () => {
      for (const row of data as Row[]) {
        const local = await spec.table.get(row.id as string);
        // Si acá hay un cambio más nuevo sin subir, gana el local.
        if (local?.dirty && Number(local.updatedAt ?? 0) > Number(row.updated_at)) continue;
        if (row.deleted) {
          await spec.table.delete(row.id as string);
          if (spec.remote === 'docs') await db.files.delete(row.id as string);
        } else {
          const next = fromRemote(spec, row, local);
          // Un libro que vino de la nube ya tiene su archivo allá.
          if (spec.remote === 'docs') next.uploaded = true;
          await spec.table.put(next);
        }
      }
    });

    cursor = (data[data.length - 1] as Row).server_updated_at as string;
    lsSet(key, cursor);
    if (data.length < PAGE) break;
  }
}

/** Baja el PDF de un libro que vino de otro dispositivo, verificando que la huella coincida. */
export async function downloadDocFile(doc: Doc) {
  if (!supabase || !doc.fileHash) throw new Error('Este libro no tiene archivo en la nube');
  const { data, error } = await supabase.storage.from('pdfs').download(`blobs/${doc.fileHash}.pdf`);
  if (error || !data) throw error ?? new Error('No se pudo bajar el PDF');
  if ((await sha256(data)) !== doc.fileHash) throw new Error('El archivo de la nube no coincide con el original');
  const blob = new Blob([data], { type: 'application/pdf' });
  await db.files.put({ id: doc.id, blob });
  return blob;
}

// --- Primera vez de esta cuenta en este navegador ------------------------------
async function claimLocalData(userId: string) {
  const ownerKey = 'apuntes.owner';
  const owner = lsGet<string | null>(ownerKey, null);
  if (owner === userId) return;

  if (owner && owner !== userId) {
    // Los datos de este navegador son de otra cuenta: no se mezclan. Si ya estaban subidos, se borran
    // de acá (siguen en la nube de esa cuenta); si había cambios sin subir, frenamos.
    const pending = await Promise.all(SPECS.map((s) => s.table.where('dirty').equals(1).count()));
    if (pending.some(Boolean) || (await db.tombstones.count())) {
      throw new Error('Este navegador tiene cambios sin subir de otra cuenta. Entrá con esa cuenta para guardarlos.');
    }
    await db.transaction('rw', [...SPECS.map((s) => s.table), db.files, db.tombstones], async () => {
      for (const s of SPECS) await s.table.clear();
      await db.files.clear();
    });
    for (const s of SPECS) localStorage.removeItem(`apuntes.sync.${userId}.${s.remote}`);
  } else {
    // Lo que hiciste como invitado pasa a tu cuenta: todo queda pendiente de subir.
    await applyRemote(
      SPECS.map((s) => s.table),
      async () => {
        for (const s of SPECS) {
          await s.table.toCollection().modify((r) => {
            r.dirty = 1;
            r.updatedAt ??= Date.now();
          });
        }
      },
    );
  }
  lsSet(ownerKey, userId);
}

// --- Bucle de sincronización ---------------------------------------------------
let userId: string | null = null;
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function scheduleSync(delay = 2500) {
  if (!userId) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export async function syncNow() {
  if (!supabase || !userId) return;
  if (!navigator.onLine) return setState({ status: 'offline' });
  if (running) {
    again = true;
    return running;
  }
  const uid = userId;
  running = (async () => {
    setState({ status: 'syncing', message: undefined });
    try {
      await claimLocalData(uid);
      const [folders, docs, ...rest] = SPECS;
      await pushTable(folders);
      await pushTable(docs);
      await uploadFiles();
      await pushTable(docs); // por si se calcularon huellas de libros viejos
      for (const s of rest) await pushTable(s);
      await pushTombstones();
      for (const s of SPECS) await pullTable(s, uid);
      await uploadFiles(); // los libros recién confirmados ya pueden subir su archivo
      setState({ status: 'ok', lastSync: Date.now() });
    } catch (e) {
      console.warn('Sync', e);
      setState({ status: navigator.onLine ? 'error' : 'offline', message: e instanceof Error ? e.message : String(e) });
    } finally {
      running = null;
      if (again) {
        again = false;
        scheduleSync(500);
      }
    }
  })();
  return running;
}

// Arranca y frena con la sesión.
if (supabase) {
  let interval: ReturnType<typeof setInterval> | undefined;
  const onFocus = () => document.visibilityState === 'visible' && scheduleSync(300);
  const onOnline = () => scheduleSync(300);

  supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user.id ?? null;
    if (next === userId) return;
    userId = next;
    clearInterval(interval);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onFocus);
    if (!userId) return setState({ status: 'off', lastSync: null, message: undefined });
    interval = setInterval(() => void syncNow(), 60_000);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onFocus);
    void syncNow();
  });
}
