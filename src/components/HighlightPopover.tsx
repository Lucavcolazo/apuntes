import { useEffect, useRef, useState } from 'react';
import { COLOR_KEYS, COLORS, type Labels } from '../lib/colors';
import type { HighlightHistory } from '../hooks/useHighlightHistory';
import type { Highlight } from '../lib/db';
import { Icon } from './Icon';
import { toast } from './Toast';

interface Props {
  highlight: Highlight;
  x: number;
  y: number;
  labels: Labels;
  history: HighlightHistory;
  onClose: () => void;
}

export function HighlightPopover({ highlight: h, x, y, labels, history, onClose }: Props) {
  const [note, setNote] = useState(h.note);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y + 12 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(Math.max(12, x - width / 2), window.innerWidth - width - 12);
    const top = y + 12 + height > window.innerHeight - 12 ? y - height - 12 : y + 12;
    setPos({ left, top });
  }, [x, y]);

  // Guarda la nota con una pequeña demora mientras escribís.
  useEffect(() => {
    if (note === h.note) return;
    const t = setTimeout(() => void history.update(h, { note }), 400);
    return () => clearTimeout(t);
  }, [note, h, history]);

  // Si se deshace un cambio de nota con ⌘Z, el cuadro de texto lo refleja.
  useEffect(() => setNote(h.note), [h.note]);

  const setColor = (color: Highlight['color']) => {
    if (color !== h.color) void history.update(h, { color });
  };

  const remove = async () => {
    await history.remove(h);
    onClose();
  };

  return (
    <div ref={ref} className="popover" style={pos} onPointerDown={(e) => e.stopPropagation()}>
      <div className="swatches">
        {COLOR_KEYS.map((k) => (
          <button
            key={k}
            className={`swatch ${h.color === k ? 'active' : ''}`}
            style={{ '--c': COLORS[k].hex } as React.CSSProperties}
            onClick={() => setColor(k)}
            title={labels[k]}
            aria-label={labels[k]}
          />
        ))}
        <span className="swatch-label">{labels[h.color]}</span>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Agregar una nota…"
        rows={3}
      />
      <div className="popover-actions">
        <button
          className="btn ghost sm"
          onClick={() => {
            void navigator.clipboard.writeText(h.text);
            toast('Texto copiado');
          }}
        >
          <Icon name="copy" size={14} /> Copiar
        </button>
        <button className="btn ghost sm danger" onClick={remove}>
          <Icon name="trash" size={14} /> Borrar
        </button>
      </div>
    </div>
  );
}
