/**
 * Lectura y escritura de subrayados como anotaciones /Highlight estándar del PDF:
 * el mismo formato que usan Libros, Vista Previa, Archivos de iOS, Acrobat, etc.
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, type PDFObject } from 'pdf-lib';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PageViewport } from 'pdfjs-dist/types/src/display/page_viewport';
import { COLORS, nearestColor } from './colors';
import type { Highlight, Rect } from './db';
import { cleanText, mergeRects } from './geometry';
import { loadPdf, pdfjs, type PDFDocumentProxy } from './pdf';

type FoundHighlight = Omit<Highlight, 'id' | 'docId'>;

/** Busca los resaltados que ya tiene el PDF (por ejemplo, hechos en el celu). */
export async function readPdfHighlights(pdf: PDFDocumentProxy): Promise<FoundHighlight[]> {
  const found: FoundHighlight[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const annots = await page.getAnnotations();
    const highlights = annots.filter((a) => a.annotationType === pdfjs.AnnotationType.HIGHLIGHT && a.quadPoints);
    if (!highlights.length) continue;

    const vp = page.getViewport({ scale: 1 });
    const text = await page.getTextContent();
    const items = text.items.filter((i): i is TextItem => 'str' in i);

    for (const a of highlights) {
      const q: ArrayLike<number> = a.quadPoints;
      const rects: Rect[] = [];
      for (let i = 0; i + 7 < q.length; i += 8) {
        const xs = [q[i], q[i + 2], q[i + 4], q[i + 6]];
        const ys = [q[i + 1], q[i + 3], q[i + 5], q[i + 7]];
        const [ax, ay] = vp.convertToViewportPoint(Math.min(...xs), Math.max(...ys));
        const [bx, by] = vp.convertToViewportPoint(Math.max(...xs), Math.min(...ys));
        rects.push({
          p,
          x: Math.min(ax, bx) / vp.width,
          y: Math.min(ay, by) / vp.height,
          w: Math.abs(bx - ax) / vp.width,
          h: Math.abs(by - ay) / vp.height,
        });
      }
      if (!rects.length) continue;
      const merged = mergeRects(rects);
      found.push({
        color: nearestColor(a.color),
        rects: merged,
        page: p,
        text: textUnder(merged, items, vp),
        note: a.contentsObj?.str ?? '',
        createdAt: Date.now(),
      });
    }
  }
  return found;
}

/** Texto aproximado que queda debajo de un resaltado importado. */
function textUnder(rects: Rect[], items: TextItem[], vp: PageViewport) {
  const parts: string[] = [];
  for (const r of rects) {
    const rx1 = r.x * vp.width;
    const rx2 = (r.x + r.w) * vp.width;
    const ry1 = r.y * vp.height;
    const ry2 = (r.y + r.h) * vp.height;
    for (const item of items) {
      if (!item.str) continue;
      const t = pdfjs.Util.transform(vp.transform, item.transform);
      const height = Math.hypot(t[2], t[3]);
      const left = t[4];
      const bottom = t[5];
      const top = bottom - height;
      const width = item.width * vp.scale;
      const vOverlap = Math.min(bottom, ry2) - Math.max(top, ry1);
      if (vOverlap < height * 0.5 || width <= 0) continue;
      const o1 = Math.max(left, rx1);
      const o2 = Math.min(left + width, rx2);
      if (o2 <= o1) continue;
      const n = item.str.length;
      const from = Math.max(0, Math.round(((o1 - left) / width) * n));
      const to = Math.min(n, Math.round(((o2 - left) / width) * n));
      parts.push(item.str.slice(from, to));
    }
  }
  return cleanText(parts.join(' '));
}

/** Saca los /Highlight (y sus popups) del PDF. */
function removeHighlightAnnots(doc: PDFDocument) {
  const highlight = PDFName.of('Highlight');
  const popup = PDFName.of('Popup');
  const subtype = PDFName.of('Subtype');
  const parent = PDFName.of('Parent');

  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;

    const entries = annots.asArray().map((raw) => ({ raw, dict: doc.context.lookupMaybe(raw, PDFDict) }));
    const removed = new Set<PDFObject>(
      entries.filter((e) => e.dict?.get(subtype) === highlight).map((e) => e.raw),
    );
    if (!removed.size) continue;

    const keep = entries
      .filter((e) => !removed.has(e.raw))
      .filter((e) => !(e.dict?.get(subtype) === popup && removed.has(e.dict.get(parent) as PDFObject)))
      .map((e) => e.raw);
    page.node.set(PDFName.of('Annots'), doc.context.obj(keep) as PDFArray);
  }
}

export async function stripHighlights(bytes: ArrayBuffer) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  removeHighlightAnnots(doc);
  return doc.save();
}

const num = (n: number) => Number(n.toFixed(3));

/** Devuelve el PDF con todos los subrayados escritos como anotaciones. */
export async function buildAnnotatedPdf(blob: Blob, highlights: Highlight[]) {
  const bytes = await blob.arrayBuffer();
  const pdf = await loadPdf(bytes);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  removeHighlightAnnots(doc);

  const pages = doc.getPages();
  const viewports = new Map<number, PageViewport>();
  const viewport = async (p: number) => {
    let vp = viewports.get(p);
    if (!vp) viewports.set(p, (vp = (await pdf.getPage(p)).getViewport({ scale: 1 })));
    return vp;
  };

  for (const h of highlights) {
    const byPage = Map.groupBy(h.rects, (r) => r.p);
    for (const [p, rects] of byPage) {
      const page = pages[p - 1];
      if (!page) continue;
      const vp = await viewport(p);

      const quads: number[] = [];
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const r of rects) {
        const [ax, ay] = vp.convertToPdfPoint(r.x * vp.width, r.y * vp.height);
        const [bx, by] = vp.convertToPdfPoint((r.x + r.w) * vp.width, (r.y + r.h) * vp.height);
        const [minX, maxX] = [num(Math.min(ax, bx)), num(Math.max(ax, bx))];
        const [minY, maxY] = [num(Math.min(ay, by)), num(Math.max(ay, by))];
        // Orden de QuadPoints que usan Acrobat/Preview: sup-izq, sup-der, inf-izq, inf-der.
        quads.push(minX, maxY, maxX, maxY, minX, minY, maxX, minY);
        [x0, y0, x1, y1] = [Math.min(x0, minX), Math.min(y0, minY), Math.max(x1, maxX), Math.max(y1, maxY)];
      }

      const [cr, cg, cb] = COLORS[h.color].rgb.map(num);
      let content = `/GS0 gs ${cr} ${cg} ${cb} rg\n`;
      for (let i = 0; i < quads.length; i += 8) {
        const [ax, ay, bx, by, cx, cy, dx, dy] = quads.slice(i, i + 8);
        content += `${ax} ${ay} m ${bx} ${by} l ${dx} ${dy} l ${cx} ${cy} l h f\n`;
      }
      const appearance = doc.context.flateStream(content, {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [x0, y0, x1, y1],
        Resources: { ExtGState: { GS0: { Type: 'ExtGState', BM: 'Multiply', CA: 1, ca: 1 } } },
      });

      const annot = doc.context.obj({
        Type: 'Annot',
        Subtype: 'Highlight',
        Rect: [x0, y0, x1, y1],
        QuadPoints: quads,
        C: [cr, cg, cb],
        CA: 1,
        F: 4,
        Border: [0, 0, 0],
        NM: PDFString.of(`apuntes-${h.id}-${p}`),
        T: PDFHexString.fromText('Apuntes'),
        M: PDFString.fromDate(new Date(h.createdAt)),
        AP: { N: doc.context.register(appearance) },
        P: page.ref,
        ...(h.note ? { Contents: PDFHexString.fromText(h.note) } : {}),
      });
      page.node.addAnnot(doc.context.register(annot));
    }
  }

  await pdf.loadingTask.destroy();
  return doc.save();
}
