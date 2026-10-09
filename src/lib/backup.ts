/**
 * Copia de seguridad completa en un .zip:
 *   tomapuntes.json  carpetas, libros, subrayados, tiempos, pomodoros y ajustes
 *   pdfs/<id>.pdf    los archivos
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { dayKey } from './dates';
import { db, type Doc, type Evaluation, type Folder, type Highlight, type PomodoroLog, type ReadingDay } from './db';

const MANIFEST = 'tomapuntes.json';
const VERSION = 1;

interface Manifest {
  app: 'tomapuntes';
  version: number;
  exportedAt: number;
  folders: Folder[];
  docs: Doc[];
  highlights: Highlight[];
  reading: ReadingDay[];
  pomodoros: PomodoroLog[];
  evaluations?: Evaluation[];
  settings: Record<string, string>;
}

/** Ajustes de la app que viven en localStorage (etiquetas, pomodoro, sonidos, tema…). */
function readSettings() {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      // El estado del timer en curso no tiene sentido restaurarlo.
      if (key.startsWith('apuntes.') && key !== 'apuntes.pomodoro.state') out[key] = localStorage.getItem(key)!;
    }
  } catch {
    /* sin localStorage */
  }
  return out;
}

export async function exportBackup() {
  const [folders, docs, highlights, reading, pomodoros, evaluations, files] = await Promise.all([
    db.folders.toArray(),
    db.docs.toArray(),
    db.highlights.toArray(),
    db.reading.toArray(),
    db.pomodoros.toArray(),
    db.evaluations.toArray(),
    db.files.toArray(),
  ]);
  const manifest: Manifest = {
    app: 'tomapuntes',
    version: VERSION,
    exportedAt: Date.now(),
    folders,
    docs,
    highlights,
    reading,
    pomodoros,
    evaluations,
    settings: readSettings(),
  };

  const zip: Zippable = { [MANIFEST]: strToU8(JSON.stringify(manifest)) };
  for (const f of files) {
    // Los PDFs ya vienen comprimidos: guardarlos sin comprimir de nuevo es mucho más rápido.
    zip[`pdfs/${f.id}.pdf`] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }];
  }
  const bytes = zipSync(zip, { level: 6 });
  return {
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    filename: `tomapuntes-copia-${dayKey()}.zip`,
    docs: docs.length,
    highlights: highlights.length,
  };
}

export interface ImportResult {
  docs: number;
  highlights: number;
  skipped: number;
}

/**
 * Restaura una copia sumándola a lo que ya hay. Lo que tiene el mismo id se reemplaza
 * por la versión de la copia; lo demás no se toca.
 */
export async function importBackup(file: File): Promise<ImportResult> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const raw = entries[MANIFEST];
  if (!raw) throw new Error('Este archivo no es una copia de Tomapuntes.');
  const m = JSON.parse(strFromU8(raw)) as Manifest;
  if (m.app !== 'tomapuntes') throw new Error('Este archivo no es una copia de Tomapuntes.');
  if (m.version > VERSION) throw new Error('La copia es de una versión más nueva de la app.');

  // Un libro sin su PDF no se puede abrir: lo salteamos (y sus subrayados también).
  const docs = m.docs.filter((d) => entries[`pdfs/${d.id}.pdf`]);
  const ids = new Set(docs.map((d) => d.id));
  const highlights = m.highlights.filter((h) => ids.has(h.docId));

  await db.transaction('rw', [db.folders, db.docs, db.files, db.highlights, db.reading, db.pomodoros, db.evaluations], async () => {
    await db.folders.bulkPut(m.folders);
    await db.docs.bulkPut(docs);
    await db.files.bulkPut(
      docs.map((d) => ({ id: d.id, blob: new Blob([entries[`pdfs/${d.id}.pdf`] as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }) })),
    );
    await db.highlights.bulkPut(highlights);
    await db.reading.bulkPut(m.reading);
    await db.pomodoros.bulkPut(m.pomodoros);
    await db.evaluations.bulkPut(m.evaluations ?? []);
  });

  try {
    for (const [key, value] of Object.entries(m.settings ?? {})) localStorage.setItem(key, value);
  } catch {
    /* sin localStorage */
  }

  return { docs: docs.length, highlights: highlights.length, skipped: m.docs.length - docs.length };
}
