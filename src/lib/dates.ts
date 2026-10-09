/** Día local en formato YYYY-MM-DD (no UTC: a las 22 h en Argentina sigue siendo "hoy"). */
export const dayKey = (d: Date | number = new Date()) => {
  const date = typeof d === 'number' ? new Date(d) : d;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${day}`;
};

export const daysAgo = (n: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};

/** 3 h 20 min · 45 min · 0 min */
export function formatDuration(ms: number) {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Días que faltan hasta una fecha YYYY-MM-DD (0 = hoy, negativo = ya pasó). */
export function daysUntil(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(y, m - 1, d, 12);
  return Math.round((target.getTime() - daysAgo(0).getTime()) / 86_400_000);
}

export function whenLabel(days: number) {
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  return `en ${days} días`;
}
