import { useState } from 'react';
import { dayKey } from '../lib/dates';
import { createEvaluation, EVAL_KINDS, type Evaluation, type Folder } from '../lib/db';
import { Link, navigate } from '../lib/router';
import { Icon } from './Icon';

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** Mes en grilla (de lunes a domingo) con los parciales y TPs de cada día. */
export function EvalCalendar({ evaluations, folders }: { evaluations: Evaluation[]; folders: Folder[] }) {
  const now = new Date();
  const [cursor, setCursor] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const folderName = new Map(folders.map((f) => [f.id, f.name]));

  const first = new Date(cursor.y, cursor.m, 1, 12);
  const lead = (first.getDay() + 6) % 7; // días del mes anterior para completar la primera semana
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const today = dayKey();

  const byDate = new Map<string, Evaluation[]>();
  for (const ev of evaluations) byDate.set(ev.date, [...(byDate.get(ev.date) ?? []), ev]);

  const inMonth = evaluations.filter((e) => {
    const [y, m] = e.date.split('-').map(Number);
    return y === cursor.y && m - 1 === cursor.m;
  });

  const move = (delta: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const title = first.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const addOn = async (date: string) => navigate(`/parciales/${(await createEvaluation({ date })).id}`);

  return (
    <section className="calendar">
      <header className="cal-head">
        <h3>{title.charAt(0).toUpperCase() + title.slice(1)}</h3>
        <span className="muted cal-count">
          {inMonth.length ? `${inMonth.length} ${inMonth.length === 1 ? 'fecha' : 'fechas'}` : 'Sin fechas'}
        </span>
        <div className="cal-nav">
          <button className="icon-btn sm" onClick={() => move(-1)} aria-label="Mes anterior">
            <Icon name="chevronLeft" size={16} />
          </button>
          <button className="btn ghost sm" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>
            Hoy
          </button>
          <button className="icon-btn sm" onClick={() => move(1)} aria-label="Mes siguiente">
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </header>

      <div className="cal-grid" role="grid" aria-label={title}>
        {WEEKDAYS.map((d) => (
          <span key={d} className="cal-weekday" role="columnheader">
            {d}
          </span>
        ))}
        {Array.from({ length: cells }, (_, i) => {
          const date = new Date(cursor.y, cursor.m, i - lead + 1, 12);
          const key = dayKey(date);
          const outside = date.getMonth() !== cursor.m;
          const events = byDate.get(key) ?? [];
          const past = key < today;
          return (
            <div
              key={key}
              role="gridcell"
              className={`cal-day ${outside ? 'outside' : ''} ${key === today ? 'today' : ''} ${past ? 'past' : ''}`}
              onClick={(e) => {
                // Tocar un día libre (no un evento) crea un parcial en esa fecha.
                if ((e.target as HTMLElement).closest('a') || past) return;
                void addOn(key);
              }}
              onKeyDown={(e) => {
                if (past || (e.key !== 'Enter' && e.key !== ' ') || (e.target as HTMLElement).closest('a')) return;
                e.preventDefault();
                void addOn(key);
              }}
              tabIndex={past ? undefined : 0}
              aria-label={`${date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}${
                events.length ? `: ${events.map((ev) => ev.title || EVAL_KINDS[ev.kind]).join(', ')}` : ''
              }${past ? '' : '. Enter para anotar algo'}`}
              title={past ? undefined : 'Tocá para anotar algo este día'}
            >
              <span className="cal-num tabular">{date.getDate()}</span>
              <div className="cal-events">
                {events.map((ev) => (
                  <Link
                    key={ev.id}
                    to={`/parciales/${ev.id}`}
                    className={`cal-event kind-${ev.kind} ${ev.done ? 'done' : ''}`}
                    title={`${EVAL_KINDS[ev.kind]}: ${ev.title || 'Sin título'}${ev.folderId ? ` · ${folderName.get(ev.folderId) ?? ''}` : ''}`}
                  >
                    {ev.done && <Icon name="check" size={11} />}
                    <span>{ev.title || EVAL_KINDS[ev.kind]}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
