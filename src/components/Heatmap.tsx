import { useEffect, useMemo, useRef, useState } from 'react';
import { dayKey, formatDuration } from '../lib/dates';

/** Minutos que separan cada nivel: fijos, para que un color signifique siempre lo mismo. */
const LEVELS = [
  { min: 1, label: 'menos de 15 min' },
  { min: 15, label: '15 a 30 min' },
  { min: 30, label: '30 min a 1 h' },
  { min: 60, label: 'más de 1 h' },
];
const level = (ms: number) => {
  const m = ms / 60_000;
  let l = 0;
  LEVELS.forEach((s, i) => m >= s.min && (l = i + 1));
  return l;
};

const CELL = 13;
const GAP = 3;
const LABEL_W = 24;
const DAY_LABELS = ['lu', '', 'mi', '', 'vi', '', ''];

interface Props {
  /** ms leídos por día (YYYY-MM-DD). */
  byDay: Map<string, number>;
  /** pomodoros por día, para el detalle. */
  pomodorosByDay: Map<string, number>;
}

/** Días con lectura, semana por columna (de lunes a domingo), como el mapa de actividad de Claude. */
export function Heatmap({ byDay, pomodorosByDay }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [weeks, setWeeks] = useState(26);
  const [hover, setHover] = useState<{ date: Date; x: number; y: number } | null>(null);

  // Tantas semanas como entren a lo ancho.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const fit = Math.floor((e.contentRect.width - LABEL_W) / (CELL + GAP));
      setWeeks(Math.max(8, Math.min(53, fit)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { columns, months, activeDays, total } = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = new Date(today);
    start.setDate(today.getDate() - mondayOffset - (weeks - 1) * 7);

    const columns: (Date | null)[][] = [];
    const months: { col: number; label: string }[] = [];
    let activeDays = 0;
    let total = 0;
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const col: (Date | null)[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        if (date > today) {
          col.push(null);
          continue;
        }
        col.push(date);
        const ms = byDay.get(dayKey(date)) ?? 0;
        if (ms >= 60_000) activeDays++;
        total += ms;
      }
      const first = col[0];
      if (first && first.getMonth() !== lastMonth) {
        // Sin amontonar etiquetas: al menos 3 columnas entre una y otra.
        if (!months.length || w - months[months.length - 1].col >= 3) {
          months.push({ col: w, label: first.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') });
        }
        lastMonth = first.getMonth();
      }
      columns.push(col);
    }
    return { columns, months, activeDays, total };
  }, [byDay, weeks]);

  const hoverKey = hover ? dayKey(hover.date) : '';
  const hoverMs = byDay.get(hoverKey) ?? 0;
  const hoverPomos = pomodorosByDay.get(hoverKey) ?? 0;
  const span = weeks >= 52 ? 'el último año' : `las últimas ${weeks} semanas`;

  return (
    <figure className="heatmap" ref={wrap}>
      <div
        className="heat-grid"
        role="img"
        aria-label={`${activeDays} días con lectura en ${span}, ${formatDuration(total)} en total`}
        style={{ gridTemplateColumns: `${LABEL_W}px repeat(${weeks}, ${CELL}px)`, gap: GAP }}
        onMouseLeave={() => setHover(null)}
      >
        <span />
        {columns.map((_, w) => (
          <span key={`m${w}`} className="heat-month">
            {months.find((m) => m.col === w)?.label ?? ''}
          </span>
        ))}
        {DAY_LABELS.map((label, d) => (
          <FragmentRow key={d} label={label}>
            {columns.map((col, w) => {
              const date = col[d];
              if (!date) return <span key={w} className="heat-cell future" />;
              const ms = byDay.get(dayKey(date)) ?? 0;
              const isToday = dayKey(date) === dayKey();
              return (
                <span
                  key={w}
                  className={`heat-cell l${level(ms)} ${isToday ? 'today' : ''}`}
                  onMouseEnter={(e) => {
                    const box = (e.currentTarget.offsetParent as HTMLElement | null)?.getBoundingClientRect();
                    const cell = e.currentTarget.getBoundingClientRect();
                    if (box) setHover({ date, x: cell.left - box.left + CELL / 2, y: cell.top - box.top });
                  }}
                />
              );
            })}
          </FragmentRow>
        ))}
        {hover && (
          <span className="tooltip heat-tooltip" style={{ left: hover.x, top: hover.y }} role="tooltip">
            <strong>{hoverMs >= 60_000 ? formatDuration(hoverMs) : 'Sin lectura'}</strong>
            <span>
              {hover.date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}
              {hoverPomos ? ` · ${hoverPomos} ${hoverPomos === 1 ? 'pomodoro' : 'pomodoros'}` : ''}
            </span>
          </span>
        )}
      </div>

      <figcaption className="heat-foot">
        <span className="muted">
          {activeDays} {activeDays === 1 ? 'día' : 'días'} leyendo en {span}
        </span>
        <span className="heat-legend" aria-hidden="true">
          menos
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`heat-cell l${l}`} title={l ? LEVELS[l - 1].label : 'sin lectura'} />
          ))}
          más
        </span>
      </figcaption>
    </figure>
  );
}

/** Una fila del grid: etiqueta del día + sus celdas (el grid es por columnas de semana). */
function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="heat-day">{label}</span>
      {children}
    </>
  );
}
