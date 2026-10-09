import { useState } from 'react';
import { daysUntil } from '../lib/dates';
import { createEvaluation, db, EVAL_KINDS, type Doc, type Evaluation, type Folder } from '../lib/db';
import { evalStatus } from '../lib/evaluations';
import { Link, navigate } from '../lib/router';
import { Icon } from './Icon';

interface Props {
  evaluations: Evaluation[];
  docs: Doc[];
  folders: Folder[];
}

function whenText(days: number, kind: Evaluation['kind']) {
  const deliver = kind === 'tp' || kind === 'otro';
  if (days < 0) return `${deliver ? 'Venció' : 'Fue'} hace ${-days} ${days === -1 ? 'día' : 'días'}`;
  if (days === 0) return deliver ? 'Se entrega hoy' : 'Es hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
}

/** Parciales y TPs pendientes, ordenados por fecha, para ir tildando. */
export function EvalChecklist({ evaluations, docs, folders }: Props) {
  // Lo que tildás en esta visita queda tachado a la vista (no desaparece de golpe).
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const folderName = new Map(folders.map((f) => [f.id, f.name]));

  const items = evaluations
    // Pendientes, incluidos los vencidos de la última semana (un TP atrasado sigue siendo pendiente).
    .filter((e) => justDone.has(e.id) || (!e.done && daysUntil(e.date) >= -7))
    .sort((a, b) => a.date.localeCompare(b.date));

  const toggle = (ev: Evaluation) => {
    const done = !ev.done;
    void db.evaluations.update(ev.id, { done });
    setJustDone((prev) => {
      const next = new Set(prev);
      if (done) next.add(ev.id);
      else next.delete(ev.id);
      return next;
    });
  };

  return (
    <article className="card checklist-card">
      <div className="card-title-row">
        <h3>Lo que viene</h3>
        <div className="row-actions">
          <Link to="/parciales?vista=calendario" className="btn ghost sm">
            <Icon name="calendar" size={14} /> Calendario
          </Link>
          <button
            className="btn ghost sm"
            onClick={async () => navigate(`/parciales/${(await createEvaluation()).id}`)}
          >
            <Icon name="plus" size={14} /> Agregar
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card-empty">
          <p className="muted">
            {evaluations.length ? 'Nada pendiente. ¡Bien ahí!' : 'Anotá tus parciales y TPs para tenerlos a mano acá.'}
          </p>
        </div>
      ) : (
        <ul className="checklist">
          {items.map((ev) => {
            const days = daysUntil(ev.date);
            const st = evalStatus(ev, docs);
            const late = !ev.done && days < 0;
            return (
              <li key={ev.id} className={`${ev.done ? 'done' : ''} ${late ? 'late' : ''} ${!ev.done && days >= 0 && days <= 3 ? 'urgent' : ''}`}>
                <input
                  type="checkbox"
                  checked={ev.done}
                  onChange={() => toggle(ev)}
                  aria-label={`Marcar "${ev.title || EVAL_KINDS[ev.kind]}" como ${ev.kind === 'tp' ? 'entregado' : 'hecho'}`}
                />
                <div className="check-date">
                  <span className="check-day tabular">{new Date(`${ev.date}T12:00`).getDate()}</span>
                  <span className="check-month">
                    {new Date(`${ev.date}T12:00`).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')}
                  </span>
                </div>
                <Link to={`/parciales/${ev.id}`} className="check-body">
                  <span className="check-top">
                    <span className={`kind kind-${ev.kind}`}>{EVAL_KINDS[ev.kind]}</span>
                    <strong>{ev.title || 'Sin título'}</strong>
                  </span>
                  <span className="muted check-meta">
                    {whenText(days, ev.kind)}
                    {ev.folderId && folderName.get(ev.folderId) ? ` · ${folderName.get(ev.folderId)}` : ''}
                    {st.totalPages > 0 && ` · ${st.readPct}% leído`}
                    {st.notesOpen > 0 && ` · ${st.notesOpen} ${st.notesOpen === 1 ? 'nota' : 'notas'}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
