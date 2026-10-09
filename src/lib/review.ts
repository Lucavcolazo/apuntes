/**
 * Repaso espaciado estilo Leitner: cada subrayado vive en una caja.
 * "Lo sé" lo sube de caja (vuelve más tarde); "Otra vez" lo baja a la primera.
 */
import type { Highlight, Review } from './db';

const DAY = 86_400_000;
/** Días hasta el próximo repaso según la caja (la 0 es "nueva"). */
export const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35];
/** "Otra vez" vuelve dentro de la misma sesión, al final de la fila. */
const AGAIN_MS = 10 * 60_000;

/** Al final del día local, para que "mañana" sea mañana y no dentro de 24 h exactas. */
function endOfDayIn(days: number) {
  const d = new Date();
  d.setHours(4, 0, 0, 0);
  return d.getTime() + days * DAY;
}

export const isDue = (h: Highlight, now = Date.now()) => !h.review || h.review.due <= now;

export function grade(h: Highlight, knew: boolean, now = Date.now()): Review {
  const prev = h.review ?? { box: 0, due: now, last: 0, reps: 0 };
  if (!knew) return { box: 1, due: now + AGAIN_MS, last: now, reps: prev.reps + 1 };
  const box = Math.min(prev.box + 1, INTERVAL_DAYS.length - 1);
  return { box, due: endOfDayIn(INTERVAL_DAYS[box]), last: now, reps: prev.reps + 1 };
}

/** Orden de la sesión: primero las "Duda", después las vencidas hace más tiempo, al final las nuevas. */
export function reviewQueue(list: Highlight[], now = Date.now()) {
  return list
    .filter((h) => isDue(h, now))
    .sort((a, b) => {
      const doubt = Number(b.color === 'pink') - Number(a.color === 'pink');
      if (doubt) return doubt;
      const fresh = Number(!a.review) - Number(!b.review);
      if (fresh) return fresh;
      return (a.review?.due ?? a.createdAt) - (b.review?.due ?? b.createdAt);
    });
}

export function nextLabel(box: number) {
  const days = INTERVAL_DAYS[box];
  return days === 1 ? 'mañana' : `en ${days} días`;
}
