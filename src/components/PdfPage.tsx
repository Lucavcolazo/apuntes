import { memo, useEffect, useRef, useState } from 'react';
import type { RenderTask } from 'pdfjs-dist';
import type { ColorKey } from '../lib/db';
import { pdfjs, type PDFDocumentProxy } from '../lib/pdf';
import { registerTextLayer } from '../lib/textSelection';

export interface PageRect {
  key: string;
  id: string;
  color: ColorKey;
  hasNote: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  pdf: PDFDocumentProxy;
  n: number;
  width: number;
  height: number;
  scale: number;
  root: HTMLElement | null;
  rects: PageRect[];
}

/**
 * Una página: canvas (imagen), capa de subrayados y capa de texto seleccionable encima.
 * Solo se dibuja cuando está cerca de la pantalla, para aguantar PDFs largos.
 */
export const PdfPage = memo(function PdfPage({ pdf, n, width, height, scale, root, rects }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const unregisterText = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!root || !pageRef.current) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root, rootMargin: '1200px 0px' });
    io.observe(pageRef.current);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    if (!near) {
      unregisterText.current?.();
      unregisterText.current = null;
      canvasHost.current?.replaceChildren();
      textHost.current?.replaceChildren();
      return;
    }
    let cancelled = false;
    let task: RenderTask | undefined;
    let textLayer: InstanceType<typeof pdfjs.TextLayer> | undefined;

    // El canvas y el texto anteriores quedan estirados hasta que el nuevo está listo:
    // así al hacer zoom no parpadea en blanco.
    const timer = setTimeout(async () => {
      try {
        const page = await pdf.getPage(n);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        task = page.render({
          canvas,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await task.promise;
        if (cancelled) return;
        canvasHost.current?.replaceChildren(canvas);

        const layer = document.createElement('div');
        layer.className = 'textLayer';
        textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport });
        await textLayer.render();
        if (cancelled) return;
        unregisterText.current?.();
        unregisterText.current = registerTextLayer(layer);
        textHost.current?.replaceChildren(layer);
      } catch {
        /* render cancelado por zoom o scroll */
      }
    }, 30);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
      textLayer?.cancel();
    };
  }, [near, scale, pdf, n]);

  useEffect(() => () => unregisterText.current?.(), []);

  return (
    <div
      ref={pageRef}
      className="page"
      data-page={n}
      style={
        {
          width: Math.floor(width * scale),
          height: Math.floor(height * scale),
          '--scale-factor': scale,
          '--user-unit': 1,
          '--total-scale-factor': scale,
          '--scale-round-x': '1px',
          '--scale-round-y': '1px',
        } as React.CSSProperties
      }
    >
      <div className="canvasLayer" ref={canvasHost} />
      <div className="hlLayer">
        {rects.map((r) => (
          <div
            key={r.key}
            className={`hl hl-${r.color}${r.hasNote ? ' has-note' : ''}`}
            data-id={r.id}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
          />
        ))}
      </div>
      <div className="textHost" ref={textHost} />
    </div>
  );
});
