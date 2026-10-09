import { COLOR_KEYS, COLORS, type Labels } from './colors';
import type { Highlight } from './db';

export type GroupBy = 'page' | 'label';

function groups(list: Highlight[], by: GroupBy, labels: Labels): [string, Highlight[]][] {
  if (by === 'page') {
    return [...Map.groupBy(list, (h) => h.page)].map(([p, items]) => [`Página ${p}`, items]);
  }
  return COLOR_KEYS.map((k) => [labels[k], list.filter((h) => h.color === k)] as [string, Highlight[]]).filter(
    ([, items]) => items.length,
  );
}

const today = () =>
  new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

export function toMarkdown(title: string, list: Highlight[], by: GroupBy, labels: Labels) {
  let md = `# ${title}\n\n${list.length} subrayados · exportado el ${today()}\n\n`;
  for (const [group, items] of groups(list, by, labels)) {
    md += `## ${group}\n\n`;
    for (const h of items) {
      md += by === 'page' ? `- **${labels[h.color]}:** ${h.text}\n` : `- ${h.text} (p. ${h.page})\n`;
      if (h.note) md += `  > ${h.note.replace(/\n/g, '\n  > ')}\n`;
    }
    md += '\n';
  }
  return md;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Arma un resumen imprimible (o para guardar como PDF desde el diálogo de impresión). */
export function printHighlights(title: string, list: Highlight[], by: GroupBy, labels: Labels) {
  const body = groups(list, by, labels)
    .map(
      ([group, items]) => `<h2>${esc(group)}</h2>${items
        .map(
          (h) => `<div class="item" style="--c:${COLORS[h.color].hex}">
            <div class="meta">${by === 'page' ? esc(labels[h.color]) : `Página ${h.page}`}</div>
            <p>${esc(h.text)}</p>${h.note ? `<p class="note">${esc(h.note)}</p>` : ''}
          </div>`,
        )
        .join('')}`,
    )
    .join('');

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    body{font-family:"JetBrains Mono Variable","JetBrains Mono",ui-monospace,Menlo,monospace;color:#0a0a0a;max-width:680px;margin:40px auto;padding:0 24px;line-height:1.55}
    h1{font-size:26px;margin:0 0 4px;letter-spacing:-.01em}
    .sub{color:#666;font-size:13px;margin-bottom:28px}
    h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#666;margin:28px 0 10px;border-bottom:1px solid #e5e5e5;padding-bottom:6px}
    .item{border-left:4px solid var(--c);padding:2px 0 2px 14px;margin:0 0 14px;break-inside:avoid}
    .meta{font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.05em}
    p{margin:2px 0 0;font-size:13px}
    .note{color:#444;font-size:13px}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  </style></head><body>
  <h1>${esc(title)}</h1><div class="sub">${list.length} subrayados · ${today()}</div>${body}</body></html>`;

  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 2000);
  };
  document.body.append(frame);
}
