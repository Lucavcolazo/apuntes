import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { Rect } from './db';
import { pdfjs, type PDFDocumentProxy } from './pdf';

export interface SearchHit {
  id: number;
  page: number;
  rect: Rect;
  before: string;
  match: string;
  after: string;
}

/** Sin acentos ni mayúsculas. Con letras precompuestas (á, ñ…) el largo no cambia, así los índices siguen sirviendo. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

interface PageText {
  items: { str: string; folded: string; x: number; y: number; w: number; h: number }[];
}

/** Texto de cada página con la posición de cada renglón, normalizada a 0–1. Se calcula una vez por PDF. */
const cache = new WeakMap<PDFDocumentProxy, Map<number, Promise<PageText>>>();

function pageText(pdf: PDFDocumentProxy, n: number) {
  let byPage = cache.get(pdf);
  if (!byPage) cache.set(pdf, (byPage = new Map()));
  let entry = byPage.get(n);
  if (!entry) {
    entry = (async () => {
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter((i): i is TextItem => 'str' in i && !!i.str.trim())
        .map((i) => {
          const t = pdfjs.Util.transform(vp.transform, i.transform);
          const h = Math.hypot(t[2], t[3]);
          return {
            str: i.str,
            folded: fold(i.str),
            x: t[4] / vp.width,
            y: (t[5] - h) / vp.height,
            w: (i.width * vp.scale) / vp.width,
            h: (h * 1.15) / vp.height,
          };
        });
      return { items };
    })();
    byPage.set(n, entry);
  }
  return entry;
}

const LIMIT = 500;

export async function searchPdf(pdf: PDFDocumentProxy, query: string, signal: { cancelled: boolean }) {
  const q = fold(query.trim());
  const hits: SearchHit[] = [];
  if (q.length < 2) return hits;

  for (let n = 1; n <= pdf.numPages && hits.length < LIMIT; n++) {
    const { items } = await pageText(pdf, n);
    if (signal.cancelled) return hits;
    for (const it of items) {
      let from = 0;
      let at: number;
      while ((at = it.folded.indexOf(q, from)) !== -1 && hits.length < LIMIT) {
        const len = it.str.length || 1;
        hits.push({
          id: hits.length,
          page: n,
          rect: {
            p: n,
            x: it.x + (it.w * at) / len,
            y: it.y,
            w: (it.w * q.length) / len,
            h: it.h,
          },
          before: it.str.slice(Math.max(0, at - 40), at),
          match: it.str.slice(at, at + q.length),
          after: it.str.slice(at + q.length, at + q.length + 60),
        });
        from = at + q.length;
      }
    }
  }
  return hits;
}

export interface OutlineItem {
  title: string;
  page: number | null;
  depth: number;
}

/** Índice del PDF (si trae) aplanado, con el número de página de cada capítulo. */
export async function loadOutline(pdf: PDFDocumentProxy): Promise<OutlineItem[]> {
  const outline = await pdf.getOutline().catch(() => null);
  if (!outline?.length) return [];
  const out: OutlineItem[] = [];

  const resolve = async (dest: unknown): Promise<number | null> => {
    try {
      const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
      if (!Array.isArray(explicit) || !explicit.length) return null;
      const ref = explicit[0];
      const index = typeof ref === 'number' ? ref : await pdf.getPageIndex(ref);
      return index + 1;
    } catch {
      return null;
    }
  };

  type Node = { title: string; dest: unknown; items: Node[] };
  const walk = async (nodes: Node[], depth: number) => {
    for (const node of nodes) {
      out.push({ title: node.title, page: await resolve(node.dest), depth });
      if (node.items?.length) await walk(node.items, depth + 1);
    }
  };
  await walk(outline as Node[], 0);
  return out;
}
