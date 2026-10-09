import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import type { Pomodoro } from '../hooks/usePomodoro';
import { exportBackup, importBackup } from '../lib/backup';
import { daysUntil, whenLabel } from '../lib/dates';
import { createEvaluation, createFolder, db, deleteDoc, deleteFolder, EVAL_KINDS, type Doc, type Evaluation, type Folder } from '../lib/db';
import { sortEvaluations } from '../lib/evaluations';
import { reviewQueue } from '../lib/review';
import { downloadBlob } from '../lib/files';
import { Link, navigate } from '../lib/router';
import { Icon } from './Icon';
import { TomatoTimer } from './Pomodoro';
import { toast } from './Toast';

/** 'all' = Todos, 'none' = Sin carpeta, o el id de una carpeta. */
export type FolderView = 'all' | 'none' | string;

interface Props {
  docs: Doc[];
  folders: Folder[];
  view: FolderView;
  onView: (v: FolderView) => void;
  pomo: Pomodoro;
  onOpen: (id: string) => void;
  onUpload: () => void;
}

const DOC_MIME = 'text/x-apuntes-doc';

export function Library({ docs, folders, view, onView, pomo, onOpen, onUpload }: Props) {
  const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const sortedDocs = [...docs].sort((a, b) => b.openedAt - a.openedAt);
  const inFolder = (id: string | null) => sortedDocs.filter((d) => (d.folderId ?? null) === id);
  const loose = inFolder(null);
  const current = sortedFolders.find((f) => f.id === view);

  const moveTo = async (docId: string, folderId: string | null) => {
    await db.docs.update(docId, { folderId });
    const name = folderId ? folders.find((f) => f.id === folderId)?.name : 'Sin carpeta';
    toast(`Movido a ${name}`);
  };

  const shown = view === 'all' ? sortedDocs : inFolder(view === 'none' ? null : view);

  const highlights = useLiveQuery(() => db.highlights.toArray(), [], []);
  const docIds = new Set(docs.map((d) => d.id));
  const dueCount = reviewQueue(highlights.filter((h) => docIds.has(h.docId))).length;
  const evaluations = useLiveQuery(() => db.evaluations.toArray(), [], []);
  const { upcoming } = sortEvaluations(evaluations);
  /** Lo próximo a rendir de cada carpeta. */
  const nextEval = new Map<string, Evaluation>();
  for (const ev of upcoming) if (ev.folderId && !nextEval.has(ev.folderId)) nextEval.set(ev.folderId, ev);

  return (
    <div className="home">
      <header className="page-head">
        <h1>Mis apuntes</h1>
        <div className="head-actions">
          {current && dueCount > 0 && (
            <Link to={`/repaso?carpeta=${current.id}`} className="btn ghost">
              <Icon name="cards" size={16} /> Repasar {current.name}
            </Link>
          )}
          <BackupMenu />
          <button className="btn primary" onClick={onUpload}>
            <Icon name="upload" size={16} /> Subir PDF{current ? ` a ${current.name}` : ''}
          </button>
        </div>
      </header>

      <div className="home-grid">
        <section className="timer-card" aria-labelledby="timer-title">
          <h2 id="timer-title" className="step">
            <span>1</span> Seleccioná tu tiempo
          </h2>
          <TomatoTimer pomo={pomo} />
        </section>

        <section className="shelf" aria-labelledby="shelf-title">
          <h2 id="shelf-title" className="step">
            <span>2</span> Elegí qué leer
          </h2>

          <FolderBar
            folders={sortedFolders}
            counts={Object.fromEntries(sortedFolders.map((f) => [f.id, inFolder(f.id).length]))}
            total={docs.length}
            looseCount={loose.length}
            view={view}
            onView={onView}
            onDropDoc={moveTo}
            nextEval={nextEval}
          />

          {current && (
            <FolderHeader
              folder={current}
              count={shown.length}
              onDeleted={() => onView('all')}
              extra={<FolderEval folder={current} next={nextEval.get(current.id)} docIds={shown.map((d) => d.id)} />}
            />
          )}

          {docs.length === 0 ? (
            <button className="dropzone" onClick={onUpload}>
              <Icon name="upload" size={28} />
              <strong>Subí tus apuntes de clase</strong>
              <span className="muted">Arrastrá PDFs acá o hacé clic. Quedan guardados en este navegador.</span>
            </button>
          ) : view === 'all' && folders.length > 0 ? (
            <>
              {sortedFolders
                .filter((f) => inFolder(f.id).length)
                .map((f) => (
                  <div key={f.id} className="shelf-group">
                    <button className="shelf-subject" onClick={() => onView(f.id)}>
                      <Icon name="folder" size={14} /> {f.name}
                    </button>
                    <Books docs={inFolder(f.id)} folders={sortedFolders} onOpen={onOpen} onMove={moveTo} />
                  </div>
                ))}
              {loose.length > 0 && (
                <div className="shelf-group">
                  <button className="shelf-subject" onClick={() => onView('none')}>
                    Sin carpeta
                  </button>
                  <Books docs={loose} folders={sortedFolders} onOpen={onOpen} onMove={moveTo} />
                </div>
              )}
            </>
          ) : shown.length ? (
            <Books docs={shown} folders={sortedFolders} onOpen={onOpen} onMove={moveTo} />
          ) : (
            <button className="dropzone small" onClick={onUpload}>
              <Icon name="folder" size={24} />
              <strong>Carpeta vacía</strong>
              <span className="muted">Arrastrá libros a la carpeta desde "Todos" o subí PDFs directo acá.</span>
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

function FolderBar({
  folders,
  counts,
  total,
  looseCount,
  view,
  onView,
  onDropDoc,
  nextEval,
}: {
  folders: Folder[];
  counts: Record<string, number>;
  total: number;
  looseCount: number;
  view: FolderView;
  onView: (v: FolderView) => void;
  onDropDoc: (docId: string, folderId: string | null) => void;
  nextEval: Map<string, Evaluation>;
}) {
  const [creating, setCreating] = useState(false);
  const [over, setOver] = useState<string | null>(null);

  const dropProps = (target: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DOC_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver(target ?? 'none');
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData(DOC_MIME);
      setOver(null);
      if (id) {
        e.preventDefault();
        onDropDoc(id, target);
      }
    },
  });

  return (
    <nav className="folder-bar" aria-label="Carpetas">
      <button className={`folder-tab ${view === 'all' ? 'active' : ''}`} onClick={() => onView('all')}>
        Todos <span className="n">{total}</span>
      </button>
      {folders.map((f) => (
        <button
          key={f.id}
          className={`folder-tab ${view === f.id ? 'active' : ''} ${over === f.id ? 'drop' : ''}`}
          onClick={() => onView(f.id)}
          {...dropProps(f.id)}
        >
          <Icon name="folder" size={14} />
          {f.name} <span className="n">{counts[f.id] ?? 0}</span>
          <ExamBadge ev={nextEval.get(f.id)} />
        </button>
      ))}
      {folders.length > 0 && looseCount > 0 && (
        <button
          className={`folder-tab ${view === 'none' ? 'active' : ''} ${over === 'none' ? 'drop' : ''}`}
          onClick={() => onView('none')}
          {...dropProps(null)}
        >
          Sin carpeta <span className="n">{looseCount}</span>
        </button>
      )}
      {creating ? (
        <input
          className="folder-tab folder-input"
          autoFocus
          placeholder="Nombre de la carpeta"
          onBlur={() => setCreating(false)}
          onKeyDown={async (e) => {
            if (e.key === 'Escape') setCreating(false);
            if (e.key === 'Enter') {
              const name = e.currentTarget.value.trim();
              setCreating(false);
              if (!name) return;
              const folder = await createFolder(name);
              onView(folder.id);
            }
          }}
        />
      ) : (
        <button className="folder-tab new" onClick={() => setCreating(true)}>
          <Icon name="plus" size={14} /> Nueva carpeta
        </button>
      )}
    </nav>
  );
}

function FolderHeader({
  folder,
  count,
  onDeleted,
  extra,
}: {
  folder: Folder;
  count: number;
  onDeleted: () => void;
  extra: React.ReactNode;
}) {
  const [renaming, setRenaming] = useState(false);

  const remove = async () => {
    const msg = count
      ? `¿Borrar la carpeta "${folder.name}"? Sus ${count} apuntes no se borran: quedan en "Sin carpeta".`
      : `¿Borrar la carpeta "${folder.name}"?`;
    if (!confirm(msg)) return;
    await deleteFolder(folder.id);
    onDeleted();
    toast('Carpeta borrada');
  };

  return (
    <div className="folder-head">
      {renaming ? (
        <input
          className="folder-rename"
          autoFocus
          defaultValue={folder.name}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== folder.name) void db.folders.update(folder.id, { name });
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <h3 onDoubleClick={() => setRenaming(true)}>{folder.name}</h3>
      )}
      <span className="muted">
        {count} {count === 1 ? 'apunte' : 'apuntes'}
      </span>
      {extra}
      <div className="folder-head-actions">
        <button className="icon-btn xs" onClick={() => setRenaming(true)} title="Renombrar carpeta">
          <Icon name="pencil" size={14} />
        </button>
        <button className="icon-btn xs" onClick={remove} title="Borrar carpeta">
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}

function Books({
  docs,
  folders,
  onOpen,
  onMove,
}: {
  docs: Doc[];
  folders: Folder[];
  onOpen: (id: string) => void;
  onMove: (docId: string, folderId: string | null) => void;
}) {
  return (
    <div className="books">
      {docs.map((d) => (
        <Book key={d.id} doc={d} folders={folders} onOpen={() => onOpen(d.id)} onMove={(f) => onMove(d.id, f)} />
      ))}
    </div>
  );
}

function Book({
  doc,
  folders,
  onOpen,
  onMove,
}: {
  doc: Doc;
  folders: Folder[];
  onOpen: () => void;
  onMove: (folderId: string | null) => void;
}) {
  const count = useLiveQuery(() => db.highlights.where('docId').equals(doc.id).count(), [doc.id], 0);
  // Libro que vino de otro dispositivo y todavía no se bajó a este.
  const local = useLiveQuery(async () => !!(await db.files.get(doc.id)), [doc.id], true);
  const pct = doc.pages && doc.lastPage > 1 ? Math.round((doc.lastPage / doc.pages) * 100) : 0;
  const [menu, setMenu] = useState(false);
  const [dragging, setDragging] = useState(false);

  const rename = () => {
    const value = prompt('Nuevo nombre', doc.name);
    if (value?.trim()) void db.docs.update(doc.id, { name: value.trim() });
  };
  const remove = async () => {
    if (!confirm(`¿Borrar "${doc.name}" y sus ${count} subrayados de la app? El archivo original no se toca.`)) return;
    await deleteDoc(doc.id);
    toast('PDF borrado');
  };

  return (
    <article
      className={`book ${dragging ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DOC_MIME, doc.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <button className="cover" onClick={onOpen} title={`Leer ${doc.name}`}>
        {doc.thumb ? <img src={doc.thumb} alt="" draggable={false} /> : <span className="cover-fallback">{doc.name}</span>}
        <span className="cover-progress" style={{ width: `${pct}%` }} />
        <span className="cover-cta">{local ? 'Leer' : 'Bajar y leer'}</span>
        {!local && (
          <span className="cloud-badge" title="Está en tu nube; se baja al abrirlo">
            <Icon name="download" size={12} />
          </span>
        )}
      </button>
      <div className="book-info">
        <h4 title={doc.name}>{doc.name}</h4>
        <div className="book-meta muted tabular">
          {doc.lastPage > 1 ? `p. ${doc.lastPage}/${doc.pages}` : `${doc.pages} págs.`}
          {count > 0 && ` · ${count} subr.`}
        </div>
      </div>
      <div className={`book-actions ${menu ? 'open' : ''}`}>
        <button className="icon-btn xs" onClick={() => setMenu(!menu)} title="Mover a carpeta" aria-expanded={menu}>
          <Icon name="folder" size={14} />
        </button>
        <button className="icon-btn xs" onClick={rename} title="Renombrar">
          <Icon name="pencil" size={14} />
        </button>
        <button className="icon-btn xs" onClick={remove} title="Borrar">
          <Icon name="trash" size={14} />
        </button>
        {menu && <MoveMenu doc={doc} folders={folders} onMove={onMove} onClose={() => setMenu(false)} />}
      </div>
    </article>
  );
}

function MoveMenu({
  doc,
  folders,
  onMove,
  onClose,
}: {
  doc: Doc;
  folders: Folder[];
  onMove: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const pick = (id: string | null) => {
    if (id !== (doc.folderId ?? null)) onMove(id);
    onClose();
  };

  return (
    <div className="menu" ref={ref} role="menu">
      <div className="menu-title">Mover a</div>
      {folders.map((f) => (
        <button key={f.id} role="menuitem" className={doc.folderId === f.id ? 'current' : ''} onClick={() => pick(f.id)}>
          <Icon name="folder" size={14} /> {f.name}
        </button>
      ))}
      <button role="menuitem" className={!doc.folderId ? 'current' : ''} onClick={() => pick(null)}>
        Sin carpeta
      </button>
      {creating ? (
        <input
          autoFocus
          placeholder="Nueva carpeta"
          onKeyDown={async (e) => {
            if (e.key === 'Escape') setCreating(false);
            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
              const folder = await createFolder(e.currentTarget.value);
              pick(folder.id);
            }
          }}
        />
      ) : (
        <button role="menuitem" className="new" onClick={() => setCreating(true)}>
          <Icon name="plus" size={14} /> Nueva carpeta…
        </button>
      )}
    </div>
  );
}

function BackupMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const doExport = async () => {
    setBusy('Armando la copia…');
    try {
      const { blob, filename, docs, highlights } = await exportBackup();
      downloadBlob(blob, filename);
      toast(`Copia lista: ${docs} PDFs y ${highlights} subrayados`);
    } catch {
      toast('No se pudo armar la copia');
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  const doImport = async (file: File) => {
    setBusy('Restaurando…');
    try {
      const r = await importBackup(file);
      toast(`Restaurados ${r.docs} PDFs y ${r.highlights} subrayados${r.skipped ? ` (${r.skipped} sin archivo)` : ''}`);
      // Los ajustes (etiquetas, sonidos, pomodoro…) se leen al cargar la página.
      setTimeout(() => location.reload(), 1600);
    } catch (e) {
      toast(e instanceof Error && e.message.includes('Tomapuntes') ? e.message : 'No se pudo leer esa copia');
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  return (
    <div className="backup" ref={ref}>
      <button className={`icon-btn ${open ? 'active' : ''}`} onClick={() => setOpen(!open)} title="Copia de seguridad">
        <Icon name="archive" />
      </button>
      {open && (
        <div className="menu backup-menu" role="menu">
          <div className="menu-title">Copia de seguridad</div>
          {busy ? (
            <p className="muted backup-busy">{busy}</p>
          ) : (
            <>
              <button role="menuitem" onClick={doExport}>
                <Icon name="download" size={14} /> Exportar todo (.zip)
              </button>
              <button role="menuitem" onClick={() => input.current?.click()}>
                <Icon name="upload" size={14} /> Importar una copia…
              </button>
              <p className="muted backup-note">
                Incluye PDFs, subrayados, notas, carpetas, estadísticas y ajustes. Guardala en iCloud o Drive.
              </p>
            </>
          )}
          <input
            ref={input}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void doImport(file);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ExamBadge({ ev }: { ev?: Evaluation }) {
  if (!ev) return null;
  const days = daysUntil(ev.date);
  if (days < 0 || days > 60) return null;
  return (
    <span className={`exam-badge ${days <= 7 ? 'soon' : ''}`} title={`${EVAL_KINDS[ev.kind]} ${whenLabel(days)}`}>
      {days === 0 ? 'hoy' : `${days}d`}
    </span>
  );
}

/** En el encabezado de la carpeta: lo próximo que se rinde de esa materia, o un atajo para anotarlo. */
function FolderEval({ folder, next, docIds }: { folder: Folder; next?: Evaluation; docIds: string[] }) {
  if (next) {
    const days = daysUntil(next.date);
    return (
      <Link to={`/parciales/${next.id}`} className={`exam-chip ${days <= 7 ? 'soon' : ''}`}>
        <Icon name="calendar" size={14} /> {EVAL_KINDS[next.kind]} {whenLabel(days)}
      </Link>
    );
  }
  return (
    <button
      className="btn ghost sm exam-add"
      onClick={async () => {
        const ev = await createEvaluation({ folderId: folder.id, title: `Parcial de ${folder.name}`, docIds });
        navigate(`/parciales/${ev.id}`);
      }}
    >
      <Icon name="calendar" size={14} /> Anotar parcial o TP
    </button>
  );
}
