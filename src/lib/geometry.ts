import type { Rect } from './db';

/** Rectángulos en pantalla de cada fragmento de texto seleccionado dentro de las capas de texto. */
export function selectionRects(range: Range): Rect[] {
  const container = range.commonAncestorContainer;
  const root = container.nodeType === Node.ELEMENT_NODE ? container : container.parentNode;
  if (!root) return [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });

  const pageBoxes = new Map<Element, DOMRect>();
  const rects: Rect[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent?.closest('.textLayer')) continue;
    const page = parent.closest<HTMLElement>('.page');
    if (!page) continue;

    const sub = document.createRange();
    sub.selectNodeContents(node);
    if (node === range.startContainer) sub.setStart(node, range.startOffset);
    if (node === range.endContainer) sub.setEnd(node, range.endOffset);

    let box = pageBoxes.get(page);
    if (!box) pageBoxes.set(page, (box = page.getBoundingClientRect()));

    for (const r of sub.getClientRects()) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      rects.push({
        p: Number(page.dataset.page),
        x: (r.left - box.left) / box.width,
        y: (r.top - box.top) / box.height,
        w: r.width / box.width,
        h: r.height / box.height,
      });
    }
  }
  return mergeRects(rects);
}

/** Une los fragmentos que están en la misma línea para que el resaltado quede continuo. */
export function mergeRects(input: Rect[]): Rect[] {
  const rects = [...input].sort((a, b) => a.p - b.p || a.y - b.y || a.x - b.x);
  const out: Rect[] = [];
  for (const r of rects) {
    const last = out[out.length - 1];
    const sameLine =
      last &&
      last.p === r.p &&
      Math.abs(last.y + last.h / 2 - (r.y + r.h / 2)) < Math.min(last.h, r.h) * 0.5 &&
      r.x <= last.x + last.w + 0.012;
    if (sameLine) {
      const x2 = Math.max(last.x + last.w, r.x + r.w);
      const y2 = Math.max(last.y + last.h, r.y + r.h);
      last.x = Math.min(last.x, r.x);
      last.y = Math.min(last.y, r.y);
      last.w = x2 - last.x;
      last.h = y2 - last.y;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

export function cleanText(s: string) {
  return s
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2') // palabras cortadas con guion al final de la línea
    .replace(/\s+/g, ' ')
    .trim();
}
