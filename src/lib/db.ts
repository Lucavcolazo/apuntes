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

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface Doc {
  id: string;
  name: string;
  folderId: string | null;
  size: number;
  pages: number;
  lastPage: number;
  scale: number | null;
  addedAt: number;
  openedAt: number;
  /** Miniatura de la primera página (data URL), para la tapa en la biblioteca. */
  thumb?: string;
  /** Último cambio en los subrayados y última vez que se escribieron en el PDF. */
  changedAt?: number;
  savedAt?: number;
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

export interface Highlight {
  id: string;
  docId: string;
  color: ColorKey;
  rects: Rect[];
  page: number;
  text: string;
  note: string;
  createdAt: number;
}

export const db = new Dexie('apuntes') as Dexie & {
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
}

export const touchDoc = (id: string) => db.docs.update(id, { changedAt: Date.now() });

export async function createFolder(name: string) {
  const folder: Folder = { id: uid(), name: name.trim(), createdAt: Date.now() };
  await db.folders.add(folder);
  return folder;
}

/** Borra la carpeta; sus apuntes quedan "Sin carpeta". */
export async function deleteFolder(id: string) {
  await db.transaction('rw', db.folders, db.docs, async () => {
    await db.docs.where('folderId').equals(id).modify({ folderId: null });
    await db.folders.delete(id);
  });
}
