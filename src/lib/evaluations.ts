import { daysUntil } from './dates';
import type { Doc, Evaluation } from './db';
import { pagesRead } from './stats';

export interface EvalStatus {
  days: number;
  docs: Doc[];
  totalPages: number;
  pagesLeft: number;
  /** Páginas por día para llegar con todo leído (0 si ya está). */
  perDay: number;
  readPct: number;
  notesOpen: number;
}

export function evalStatus(ev: Evaluation, docs: Doc[]): EvalStatus {
  const linked = ev.docIds.map((id) => docs.find((d) => d.id === id)).filter((d): d is Doc => !!d);
  const totalPages = linked.reduce((n, d) => n + d.pages, 0);
  const pagesLeft = linked.reduce((n, d) => n + Math.max(0, d.pages - pagesRead(d)), 0);
  const days = daysUntil(ev.date);
  return {
    days,
    docs: linked,
    totalPages,
    pagesLeft,
    perDay: pagesLeft ? Math.ceil(pagesLeft / Math.max(1, days)) : 0,
    readPct: totalPages ? Math.round(((totalPages - pagesLeft) / totalPages) * 100) : 0,
    notesOpen: ev.notes.filter((n) => !n.done).length,
  };
}

/** Lo que viene primero: pendientes por fecha; los ya pasados o entregados, al final. */
export function sortEvaluations(list: Evaluation[]) {
  const upcoming = list.filter((e) => !e.done && daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const past = list.filter((e) => e.done || daysUntil(e.date) < 0).sort((a, b) => b.date.localeCompare(a.date));
  return { upcoming, past };
}
