import { buildAnnotatedPdf, readPdfHighlights, stripHighlights } from './annotations';
import { downloadBlob } from './download';
import { sha256 } from './hash';

export { downloadBlob, sha256 };
import { db, sortHighlights, uid, type Doc } from './db';
import { loadPdf, type PDFDocumentProxy } from './pdf';

// Partes de la File System Access API que todavía no están en lib.dom.
declare global {
  interface Window {
    showOpenFilePicker?: (opts?: {
      multiple?: boolean;
      types?: { description?: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle[]>;
  }
  interface FileSystemHandle {
    queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
  interface DataTransferItem {
    getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
  }
}

export const canSaveToOriginal = typeof window !== 'undefined' && 'showOpenFilePicker' in window;

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export interface Source {
  file: File;
  handle?: FileSystemFileHandle;
}

/** Abre el selector. En Chrome/Edge guarda el handle para poder escribir el archivo original. */
export async function pickPdfs(fallbackInput: HTMLInputElement): Promise<Source[] | null> {
  if (!window.showOpenFilePicker) {
    fallbackInput.click();
    return null;
  }
  try {
    const handles = await window.showOpenFilePicker({
      multiple: true,
      types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
    });
    return Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
  } catch {
    return []; // canceló
  }
}

export async function sourcesFromDrop(dt: DataTransfer): Promise<Source[]> {
  const items = [...dt.items].filter((i) => i.kind === 'file');
  const out: Source[] = [];
  for (const item of items) {
    const handle = await item.getAsFileSystemHandle?.().catch(() => null);
    const file = item.getAsFile();
    if (!file) continue;
    out.push({ file, handle: handle?.kind === 'file' ? (handle as FileSystemFileHandle) : undefined });
  }
  return out;
}

export async function importPdfs(sources: Source[], folderId: string | null = null) {
  const imported: { doc: Doc; found: number }[] = [];
  navigator.storage?.persist?.().catch(() => {});

  for (const { file, handle } of sources.filter((s) => isPdf(s.file))) {
    const bytes = await file.arrayBuffer();
    const pdf = await loadPdf(bytes);

    // Los resaltados que ya trae el PDF pasan a la base y se sacan del archivo guardado,
    // así no se dibujan dos veces. Al guardar se vuelven a escribir todos juntos.
    let found = await readPdfHighlights(pdf).catch(() => []);
    let blob: Blob = file;
    if (found.length) {
      try {
        blob = new Blob([(await stripHighlights(bytes)) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
      } catch {
        found = [];
      }
    }

    const thumb = await renderThumb(pdf).catch(() => undefined);
    const fileHash = await sha256(blob);
    const now = Date.now();
    const doc: Doc = {
      id: uid(),
      name: file.name.replace(/\.pdf$/i, ''),
      folderId,
      size: blob.size,
      pages: pdf.numPages,
      lastPage: 1,
      maxPage: 0,
      fileHash,
      scale: null,
      addedAt: now,
      openedAt: now,
      thumb,
    };
    await pdf.loadingTask.destroy();

    await db.transaction('rw', db.docs, db.files, db.highlights, async () => {
      await db.docs.add(doc);
      await db.files.add({ id: doc.id, blob, handle });
      await db.highlights.bulkAdd(found.map((h) => ({ ...h, id: uid(), docId: doc.id })));
    });
    imported.push({ doc, found: found.length });
  }
  return imported;
}

async function annotatedBytes(doc: Doc) {
  const stored = await db.files.get(doc.id);
  if (!stored) throw new Error('No encontré el archivo');
  const highlights = sortHighlights(await db.highlights.where('docId').equals(doc.id).toArray());
  const bytes = (await buildAnnotatedPdf(stored.blob, highlights)) as Uint8Array<ArrayBuffer>;
  return { bytes, handle: stored.handle };
}

async function writeToHandle(handle: FileSystemFileHandle, bytes: Uint8Array<ArrayBuffer>) {
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

async function renderThumb(pdf: PDFDocumentProxy) {
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 360 / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.78);
}

/**
 * Escribe los subrayados dentro del PDF. Si tenemos acceso al archivo original
 * (Chrome/Edge), lo sobrescribe; si no, descarga una copia.
 */
export async function savePdf(doc: Doc): Promise<'original' | 'download'> {
  const savedAt = Date.now();
  const { bytes, handle } = await annotatedBytes(doc);

  if (handle) {
    try {
      let perm = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
      if (perm === 'prompt') perm = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
      if (perm === 'granted') {
        await writeToHandle(handle, bytes);
        await db.docs.update(doc.id, { savedAt });
        return 'original';
      }
    } catch {
      /* sin permiso o el archivo se movió: descargamos */
    }
  }
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${doc.name}.pdf`);
  await db.docs.update(doc.id, { savedAt });
  return 'download';
}

/** En qué situación está un libro respecto a su archivo original en la compu. */
export type OriginalStatus = 'unsupported' | 'unlinked' | 'needs-permission' | 'ready';

export async function originalStatus(docId: string): Promise<OriginalStatus> {
  if (!canSaveToOriginal) return 'unsupported';
  const stored = await db.files.get(docId);
  if (!stored?.handle) return 'unlinked';
  try {
    const perm = await stored.handle.queryPermission?.({ mode: 'readwrite' });
    return perm === 'granted' ? 'ready' : 'needs-permission';
  } catch {
    return 'needs-permission';
  }
}

// Un guardado a la vez por libro: si llegan cambios mientras se escribe, se guarda otra vez al terminar.
const inflight = new Map<string, Promise<boolean>>();
const again = new Set<string>();

/**
 * Escribe los subrayados en el archivo original, sin pedir nada.
 * Solo funciona si el libro está conectado y ya hay permiso (pedirlo requiere un clic).
 */
export function autoSaveToOriginal(doc: Doc): Promise<boolean> {
  const running = inflight.get(doc.id);
  if (running) {
    again.add(doc.id);
    return running;
  }
  const task = (async () => {
    if ((await originalStatus(doc.id)) !== 'ready') return false;
    const savedAt = Date.now();
    const { bytes, handle } = await annotatedBytes(doc);
    await writeToHandle(handle!, bytes);
    await db.docs.update(doc.id, { savedAt });
    return true;
  })().finally(() => {
    inflight.delete(doc.id);
    if (again.delete(doc.id)) void db.docs.get(doc.id).then((d) => d && autoSaveToOriginal(d));
  });
  inflight.set(doc.id, task);
  return task;
}

/** Pide permiso para escribir (necesita un clic) y guarda en el momento. */
export async function enableOriginalSave(doc: Doc) {
  const stored = await db.files.get(doc.id);
  if (!stored?.handle) return false;
  const perm = await stored.handle.requestPermission?.({ mode: 'readwrite' });
  if (perm !== 'granted') return false;
  return autoSaveToOriginal(doc);
}

/**
 * Une el libro con un archivo de la compu (por ejemplo, si vino de otro dispositivo).
 * Desde ahí los subrayados se guardan en ese archivo.
 */
export async function linkOriginal(doc: Doc) {
  if (!window.showOpenFilePicker) return false;
  let handle: FileSystemFileHandle | undefined;
  try {
    [handle] = await window.showOpenFilePicker({
      types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
    });
  } catch {
    return false; // canceló
  }
  if (!handle) return false;
  await db.files.update(doc.id, { handle });
  return enableOriginalSave(doc);
}
