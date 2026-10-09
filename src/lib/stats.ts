import { dayKey, daysAgo } from './dates';
import type { Doc, Folder, PomodoroLog, ReadingDay } from './db';

const WEEKDAY = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sá'];

export interface DayStat {
  date: string;
  label: string;
  long: string;
  ms: number;
  isToday: boolean;
}

export interface BookProgress {
  doc: Doc;
  pct: number;
  ms: number;
  lastRead: number;
}

export interface Stats {
  todayMs: number;
  weekMs: number;
  prevWeekMs: number;
  totalMs: number;
  streak: number;
  pomodorosToday: number;
  pomodorosTotal: number;
  week: DayStat[];
  inProgress: BookProgress[];
  finished: number;
  byFolder: { name: string; ms: number }[];
}

/** Páginas leídas: la más lejana a la que llegaste (0 si nunca lo abriste). */
export const pagesRead = (d: Doc) => d.maxPage ?? d.lastPage ?? 0;

export const progressOf = (d: Doc) => (d.pages ? Math.min(100, Math.round((pagesRead(d) / d.pages) * 100)) : 0);

export function computeStats(docs: Doc[], folders: Folder[], reading: ReadingDay[], pomodoros: PomodoroLog[]): Stats {
  const today = dayKey();
  const byDay = new Map<string, number>();
  const byDoc = new Map<string, number>();
  for (const r of reading) {
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.ms);
    byDoc.set(r.docId, (byDoc.get(r.docId) ?? 0) + r.ms);
  }
  const msOn = (n: number) => byDay.get(dayKey(daysAgo(n))) ?? 0;
  const sumRange = (from: number, to: number) => {
    let total = 0;
    for (let i = from; i <= to; i++) total += msOn(i);
    return total;
  };

  const week: DayStat[] = Array.from({ length: 7 }, (_, i) => {
    const d = daysAgo(6 - i);
    return {
      date: dayKey(d),
      label: WEEKDAY[d.getDay()],
      long: d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' }),
      ms: byDay.get(dayKey(d)) ?? 0,
      isToday: i === 6,
    };
  });

  // Racha: días seguidos con lectura o pomodoros. Si hoy todavía no leíste, la racha sigue viva desde ayer.
  const activeDays = new Set([...byDay.entries()].filter(([, ms]) => ms >= 60_000).map(([d]) => d));
  pomodoros.forEach((p) => activeDays.add(p.date));
  let streak = 0;
  for (let i = activeDays.has(today) ? 0 : 1; activeDays.has(dayKey(daysAgo(i))); i++) streak++;

  const progress = docs.map((doc) => ({
    doc,
    pct: progressOf(doc),
    ms: byDoc.get(doc.id) ?? 0,
    lastRead: doc.openedAt,
  }));
  const inProgress = progress
    .filter((p) => p.pct < 100 && (p.ms > 0 || pagesRead(p.doc) > 1))
    .sort((a, b) => b.lastRead - a.lastRead);

  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const folderMs = new Map<string, number>();
  for (const p of progress) {
    if (!p.ms) continue;
    const name = folderName.get(p.doc.folderId ?? '') ?? 'Sin carpeta';
    folderMs.set(name, (folderMs.get(name) ?? 0) + p.ms);
  }

  return {
    todayMs: msOn(0),
    weekMs: sumRange(0, 6),
    prevWeekMs: sumRange(7, 13),
    totalMs: [...byDay.values()].reduce((a, b) => a + b, 0),
    streak,
    pomodorosToday: pomodoros.filter((p) => p.date === today).length,
    pomodorosTotal: pomodoros.length,
    week,
    inProgress,
    finished: progress.filter((p) => p.pct >= 100 && p.doc.pages > 1).length,
    byFolder: [...folderMs.entries()].map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms),
  };
}
