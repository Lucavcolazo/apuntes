import Dexie, { type EntityTable } from 'dexie';

export type ColorKey = 'yellow' | 'green' | 'blue' | 'pink';

/** Rectángulo normalizado (0–1) relativo a la página `p` tal como se ve en pantalla. */
export interface Rect {
  p: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Campos de sincronización: cuándo cambió y si falta subirlo a la nube. */
export interface Synced {
  updatedAt?: number;
  dirty?: 0 | 1;
}

export interface Folder extends Synced {
  id: string;
  name: string;
  createdAt: number;
}

export interface Doc extends Synced {
  id: string;
  name: string;
  folderId: string | null;
  size: number;
  pages: number;
  lastPage: number;
  /** Página más lejana a la que llegaste: de ahí sale el % leído. */
  maxPage?: number;
  scale: number | null;
  addedAt: number;
  openedAt: number;
  /** Miniatura de la primera página (data URL), para la tapa en la biblioteca. */
  thumb?: string;
  /** Último cambio en los subrayados y última vez que se escribieron en el PDF. */
  changedAt?: number;
  savedAt?: number;
  /** SHA-256 del PDF guardado: con esto se comparte un solo archivo en la nube entre todos. */
  fileHash?: string;
  /** Solo local: el archivo ya está en el storage de la nube. */
  uploaded?: boolean;
}

/**
 * El PDF guardado no tiene anotaciones de resaltado: esas viven en `highlights`
 * y se vuelven a escribir en el PDF al guardar/descargar.
 */
export interface StoredFile {
  id: string;
  blob: Blob;
  /** Solo en Chrome/Edge: permite guardar los cambios en el archivo original. */
  handle?: FileSystemFileHandle;
}

export interface Highlight extends Synced {
  id: string;
  docId: string;
  color: ColorKey;
  rects: Rect[];
  page: number;
  text: string;
  note: string;
  createdAt: number;
  /** Repaso espaciado (la función está pausada; el dato se conserva para cuando vuelva). */
  review?: Review;
}

export interface Review {
  box: number;
  due: number;
  last: number;
  reps: number;
}

/** Tiempo de lectura acumulado por libro y por día. id = `${docId}|${date}` */
export interface ReadingDay extends Synced {
  id: string;
  docId: string;
  date: string;
  ms: number;
}

export interface PomodoroLog extends Synced {
  id: string;
  date: string;
  at: number;
  minutes: number;
}

export type EvalKind = 'parcial' | 'tp' | 'final' | 'otro';

export interface EvalNote {
  id: string;
  text: string;
  done: boolean;
  at: number;
}

/** Un parcial, TP o final: fecha, notas y los apuntes que entran. */
export interface Evaluation extends Synced {
  id: string;
  kind: EvalKind;
  title: string;
  folderId: string | null;
  /** YYYY-MM-DD */
  date: string;
  done: boolean;
  notes: EvalNote[];
  docIds: string[];
  createdAt: number;
}

/** Borrados pendientes de avisar a la nube. */
export interface Tombstone {
  key: string;
  table: string;
  id: string;
  at: number;
}

export const db = new Dexie('apuntes') as Dexie & {
  tombstones: EntityTable<Tombstone, 'key'>;
  evaluations: EntityTable<Evaluation, 'id'>;
  reading: EntityTable<ReadingDay, 'id'>;
  pomodoros: EntityTable<PomodoroLog, 'id'>;
  folders: EntityTable<Folder, 'id'>;
  docs: EntityTable<Doc, 'id'>;
  files: EntityTable<StoredFile, 'id'>;
  highlights: EntityTable<Highlight, 'id'>;
};

export const uid = () =>
  crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

db.version(1).stores({
  docs: 'id',
  files: 'id',
  highlights: 'id, docId',
});

// v2: carpetas. Las "materias" (texto libre) de la v1 se convierten en carpetas.
db.version(2)
  .stores({ folders: 'id', docs: 'id, folderId' })
  .upgrade(async (tx) => {
    const docs = await tx.table('docs').toArray();
    const names = [...new Set(docs.map((d) => (d.subject as string | undefined)?.trim()).filter(Boolean))] as string[];
    const folders = names.map((name, i) => ({ id: uid(), name, createdAt: Date.now() + i }));
    await tx.table('folders').bulkAdd(folders);
    await tx
      .table('docs')
      .toCollection()
      .modify((d) => {
        d.folderId = folders.find((f) => f.name === d.subject?.trim())?.id ?? null;
        delete d.subject;
      });
  });

export function sortHighlights(list: Highlight[]) {
  return [...list].sort(
    (a, b) =>
      a.page - b.page ||
      a.rects[0].y - b.rects[0].y ||
      a.rects[0].x - b.rects[0].x,
  );
}

export async function deleteDoc(id: string) {
  await db.transaction('rw', db.docs, db.files, db.highlights, async () => {
    await db.docs.delete(id);
    await db.files.delete(id);
    await db.highlights.where('docId').equals(id).delete();
  });
  await db.evaluations.toCollection().modify((e) => {
    e.docIds = e.docIds.filter((d) => d !== id);
  });
  // El tiempo leído se conserva para las estadísticas aunque borres el PDF.
}

export const touchDoc = (id: string) => db.docs.update(id, { changedAt: Date.now() });

// v3: estadísticas (tiempo leído por día y pomodoros) y página máxima alcanzada.
db.version(3)
  .stores({ reading: 'id, docId, date', pomodoros: 'id, date' })
  .upgrade((tx) =>
    tx
      .table('docs')
      .toCollection()
      .modify((d) => {
        d.maxPage ??= d.lastPage ?? 1;
      }),
  );

// v4: parciales y TPs. La fecha de parcial que tenía cada carpeta pasa a ser un parcial
// con todos los apuntes de esa carpeta conectados.
db.version(4)
  .stores({ evaluations: 'id, date, folderId' })
  .upgrade(async (tx) => {
    const folders = await tx.table('folders').toArray();
    const docs = await tx.table('docs').toArray();
    for (const f of folders) {
      if (!f.examDate) continue;
      await tx.table('evaluations').add({
        id: uid(),
        kind: 'parcial',
        title: `Parcial de ${f.name}`,
        folderId: f.id,
        date: f.examDate,
        done: false,
        notes: [],
        docIds: docs.filter((d) => d.folderId === f.id).map((d) => d.id),
        createdAt: Date.now(),
      });
    }
    await tx
      .table('folders')
      .toCollection()
      .modify((f) => {
        delete f.examDate;
      });
  });

/** Identifica este navegador: los minutos leídos se guardan por dispositivo para que no se pisen. */
export function deviceId() {
  try {
    let id = localStorage.getItem('apuntes.deviceId');
    if (!id) localStorage.setItem('apuntes.deviceId', (id = uid().slice(0, 8)));
    return id;
  } catch {
    return 'local';
  }
}

// v5: sincronización. Índices de "pendiente de subir", registro de borrados, huella de cada PDF,
// y los minutos leídos pasan a ser por dispositivo.
db.version(5)
  .stores({
    folders: 'id, dirty',
    docs: 'id, folderId, dirty, fileHash',
    highlights: 'id, docId, dirty',
    evaluations: 'id, date, folderId, dirty',
    reading: 'id, docId, date, dirty',
    pomodoros: 'id, date, dirty',
    tombstones: 'key',
  })
  .upgrade(async (tx) => {
    const device = deviceId();
    const rows = await tx.table('reading').toArray();
    for (const r of rows) {
      if (r.id.split('|').length === 3) continue;
      await tx.table('reading').delete(r.id);
      await tx.table('reading').put({ ...r, id: `${r.docId}|${r.date}|${device}` });
    }
  });

export async function addReading(docId: string, date: string, ms: number) {
  const id = `${docId}|${date}|${deviceId()}`;
  await db.transaction('rw', db.reading, async () => {
    const prev = await db.reading.get(id);
    await db.reading.put({ id, docId, date, ms: (prev?.ms ?? 0) + ms });
  });
}

export async function createFolder(name: string) {
  const folder: Folder = { id: uid(), name: name.trim(), createdAt: Date.now() };
  await db.folders.add(folder);
  return folder;
}

/** Borra la carpeta; sus apuntes quedan "Sin carpeta". */
export async function deleteFolder(id: string) {
  await db.transaction('rw', db.folders, db.docs, db.evaluations, async () => {
    await db.docs.where('folderId').equals(id).modify({ folderId: null });
    await db.folders.delete(id);
    await db.evaluations.where('folderId').equals(id).modify({ folderId: null });
  });
}

export const EVAL_KINDS: Record<EvalKind, string> = { parcial: 'Parcial', tp: 'TP', final: 'Final', otro: 'Entrega' };

export async function createEvaluation(partial: Partial<Evaluation> = {}) {
  const inTwoWeeks = new Date();
  inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);
  const m = String(inTwoWeeks.getMonth() + 1).padStart(2, '0');
  const d = String(inTwoWeeks.getDate()).padStart(2, '0');
  const ev: Evaluation = {
    id: uid(),
    kind: 'parcial',
    title: '',
    folderId: null,
    date: `${inTwoWeeks.getFullYear()}-${m}-${d}`,
    done: false,
    notes: [],
    docIds: [],
    createdAt: Date.now(),
    ...partial,
  };
  await db.evaluations.add(ev);
  return ev;
}
