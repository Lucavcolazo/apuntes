import { useState } from 'react';
import { COLOR_KEYS, COLORS, type Labels } from '../lib/colors';
import type { ColorKey, Doc, Highlight } from '../lib/db';
import { printHighlights, toMarkdown, type GroupBy } from '../lib/export';
import { downloadBlob } from '../lib/download';
import { useLocalState } from '../lib/storage';
import { Icon } from './Icon';
import { toast } from './Toast';

interface Props {
  doc: Doc;
  highlights: Highlight[];
  labels: Labels;
  setLabels: (l: Labels) => void;
  onJump: (h: Highlight) => void;
  onHover: (id: string) => void;
  onClose: () => void;
}

export function HighlightsPanel({ doc, highlights, labels, setLabels, onJump, onHover, onClose }: Props) {
  const [filter, setFilter] = useState<ColorKey | 'all'>('all');
  const [groupBy, setGroupBy] = useLocalState<GroupBy>('apuntes.groupBy', 'page');
  const [editing, setEditing] = useState<ColorKey | null>(null);

  const list = filter === 'all' ? highlights : highlights.filter((h) => h.color === filter);
  const counts = Object.fromEntries(COLOR_KEYS.map((k) => [k, highlights.filter((h) => h.color === k).length]));

  const markdown = () => toMarkdown(doc.name, list, groupBy, labels);

  return (
    <aside className="hl-panel" aria-label="Subrayados">
      <header className="hl-panel-head">
        <h2>
          Subrayados <span className="count">{highlights.length}</span>
        </h2>
        <button className="icon-btn sm" onClick={onClose} title="Cerrar panel">
          <Icon name="x" size={16} />
        </button>
      </header>

      <div className="chips">
        <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Todos
        </button>
        {COLOR_KEYS.map((k) =>
          editing === k ? (
            <input
              key={k}
              className="chip chip-input"
              aria-label={`Nombre de la etiqueta`}
              autoFocus
              defaultValue={labels[k]}
              style={{ '--c': COLORS[k].hex } as React.CSSProperties}
              onBlur={(e) => {
                setLabels({ ...labels, [k]: e.target.value.trim() || labels[k] });
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setEditing(null);
              }}
            />
          ) : (
            <button
              key={k}
              className={`chip ${filter === k ? 'active' : ''}`}
              style={{ '--c': COLORS[k].hex } as React.CSSProperties}
              onClick={() => setFilter(filter === k ? 'all' : k)}
              onDoubleClick={() => setEditing(k)}
              title="Doble clic para renombrar"
            >
              <span className="dot" />
              {labels[k]}
              <span className="chip-count">{counts[k]}</span>
            </button>
          ),
        )}
      </div>

      <div className="hl-list">
        {list.length === 0 && (
          <div className="hl-empty">
            <Icon name="highlighter" size={22} />
            <p>
              Seleccioná texto en el PDF y elegí un color. También podés usar las teclas <kbd>1</kbd>–<kbd>4</kbd>.
            </p>
          </div>
        )}
        {list.map((h) => (
          <button
            key={h.id}
            className="hl-item"
            style={{ '--c': COLORS[h.color].hex } as React.CSSProperties}
            onClick={() => onJump(h)}
            onMouseEnter={() => onHover(h.id)}
          >
            <div className="hl-meta">
              p. {h.page} · {labels[h.color]}
            </div>
            <p className="hl-text">{h.text || <span className="muted">(sin texto)</span>}</p>
            {h.note && <p className="hl-note">{h.note}</p>}
          </button>
        ))}
      </div>

      <footer className="hl-export">
        <div className="export-row">
          <span className="muted">Exportar {filter === 'all' ? 'todo' : labels[filter].toLowerCase()} agrupado por</span>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            <option value="page">página</option>
            <option value="label">etiqueta</option>
          </select>
        </div>
        <div className="export-btns">
          <button
            className="btn ghost sm"
            disabled={!list.length}
            onClick={() => void navigator.clipboard.writeText(markdown()).then(() => toast('Resumen copiado'))}
          >
            <Icon name="copy" size={14} /> Copiar
          </button>
          <button
            className="btn ghost sm"
            disabled={!list.length}
            onClick={() => downloadBlob(new Blob([markdown()], { type: 'text/markdown' }), `${doc.name} - subrayados.md`)}
          >
            <Icon name="download" size={14} /> Markdown
          </button>
          <button
            className="btn ghost sm"
            disabled={!list.length}
            onClick={() => printHighlights(doc.name, list, groupBy, labels)}
          >
            <Icon name="print" size={14} /> Imprimir
          </button>
        </div>
      </footer>
    </aside>
  );
}
