import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { COLORS, type Labels } from '../lib/colors';
import { db, type Doc, type Folder, type Highlight } from '../lib/db';
import { grade, nextLabel, reviewQueue } from '../lib/review';
import { Link, navigate } from '../lib/router';
import { Icon } from './Icon';

interface Props {
  docs: Doc[];
  folders: Folder[];
  labels: Labels;
}

type Phase = 'pick' | 'session' | 'done';

export function Review({ docs, folders, labels }: Props) {
  const all = useLiveQuery(() => db.highlights.toArray(), []);
  const params = new URLSearchParams(location.search);
  const evalId = params.get('parcial');
  const evaluation = useLiveQuery(() => (evalId ? db.evaluations.get(evalId) : undefined), [evalId]);
  const [folder, setFolder] = useState(() => (evalId ? `eval:${evalId}` : params.get('carpeta') ?? 'all'));
  const [phase, setPhase] = useState<Phase>('pick');
  // La fila se arma al empezar: calificar una tarjeta no reordena el resto.
  const [queue, setQueue] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ knew: 0, again: 0 });

  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const inScopeOf = (scope: string) => (h: Highlight) => {
    const doc = docById.get(h.docId);
    if (!doc) return false;
    if (scope.startsWith('eval:')) return !!evaluation?.docIds.includes(doc.id);
    return scope === 'all' || (doc.folderId ?? 'none') === scope;
  };
  const inScope = inScopeOf(folder);
  const due = all ? reviewQueue(all.filter(inScope)) : [];
  const byId = useMemo(() => new Map((all ?? []).map((h) => [h.id, h])), [all]);
  const current = byId.get(queue[0]);

  const start = () => {
    setQueue(due.map((h) => h.id));
    setTally({ knew: 0, again: 0 });
    setRevealed(false);
    setPhase('session');
  };

  const answer = async (knew: boolean) => {
    if (!current) return;
    await db.highlights.update(current.id, { review: grade(current, knew) });
    setTally((t) => (knew ? { ...t, knew: t.knew + 1 } : { ...t, again: t.again + 1 }));
    // "Otra vez" la manda al final de la fila de esta sesión.
    const rest = queue.slice(1);
    const next = knew ? rest : [...rest, current.id];
    setQueue(next);
    setRevealed(false);
    if (!next.length) setPhase('done');
  };

  useEffect(() => {
    if (phase !== 'session') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && e.key === '1') void answer(false);
      else if (revealed && e.key === '2') void answer(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const scopes = [
    ...(evaluation ? [{ id: `eval:${evaluation.id}`, name: evaluation.title || 'Este parcial' }] : []),
    { id: 'all', name: 'Todo' },
    ...folders.map((f) => ({ id: f.id, name: f.name })),
    ...(docs.some((d) => !d.folderId) && folders.length ? [{ id: 'none', name: 'Sin carpeta' }] : []),
  ];
  const countIn = (id: string) => (all ? reviewQueue(all.filter(inScopeOf(id))).length : 0);

  return (
    <div className="review">
      <header className="review-head">
        <Link to="/apuntes" className="btn ghost sm">
          <Icon name="book" size={15} /> Mis apuntes
        </Link>
        {phase === 'session' && (
          <span className="muted tabular">
            {tally.knew + tally.again} hechas · {queue.length} en la fila
          </span>
        )}
      </header>

      {phase === 'pick' && (
        <section className="review-pick">
          <h1>Repaso</h1>
          <p className="muted">
            Tus subrayados como tarjetas. Intentá acordarte antes de mostrar el texto: los que sabés vuelven cada vez más
            espaciados, los que no, mañana.
          </p>
          <div className="folder-bar">
            {scopes.map((s) => (
              <button key={s.id} className={`folder-tab ${folder === s.id ? 'active' : ''}`} onClick={() => setFolder(s.id)}>
                {s.name} <span className="n">{countIn(s.id)}</span>
              </button>
            ))}
          </div>
          {due.length ? (
            <button className="btn primary big" onClick={start}>
              Repasar {due.length} {due.length === 1 ? 'tarjeta' : 'tarjetas'}
            </button>
          ) : (
            <div className="review-empty">
              <strong>{all && all.some(inScope) ? 'Al día: no hay nada para repasar hoy.' : 'Todavía no hay subrayados acá.'}</strong>
              <span className="muted">
                {all && all.some(inScope) ? 'Volvé mañana.' : 'Subrayá mientras leés y aparecen solos.'}
              </span>
            </div>
          )}
        </section>
      )}

      {phase === 'session' && current && (
        <section className="review-session">
          <div className="review-progress">
            <span style={{ width: `${((tally.knew + tally.again) / (tally.knew + tally.again + queue.length)) * 100}%` }} />
          </div>
          <article className="flashcard" style={{ '--c': COLORS[current.color].hex } as React.CSSProperties}>
            <div className="flashcard-meta">
              <span className="dot" />
              {labels[current.color]} · {docById.get(current.docId)?.name} · p. {current.page}
            </div>
            {current.note && <p className="flashcard-note">{current.note}</p>}
            <p className={`flashcard-text ${revealed ? 'shown' : ''}`} aria-hidden={!revealed}>
              {current.text}
            </p>
            {!revealed && <p className="muted flashcard-hint">¿Te acordás qué decía?</p>}
          </article>

          {revealed ? (
            <div className="review-actions">
              <button className="btn ghost big" onClick={() => void answer(false)}>
                Otra vez <kbd>1</kbd>
              </button>
              <button className="btn primary big" onClick={() => void answer(true)}>
                Lo sé · vuelve {nextLabel(Math.min((current.review?.box ?? 0) + 1, 5))} <kbd>2</kbd>
              </button>
            </div>
          ) : (
            <div className="review-actions">
              <button className="btn primary big" onClick={() => setRevealed(true)}>
                Mostrar <kbd>espacio</kbd>
              </button>
            </div>
          )}
          <button className="btn ghost sm review-open" onClick={() => navigate(`/apuntes/${current.docId}?h=${current.id}`)}>
            Ver en el PDF
          </button>
        </section>
      )}

      {phase === 'done' && (
        <section className="review-pick">
          <h1>¡Listo!</h1>
          <p className="muted">
            Repasaste {tally.knew} {tally.knew === 1 ? 'tarjeta' : 'tarjetas'}
            {tally.again ? ` (${tally.again} ${tally.again === 1 ? 'necesitó' : 'necesitaron'} otra vuelta)` : ''}. Las que sabés
            vuelven más adelante, cuando estés por olvidarlas.
          </p>
          <div className="review-actions">
            <Link to="/apuntes" className="btn primary big">
              Volver a mis apuntes
            </Link>
            <button className="btn ghost big" onClick={() => setPhase('pick')}>
              Elegir otra carpeta
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
