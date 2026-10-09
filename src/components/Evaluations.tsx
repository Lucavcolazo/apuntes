import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { daysUntil, whenLabel } from '../lib/dates';
import {
  createEvaluation,
  db,
  EVAL_KINDS,
  uid,
  type Doc,
  type EvalKind,
  type Evaluation,
  type Folder,
} from '../lib/db';
import { evalStatus, sortEvaluations } from '../lib/evaluations';
import { Link, navigate } from '../lib/router';
import { pagesRead, progressOf } from '../lib/stats';
import { Icon } from './Icon';
import { EvalCalendar } from './EvalCalendar';
import { useLocalState } from '../lib/storage';
import { toast } from './Toast';

interface Props {
  evalId: string | null;
  docs: Doc[];
  folders: Folder[];
  onOpenDoc: (id: string) => void;
}

const prettyDate = (date: string) =>
  new Date(`${date}T12:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

export function Evaluations({ evalId, docs, folders, onOpenDoc }: Props) {
  const evaluations = useLiveQuery(() => db.evaluations.toArray());
  const current = evalId ? evaluations?.find((e) => e.id === evalId) : null;
  const [savedView, setView] = useLocalState<'list' | 'calendar'>('apuntes.evalView', 'list');
  // ?vista=calendario (desde la entrada) abre directo el calendario.
  const view = new URLSearchParams(location.search).get('vista') === 'calendario' ? 'calendar' : savedView;

  // Un link a un parcial borrado vuelve a la lista.
  useEffect(() => {
    if (evalId && evaluations && !current) navigate('/parciales', { replace: true });
  }, [evalId, evaluations, current]);

  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name;

  const create = async () => {
    const ev = await createEvaluation();
    navigate(`/parciales/${ev.id}`);
  };

  return (
    <div className="home">
      <header className="page-head">
        <h1>Parciales y TPs</h1>
        <div className="head-actions">
          <button className="btn primary" onClick={() => void create()}>
            <Icon name="plus" size={16} /> Nuevo parcial o TP
          </button>
        </div>
      </header>

      {current ? (
        <EvaluationDetail
          key={current.id}
          ev={current}
          docs={docs}
          folders={folders}
          status={evalStatus(current, docs)}
          onOpenDoc={onOpenDoc}
        />
      ) : !evaluations ? null : evaluations.length === 0 ? (
        <button className="dropzone" onClick={() => void create()}>
          <Icon name="calendar" size={28} />
          <strong>Anotá tu primer parcial o TP</strong>
          <span className="muted">Le ponés fecha, vas dejando notas y conectás los apuntes que entran.</span>
        </button>
      ) : (
        <>
          <div className="mode-tabs view-toggle" role="tablist" aria-label="Vista">
            {(['list', 'calendar'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                className={view === v ? 'active' : ''}
                onClick={() => {
                  setView(v);
                  if (location.search) navigate('/parciales', { replace: true });
                }}
              >
                {v === 'list' ? 'Lista' : 'Calendario'}
              </button>
            ))}
          </div>
          {view === 'calendar' ? (
            <EvalCalendar evaluations={evaluations} folders={folders} />
          ) : (
            <EvaluationList evaluations={evaluations} folderName={folderName} docs={docs} />
          )}
        </>
      )}
    </div>
  );
}

function EvaluationList({
  evaluations,
  folderName,
  docs,
}: {
  evaluations: Evaluation[];
  folderName: (id: string | null) => string | undefined;
  docs: Doc[];
}) {
  const { upcoming, past } = sortEvaluations(evaluations);
  const card = (ev: Evaluation) => {
    const st = evalStatus(ev, docs);
    const finished = ev.done || st.days < 0;
    return (
      <Link key={ev.id} to={`/parciales/${ev.id}`} className={`eval-card ${finished ? 'finished' : ''} ${!finished && st.days <= 7 ? 'soon' : ''}`}>
        <div className="eval-when">
          {finished ? (
            <Icon name={ev.done ? 'check' : 'calendar'} size={20} />
          ) : (
            <>
              <span className="exam-days tabular">{st.days === 0 ? '¡Hoy!' : st.days}</span>
              {st.days > 0 && <span className="muted">{st.days === 1 ? 'día' : 'días'}</span>}
            </>
          )}
        </div>
        <div className="eval-body">
          <div className="eval-top">
            <span className={`kind kind-${ev.kind}`}>{EVAL_KINDS[ev.kind]}</span>
            <strong>{ev.title || 'Sin título'}</strong>
          </div>
          <span className="muted eval-meta">
            {prettyDate(ev.date)}
            {folderName(ev.folderId) && ` · ${folderName(ev.folderId)}`}
            {st.docs.length > 0 && ` · ${st.docs.length} ${st.docs.length === 1 ? 'apunte' : 'apuntes'}`}
            {st.notesOpen > 0 && ` · ${st.notesOpen} ${st.notesOpen === 1 ? 'pendiente' : 'pendientes'}`}
          </span>
          {st.totalPages > 0 && !finished && (
            <span className="meter eval-meter" aria-label={`${st.readPct}% leído`}>
              <span style={{ width: `${st.readPct}%` }} />
            </span>
          )}
        </div>
        {!finished && st.totalPages > 0 && <span className="progress-pct tabular">{st.readPct}%</span>}
      </Link>
    );
  };

  return (
    <div className="eval-list">
      {upcoming.length > 0 && (
        <>
          <h3 className="shelf-subject">Lo que viene</h3>
          {upcoming.map(card)}
        </>
      )}
      {past.length > 0 && (
        <>
          <h3 className="shelf-subject eval-past-title">Ya pasaron o entregados</h3>
          {past.map(card)}
        </>
      )}
    </div>
  );
}

function EvaluationDetail({
  ev,
  docs,
  folders,
  status,
  onOpenDoc,
}: {
  ev: Evaluation;
  docs: Doc[];
  folders: Folder[];
  status: ReturnType<typeof evalStatus>;
  onOpenDoc: (id: string) => void;
}) {
  const [title, setTitle] = useState(ev.title);
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState(false);
  const save = (changes: Partial<Evaluation>) => void db.evaluations.update(ev.id, changes);

  // El título se guarda mientras escribís, con una pequeña demora.
  useEffect(() => {
    if (title === ev.title) return;
    const t = setTimeout(() => save({ title }), 400);
    return () => clearTimeout(t);
  }, [title, ev.title, ev.id]);

  const addNote = () => {
    const text = draft.trim();
    if (!text) return;
    save({ notes: [...ev.notes, { id: uid(), text, done: false, at: Date.now() }] });
    setDraft('');
  };

  const remove = async () => {
    if (!confirm(`¿Borrar "${ev.title || EVAL_KINDS[ev.kind]}"? Los apuntes conectados no se borran.`)) return;
    await db.evaluations.delete(ev.id);
    navigate('/parciales');
    toast('Borrado');
  };

  const days = daysUntil(ev.date);
  const kinds = Object.entries(EVAL_KINDS) as [EvalKind, string][];

  return (
    <div className="eval-detail">
      <Link to="/parciales" className="btn ghost sm eval-back">
        ← Todos los parciales
      </Link>

      <section className="card eval-head">
        <div className="eval-kinds" role="radiogroup" aria-label="Tipo">
          {kinds.map(([k, label]) => (
            <button key={k} role="radio" aria-checked={ev.kind === k} className={`kind kind-${k} ${ev.kind === k ? 'on' : ''}`} onClick={() => save({ kind: k })}>
              {label}
            </button>
          ))}
        </div>
        <input
          className="eval-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={ev.kind === 'tp' ? 'Ej.: TP 2 – Redes de Petri' : 'Ej.: Primer parcial'}
          autoFocus={!ev.title}
        />
        <div className="eval-fields">
          <label>
            <span>Fecha</span>
            <input type="date" value={ev.date} onChange={(e) => e.target.value && save({ date: e.target.value })} />
          </label>
          <label>
            <span>Materia</span>
            <select value={ev.folderId ?? ''} onChange={(e) => save({ folderId: e.target.value || null })}>
              <option value="">Sin materia</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="check eval-done">
            <input type="checkbox" checked={ev.done} onChange={(e) => save({ done: e.target.checked })} />
            {ev.kind === 'tp' || ev.kind === 'otro' ? 'Entregado' : 'Ya lo rendí'}
          </label>
        </div>

        <div className="eval-summary">
          <div>
            <span className="hero-number">{ev.done ? '✓' : days < 0 ? '—' : days === 0 ? '¡Hoy!' : days}</span>
            <span className="muted">
              {ev.done ? 'Listo' : days < 0 ? 'Ya pasó' : days === 0 ? 'Es hoy' : `${days === 1 ? 'día' : 'días'} · ${whenLabel(days)}`}
            </span>
          </div>
          {status.totalPages > 0 && (
            <div>
              <span className="tile-value tabular">{status.readPct}%</span>
              <span className="muted">
                leído
                {status.pagesLeft > 0 && days > 0 && !ev.done ? ` · ${status.perDay} pág./día para llegar` : ''}
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="eval-columns">
        <section className="card">
          <h3>Notas</h3>
          <p className="muted card-sub">Temas que entran, consignas, lo que dijo el profe. Tildalas cuando las tengas.</p>
          <form
            className="note-add"
            onSubmit={(e) => {
              e.preventDefault();
              addNote();
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Agregar una nota…" />
            <button className="btn primary sm" disabled={!draft.trim()}>
              Agregar
            </button>
          </form>
          <ul className="note-list">
            {ev.notes.map((n) => (
              <li key={n.id} className={n.done ? 'done' : ''}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={n.done}
                    onChange={(e) =>
                      save({ notes: ev.notes.map((x) => (x.id === n.id ? { ...x, done: e.target.checked } : x)) })
                    }
                  />
                  <span>{n.text}</span>
                </label>
                <span className="muted note-date">
                  {new Date(n.at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                </span>
                <button className="icon-btn xs" title="Borrar nota" onClick={() => save({ notes: ev.notes.filter((x) => x.id !== n.id) })}>
                  <Icon name="x" size={13} />
                </button>
              </li>
            ))}
            {!ev.notes.length && <li className="muted note-empty">Todavía no hay notas.</li>}
          </ul>
        </section>

        <section className="card">
          <div className="card-title-row">
            <h3>Apuntes que entran</h3>
            <button className="btn ghost sm" onClick={() => setPicking(true)}>
              <Icon name="plus" size={14} /> Conectar
            </button>
          </div>
          {status.docs.length === 0 ? (
            <div className="card-empty">
              <p className="muted">Conectá los PDFs que entran y vas a ver cuánto te falta leer.</p>
              <button className="btn primary sm" onClick={() => setPicking(true)}>
                Conectar apuntes
              </button>
            </div>
          ) : (
            <ul className="progress-list">
              {status.docs.map((d) => {
                const pct = progressOf(d);
                return (
                  <li key={d.id} className="linked-doc">
                    <button className="progress-row" onClick={() => onOpenDoc(d.id)}>
                      <span className="mini-cover">{d.thumb && <img src={d.thumb} alt="" />}</span>
                      <span className="progress-body">
                        <span className="progress-title">{d.name}</span>
                        <span className="muted progress-meta">
                          {pagesRead(d) ? `p. ${pagesRead(d)}/${d.pages}` : `Sin abrir · ${d.pages} págs.`}
                        </span>
                        <span className="meter">
                          <span style={{ width: `${pct}%` }} />
                        </span>
                      </span>
                      <span className="progress-pct tabular">{pct}%</span>
                    </button>
                    <button
                      className="icon-btn xs unlink"
                      title="Desconectar"
                      onClick={() => save({ docIds: ev.docIds.filter((x) => x !== d.id) })}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <button className="btn ghost sm danger eval-delete" onClick={() => void remove()}>
        <Icon name="trash" size={14} /> Borrar {EVAL_KINDS[ev.kind].toLowerCase()}
      </button>

      {picking && (
        <DocPicker
          docs={docs}
          folders={folders}
          selected={ev.docIds}
          preferFolder={ev.folderId}
          onClose={() => setPicking(false)}
          onSave={(ids) => {
            save({ docIds: ids });
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

/** Elegir qué apuntes entran: los de la misma materia aparecen primero. */
function DocPicker({
  docs,
  folders,
  selected,
  preferFolder,
  onClose,
  onSave,
}: {
  docs: Doc[];
  folders: Folder[];
  selected: string[];
  preferFolder: string | null;
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState(() => new Set(selected));
  const groups = [
    ...folders
      .slice()
      .sort((a, b) => Number(b.id === preferFolder) - Number(a.id === preferFolder) || a.name.localeCompare(b.name, 'es'))
      .map((f) => ({ id: f.id, name: f.name, docs: docs.filter((d) => d.folderId === f.id) })),
    { id: 'none', name: 'Sin carpeta', docs: docs.filter((d) => !d.folderId) },
  ].filter((g) => g.docs.length);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" role="dialog" aria-label="Conectar apuntes" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>¿Qué apuntes entran?</h3>
          <button className="icon-btn sm" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="picker-list">
          {!docs.length && <p className="muted">Todavía no subiste apuntes.</p>}
          {groups.map((g) => {
            const all = g.docs.every((d) => picked.has(d.id));
            return (
              <div key={g.id} className="picker-group">
                <div className="picker-group-head">
                  <span className="shelf-subject">{g.name}</span>
                  <button
                    className="link-btn"
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        g.docs.forEach((d) => (all ? next.delete(d.id) : next.add(d.id)));
                        return next;
                      })
                    }
                  >
                    {all ? 'Ninguno' : 'Todos'}
                  </button>
                </div>
                {g.docs.map((d) => (
                  <label key={d.id} className={`picker-item ${picked.has(d.id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
                    <span className="mini-cover">{d.thumb && <img src={d.thumb} alt="" />}</span>
                    <span className="picker-name">{d.name}</span>
                    <span className="muted tabular">{d.pages} p.</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <footer>
          <span className="muted">
            {picked.size} {picked.size === 1 ? 'apunte' : 'apuntes'}
          </span>
          <button className="btn primary" onClick={() => onSave([...picked])}>
            Listo
          </button>
        </footer>
      </div>
    </div>
  );
}
