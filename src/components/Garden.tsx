import { useMemo, useState } from 'react';
import type { Doc } from '../lib/db';
import { progressOf } from '../lib/stats';

/** Número estable a partir del id del libro: la misma planta siempre crece igual. */
function seedFrom(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

interface PlantShape {
  height: number;
  lean: number;
  leaves: { at: number; side: 1 | -1; size: number }[];
  fruits: { at: number; side: 1 | -1; size: number }[];
}

function shapeFor(id: string): PlantShape {
  const rand = seedFrom(id);
  const height = 78 + rand() * 30;
  const lean = (rand() - 0.5) * 14;
  const leaves = Array.from({ length: 7 }, (_, i) => ({
    at: 0.16 + i * 0.115 + rand() * 0.04,
    side: (i % 2 ? 1 : -1) as 1 | -1,
    size: 0.8 + rand() * 0.4,
  }));
  const count = 1 + Math.floor(rand() * 3);
  const fruits = Array.from({ length: count }, (_, i) => ({
    at: 0.58 + i * 0.13 + rand() * 0.04,
    side: (i % 2 ? -1 : 1) as 1 | -1,
    size: 0.85 + rand() * 0.35,
  }));
  return { height, lean, leaves, fruits };
}

const GROUND = 128;

/** Una planta: brote (g≈0), crece con el % leído y da tomates cuando el libro está terminado. */
function Plant({ doc, pct }: { doc: Doc; pct: number }) {
  const shape = useMemo(() => shapeFor(doc.id), [doc.id]);
  const g = pct / 100;
  const done = pct >= 100;
  // Hasta un brote chiquito se ve: arranca en 18% de su altura.
  const h = shape.height * (0.18 + 0.82 * g);
  const top = { x: 40 + shape.lean * g, y: GROUND - h };
  const ctrl = { x: 40 - shape.lean * 0.6, y: GROUND - h * 0.55 };
  const point = (t: number) => {
    // Punto sobre la curva cuadrática del tallo.
    const u = 1 - t;
    return {
      x: u * u * 40 + 2 * u * t * ctrl.x + t * t * top.x,
      y: u * u * GROUND + 2 * u * t * ctrl.y + t * t * top.y,
    };
  };
  const leaves = shape.leaves.filter((l) => l.at <= 0.3 + g * 0.75);
  const fruits = done ? shape.fruits : g >= 0.75 ? shape.fruits.slice(0, 1) : [];

  return (
    <g className={`g-plant ${done ? 'done' : ''}`}>
      <title>{`${doc.name} · ${done ? 'terminado' : `${pct}% leído`}`}</title>
      <path d={`M40 ${GROUND} Q ${ctrl.x} ${ctrl.y} ${top.x} ${top.y}`} className="g-stem" />
      {g < 0.12 ? (
        // Brote recién nacido: dos hojitas.
        <>
          <path d={`M${top.x} ${top.y} q -9 -6 -13 1 q 7 4 13 -1z`} className="g-leaf" />
          <path d={`M${top.x} ${top.y} q 9 -6 13 1 q -7 4 -13 -1z`} className="g-leaf" />
        </>
      ) : (
        leaves.map((l, i) => {
          const p = point(l.at);
          const s = 15 * l.size;
          // Hoja compuesta: una grande y una chica, como las de la tomatera.
          return (
            <g key={i}>
              <path
                d={`M${p.x} ${p.y} q ${l.side * s * 0.45} ${-s * 1.05} ${l.side * s * 1.5} ${-s * 0.5} q ${-l.side * s * 0.45} ${s * 0.75} ${-l.side * s * 1.5} ${s * 0.5}z`}
                className="g-leaf"
              />
              <path
                d={`M${p.x} ${p.y} q ${-l.side * s * 0.25} ${-s * 0.6} ${-l.side * s * 0.75} ${-s * 0.35} q ${l.side * s * 0.25} ${s * 0.4} ${l.side * s * 0.75} ${s * 0.35}z`}
                className="g-leaf small"
              />
            </g>
          );
        })
      )}
      {fruits.map((f, i) => {
        const p = point(f.at);
        const r = (done ? 9 : 6) * f.size;
        const cx = p.x + f.side * (r + 2);
        const cy = p.y + r * 0.9;
        return (
          <g key={i} className={`g-fruit ${done ? 'ripe' : ''}`}>
            <path d={`M${p.x} ${p.y} Q ${cx} ${p.y - 1} ${cx} ${cy - r}`} className="g-stalk" />
            <ellipse cx={cx} cy={cy} rx={r * 1.08} ry={r} className="g-tomato" />
            <ellipse cx={cx - r * 0.35} cy={cy - r * 0.35} rx={r * 0.28} ry={r * 0.16} className="g-gloss" />
            <path d={`M${cx - r * 0.5} ${cy - r * 0.85} l ${r * 0.5} ${r * 0.3} l ${r * 0.5} ${-r * 0.3}`} className="g-calyx" />
          </g>
        );
      })}
    </g>
  );
}

const MAX_PLANTS = 28;

/** "Tu huerta": una tomatera por cada libro terminado; los que estás leyendo son brotes. */
export function Garden({ docs }: { docs: Doc[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const plants = useMemo(() => {
    const list = docs.map((doc) => ({ doc, pct: progressOf(doc) }));
    // Primero las tomateras (terminados), después los brotes más crecidos.
    return list.filter((p) => p.pct > 0).sort((a, b) => b.pct - a.pct || a.doc.addedAt - b.doc.addedAt);
  }, [docs]);
  const finished = plants.filter((p) => p.pct >= 100).length;
  const growing = plants.length - finished;
  const shown = plants.slice(0, MAX_PLANTS);
  const hovered = shown.find((p) => p.doc.id === hover);

  return (
    <footer className="garden" aria-label="Tu huerta">
      <div className="garden-inner">
        <div className="garden-caption">
          <strong>Tu huerta</strong>
          <span className="muted">
            {plants.length === 0
              ? 'Empezá un libro y aparece tu primer brote'
              : `${finished} ${finished === 1 ? 'tomatera' : 'tomateras'} · ${growing} ${growing === 1 ? 'brote' : 'brotes'}`}
          </span>
        </div>

        <div className="garden-bed">
          {shown.length === 0 ? (
            <svg viewBox="0 0 80 132" className="garden-plant empty" aria-hidden="true">
              <ellipse cx="40" cy="129" rx="7" ry="3" className="g-seed" />
            </svg>
          ) : (
            shown.map(({ doc, pct }, i) => (
              <svg
                key={doc.id}
                viewBox="0 0 80 132"
                className="garden-plant"
                style={{ animationDelay: `${i * 60}ms` }}
                onMouseEnter={() => setHover(doc.id)}
                onMouseLeave={() => setHover(null)}
                role="img"
                aria-label={`${doc.name}: ${pct >= 100 ? 'terminado' : `${pct}% leído`}`}
              >
                <Plant doc={doc} pct={pct} />
              </svg>
            ))
          )}
          {plants.length > MAX_PLANTS && <span className="garden-more muted">+{plants.length - MAX_PLANTS}</span>}
        </div>
        <div className="garden-ground" />
        <p className="garden-hover muted" aria-live="polite">
          {hovered ? `${hovered.doc.name} · ${hovered.pct >= 100 ? 'terminado' : `${hovered.pct}% leído`}` : ' '}
        </p>
      </div>
    </footer>
  );
}
