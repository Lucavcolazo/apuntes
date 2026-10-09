/**
 * Selección de texto prolija sobre las capas de pdf.js.
 *
 * Adaptado de TextLayerBuilder (pdfjs-dist/web/pdf_viewer.mjs): sin esto, al arrastrar
 * por los espacios entre líneas la selección "salta" y agarra medio párrafo.
 * El truco es un div `.endOfContent` que se estira mientras seleccionás y,
 * en Safari/Chromium viejos, se mueve justo detrás del final de la selección.
 */
const layers = new Map<HTMLElement, HTMLElement>();
let controller: AbortController | null = null;

function reset(end: HTMLElement, layer: HTMLElement) {
  layer.append(end);
  end.style.width = '';
  end.style.height = '';
  end.style.userSelect = '';
  layer.classList.remove('selecting');
}

function needsAnchorTrick(sample: HTMLElement) {
  if (getComputedStyle(sample).getPropertyValue('-moz-user-select') === 'none') return false;
  const chromium = /\bChrome\/(\d+)\b/.exec(navigator.userAgent)?.[1];
  return !(chromium && parseInt(chromium, 10) >= 148);
}

function enableGlobalListener() {
  if (controller) return;
  controller = new AbortController();
  const { signal } = controller;
  let pointerDown = false;
  let prevRange: Range | null = null;
  let anchorTrick: boolean | undefined;

  document.addEventListener('pointerdown', () => (pointerDown = true), { signal });
  document.addEventListener(
    'pointerup',
    () => {
      pointerDown = false;
      layers.forEach(reset);
    },
    { signal },
  );
  window.addEventListener(
    'blur',
    () => {
      pointerDown = false;
      layers.forEach(reset);
    },
    { signal },
  );
  document.addEventListener('keyup', () => !pointerDown && layers.forEach(reset), { signal });

  document.addEventListener(
    'selectionchange',
    () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) {
        layers.forEach(reset);
        return;
      }
      const active = new Set<HTMLElement>();
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        for (const layer of layers.keys()) if (range.intersectsNode(layer)) active.add(layer);
      }
      for (const [layer, end] of layers) {
        if (active.has(layer)) layer.classList.add('selecting');
        else reset(end, layer);
      }

      anchorTrick ??= needsAnchorTrick(layers.keys().next().value!);
      if (!anchorTrick) return;

      const range = selection.getRangeAt(0);
      const modifyStart =
        prevRange &&
        (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
          range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);
      let anchor: Node = modifyStart ? range.startContainer : range.endContainer;
      if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode!;
      if (!modifyStart && range.endOffset === 0) {
        do {
          while (!anchor.previousSibling) anchor = anchor.parentNode!;
          anchor = anchor.previousSibling!;
        } while (!anchor.childNodes.length);
      }
      const parentLayer = anchor.parentElement?.closest<HTMLElement>('.textLayer');
      const end = parentLayer && layers.get(parentLayer);
      if (parentLayer && end) {
        end.style.width = parentLayer.style.width;
        end.style.height = parentLayer.style.height;
        end.style.userSelect = 'text';
        anchor.parentElement!.insertBefore(end, modifyStart ? anchor : anchor.nextSibling);
      }
      prevRange = range.cloneRange();
    },
    { signal },
  );
}

/** Llamar después de `TextLayer.render()`. Devuelve la función para desregistrar. */
export function registerTextLayer(layer: HTMLElement) {
  const end = document.createElement('div');
  end.className = 'endOfContent';
  layer.append(end);
  const onMouseDown = () => layer.classList.add('selecting');
  layer.addEventListener('mousedown', onMouseDown);
  layers.set(layer, end);
  enableGlobalListener();

  return () => {
    layer.removeEventListener('mousedown', onMouseDown);
    layers.delete(layer);
    if (layers.size === 0) {
      controller?.abort();
      controller = null;
    }
  };
}
