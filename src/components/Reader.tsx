import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useHighlightHistory } from '../hooks/useHighlightHistory';
import type { Pomodoro } from '../hooks/usePomodoro';
import { COLOR_KEYS, COLORS, type Labels } from '../lib/colors';
import { db, uid, type ColorKey, type Doc, type Highlight } from '../lib/db';
import { autoSaveToOriginal, canSaveToOriginal, savePdf } from '../lib/files';
import { cleanText, selectionRects } from '../lib/geometry';
import { loadPdf, type PDFDocumentProxy } from '../lib/pdf';
import { useLocalState } from '../lib/storage';
import { HighlightPopover } from './HighlightPopover';
import { HighlightsPanel } from './HighlightsPanel';
import { Icon } from './Icon';
import { BreakOverlay, MiniTomato } from './Pomodoro';
import { PdfPage, type PageRect } from './PdfPage';
import { toast } from './Toast';

interface Props {
  doc: Doc;
  folderName?: string;
  highlights: Highlight[];
  labels: Labels;
  setLabels: (l: Labels) => void;
  pomo: Pomodoro;
  onBack: () => void;
}

type Tone = 'paper' | 'cream' | 'night';
const TONES: Record<Tone, string> = { paper: 'Papel', cream: 'Crema', night: 'Noche' };
const NEXT_TONE: Record<Tone, Tone> = { paper: 'cream', cream: 'night', night: 'paper' };

const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function Reader({ doc, folderName, highlights, labels, setLabels, pomo, onBack }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<HTMLDivElement | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [page, setPage] = useState(doc.lastPage || 1);
  const [pageInput, setPageInput] = useState(String(doc.lastPage || 1));
  const [selBox, setSelBox] = useState<{ x: number; y: number } | null>(null);
  const [popover, setPopover] = useState<{ id: string; x: number; y: number } | null>(null);
  const anchor = useRef<{ page: number; frac: number } | null>(null);
  const [panelOpen, setPanelOpen] = useLocalState('apuntes.panelOpen', true);
  const [tone, setTone] = useLocalState<Tone>('apuntes.tone', 'cream');
  const [idle, setIdle] = useState(false);
  const [saving, setSaving] = useState(false);
  const history = useHighlightHistory(doc.id);
  // Marcador fijo: con un color elegido, cada selección se subraya sola.
  const [marker, setMarker] = useLocalState<ColorKey | null>('apuntes.marker', null);
  const markerRef = useRef(marker);
  markerRef.current = marker;
  const altKey = useRef(false);

  // --- Carga del PDF ---------------------------------------------------------
  useEffect(() => {
    let alive = true;
    let loaded: PDFDocumentProxy | undefined;
    (async () => {
      try {
        const file = await db.files.get(doc.id);
        if (!file) throw new Error('missing');
        loaded = await loadPdf(file.blob);
        if (!alive) return;
        const dims: { w: number; h: number }[] = [];
        for (let i = 1; i <= loaded.numPages; i++) {
          const vp = (await loaded.getPage(i)).getViewport({ scale: 1 });
          dims.push({ w: vp.width, h: vp.height });
        }
        if (!alive) return;
        const available = (viewerRef.current?.clientWidth ?? 900) - 48;
        const fit = available / Math.max(...dims.map((d) => d.w));
        anchor.current = { page: doc.lastPage || 1, frac: 0 };
        setScale(doc.scale ?? clamp(fit, 0.5, 1.5));
        setSizes(dims);
        setPdf(loaded);
        void db.docs.update(doc.id, { openedAt: Date.now(), pages: loaded.numPages });
      } catch {
        if (alive) setError('No se pudo abrir este PDF.');
      }
    })();
    return () => {
      alive = false;
      void loaded?.loadingTask.destroy();
    };
  }, [doc.id]);

  // --- Página actual y progreso ----------------------------------------------
  const pageEls = () => viewerRef.current?.querySelectorAll<HTMLElement>('.page') ?? [];

  const onScroll = useCallback(() => {
    const v = viewerRef.current;
    if (!v) return;
    const y = v.scrollTop + v.clientHeight * 0.35;
    let current = 1;
    for (const el of pageEls()) {
      if (el.offsetTop <= y) current = Number(el.dataset.page);
      else break;
    }
    setPage(current);
    setPopover(null);
  }, []);

  useEffect(() => {
    setPageInput(String(page));
    const t = setTimeout(() => void db.docs.update(doc.id, { lastPage: page }), 600);
    return () => clearTimeout(t);
  }, [page, doc.id]);

  const goTo = (n: number, smooth = false) => {
    const el = pageEls()[clamp(n, 1, sizes.length) - 1];
    if (el) viewerRef.current?.scrollTo({ top: el.offsetTop - 72, behavior: smooth ? 'smooth' : 'auto' });
  };

  // --- Zoom (manteniendo el lugar de lectura) --------------------------------
  const zoomTo = useCallback(
    (next: number) => {
      const v = viewerRef.current;
      const el = pageEls()[page - 1];
      if (v && el) anchor.current = { page, frac: (v.scrollTop - el.offsetTop) / el.offsetHeight };
      setScale(clamp(Number(next.toFixed(3)), 0.4, 4));
    },
    [page],
  );

  useLayoutEffect(() => {
    const a = anchor.current;
    const el = a && pageEls()[a.page - 1];
    if (a && el && viewerRef.current) {
      viewerRef.current.scrollTop = el.offsetTop + a.frac * el.offsetHeight - (a.frac === 0 ? 72 : 0);
      anchor.current = null;
    }
  }, [scale, pdf]);

  useEffect(() => {
    if (!pdf) return;
    const t = setTimeout(() => void db.docs.update(doc.id, { scale }), 500);
    return () => clearTimeout(t);
  }, [scale, pdf, doc.id]);

  const zoomStep = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOM_STEPS.find((s) => s > scale + 0.01) : [...ZOOM_STEPS].reverse().find((s) => s < scale - 0.01);
    if (next) zoomTo(next);
  };
  const fitWidth = () => {
    const available = (viewerRef.current?.clientWidth ?? 900) - 48;
    zoomTo(available / Math.max(...sizes.map((d) => d.w)));
  };

  // Pinch del trackpad / ctrl + rueda.
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(scale * Math.exp(-e.deltaY * 0.01));
    };
    v.addEventListener('wheel', onWheel, { passive: false });
    return () => v.removeEventListener('wheel', onWheel);
  }, [scale, zoomTo]);

  // --- Selección → subrayado ---------------------------------------------------
  const pointerDown = useRef(false);

  /** La selección actual, si es texto dentro del PDF. */
  const selectionInViewer = useCallback(() => {
    const sel = getSelection();
    const v = viewerRef.current;
    if (!sel || sel.isCollapsed || !sel.rangeCount || !v) return null;
    const range = sel.getRangeAt(0);
    if (!v.contains(range.commonAncestorContainer) || !sel.toString().trim()) return null;
    return range;
  }, []);

  const checkSelection = useCallback(() => {
    const range = selectionInViewer();
    if (!range) return setSelBox(null);
    const boxes = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0 && r.height < 120);
    if (!boxes.length) return setSelBox(null);
    const first = boxes[0];
    const last = boxes[boxes.length - 1];
    setSelBox(first.top > 110 ? { x: first.left + first.width / 2, y: first.top - 8 } : { x: last.left + last.width / 2, y: last.bottom + 52 });
    setPopover(null);
  }, [selectionInViewer]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onSelectionChange = () => {
      if (pointerDown.current) return;
      clearTimeout(t);
      t = setTimeout(checkSelection, 120);
    };
    const onPointerUp = () => {
      if (!pointerDown.current) return;
      pointerDown.current = false;
      setTimeout(() => {
        const color = markerRef.current;
        if (color && !altKey.current && selectionInViewer()) void addHighlightRef.current(color);
        else checkSelection();
      }, 0);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      clearTimeout(t);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [checkSelection, selectionInViewer]);

  const addHighlight = useCallback(
    async (color: ColorKey) => {
      const sel = getSelection();
      if (!sel?.rangeCount) return;
      const rects = selectionRects(sel.getRangeAt(0));
      const text = cleanText(sel.toString());
      sel.removeAllRanges();
      setSelBox(null);
      if (!rects.length || !text) return;
      await history.add({
        id: uid(),
        docId: doc.id,
        color,
        rects,
        page: rects[0].p,
        text,
        note: '',
        createdAt: Date.now(),
      });
    },
    [doc.id, history],
  );
  const addHighlightRef = useRef(addHighlight);
  addHighlightRef.current = addHighlight;

  const chooseMarker = (color: ColorKey | null) => {
    setMarker(color);
    if (color && color !== marker) toast(`Subrayás con ${labels[color]} · Esc o el mismo color para apagarlo`);
    if (!color && marker) toast('Marcador apagado');
  };

  /** Color elegido desde la barrita: subraya y queda como marcador. */
  const highlightWith = (color: ColorKey) => {
    void addHighlight(color);
    chooseMarker(color);
  };

  const undo = async () => {
    const kind = await history.undo();
    if (kind) toast(kind === 'add' ? 'Subrayado deshecho' : kind === 'remove' ? 'Subrayado recuperado' : 'Cambio deshecho');
  };
  const redo = async () => {
    if (await history.redo()) toast('Rehecho');
  };

  const copySelection = () => {
    const text = cleanText(getSelection()?.toString() ?? '');
    if (text) void navigator.clipboard.writeText(text).then(() => toast('Texto copiado'));
  };

  // Click sobre un subrayado: la capa de texto está arriba, así que buscamos debajo del puntero.
  const onClick = (e: React.MouseEvent) => {
    if (!getSelection()?.isCollapsed) return;
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.classList.contains('hl')) as
      | HTMLElement
      | undefined;
    setPopover(hit ? { id: hit.dataset.id!, x: e.clientX, y: e.clientY } : null);
  };

  const hoverFrame = useRef(0);
  const onMouseMove = (e: React.MouseEvent) => {
    if (e.buttons) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = requestAnimationFrame(() => {
      const over = document.elementsFromPoint(clientX, clientY).some((el) => el.classList.contains('hl'));
      viewerRef.current?.classList.toggle('over-hl', over);
    });
  };

  useEffect(() => {
    if (!popover) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.popover, .viewer')) setPopover(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [popover]);

  // --- Teclado ---------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea, select, dialog')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void (e.shiftKey ? redo() : undo());
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        void redo();
      } else if (!mod && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        const color = COLOR_KEYS[Number(e.key) - 1];
        if (selBox) highlightWith(color);
        else chooseMarker(marker === color ? null : color);
      } else if (!mod && e.key === '0') {
        chooseMarker(null);
      } else if (e.key === 'Escape') {
        if (popover || selBox) {
          setPopover(null);
          setSelBox(null);
        } else if (marker) {
          chooseMarker(null);
        }
      } else if (!e.metaKey && !e.ctrlKey && (e.key === '+' || e.key === '=')) {
        zoomStep(1);
      } else if (!e.metaKey && !e.ctrlKey && e.key === '-') {
        zoomStep(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- API para el panel de subrayados ----------------------------------------
  const flash = useCallback((id: string) => {
    viewerRef.current?.querySelectorAll<HTMLElement>(`.hl[data-id="${id}"]`).forEach((el) => {
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    });
  }, []);

  const jumpTo = (h: Highlight) => {
    const r = h.rects[0];
    const el = pageEls()[r.p - 1];
    const v = viewerRef.current;
    if (!el || !v) return;
    v.scrollTo({ top: el.offsetTop + r.y * el.offsetHeight - v.clientHeight * 0.3, behavior: 'smooth' });
    setTimeout(() => flash(h.id), 350);
  };

  // --- Guardar los subrayados dentro del PDF ----------------------------------
  const unsaved = (doc.changedAt ?? 0) > (doc.savedAt ?? 0);

  const save = async () => {
    setSaving(true);
    try {
      const where = await savePdf(doc);
      toast(where === 'original' ? 'Subrayados guardados en tu PDF' : 'Descargaste el PDF con los subrayados');
    } catch {
      toast('No se pudo guardar el PDF');
    } finally {
      setSaving(false);
    }
  };

  // Si ya diste permiso sobre el archivo original, se guarda solo a los pocos segundos.
  useEffect(() => {
    if (!unsaved) return;
    const t = setTimeout(() => void autoSaveToOriginal(doc).catch(() => {}), 2000);
    return () => clearTimeout(t);
  }, [doc.changedAt]);

  // --- Modo inmersivo: la barra se esconde si no movés el mouse ----------------
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = (e: Event) => {
      setIdle(false);
      clearTimeout(t);
      const overBar = (e.target as HTMLElement | null)?.closest?.('.reader-bar, .hl-panel, dialog');
      if (!overBar) t = setTimeout(() => setIdle(true), 2800);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    t = setTimeout(() => setIdle(true), 2800);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  // Rectángulos agrupados por página para cada PdfPage.
  const rectsByPage = useMemo(() => {
    const map = new Map<number, PageRect[]>();
    for (const h of highlights) {
      h.rects.forEach((r, i) => {
        const list = map.get(r.p) ?? [];
        list.push({ key: `${h.id}-${i}`, id: h.id, color: h.color, hasNote: !!h.note && i === 0, ...r });
        map.set(r.p, list);
      });
    }
    return map;
  }, [highlights]);

  const popoverHighlight = popover && highlights.find((h) => h.id === popover.id);

  return (
    <div className={`reader tone-${tone} ${idle && !popover && !selBox ? 'idle' : ''} ${panelOpen ? 'panel-open' : ''}`}>
      <header className="reader-bar">
        <div className="bar-left">
          <button className="btn ghost sm back" onClick={onBack} title="Volver a la biblioteca">
            <Icon name="book" size={16} /> Biblioteca
          </button>
          <div className="bar-title" title={doc.name}>
            <span className="name">{doc.name}</span>
            {folderName && <span className="subject">{folderName}</span>}
          </div>
        </div>

        <div className="bar-center">
          <form
            className="page-nav"
            onSubmit={(e) => {
              e.preventDefault();
              goTo(Number(pageInput) || 1);
              (document.activeElement as HTMLElement)?.blur();
            }}
          >
            <input
              className="tabular"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
              onFocus={(e) => e.target.select()}
              aria-label="Página"
            />
            <span className="muted tabular">/ {sizes.length || '–'}</span>
          </form>
          <div className="zoom">
            <button className="icon-btn sm" onClick={() => zoomStep(-1)} title="Alejar (−)">
              <Icon name="minus" size={15} />
            </button>
            <button className="zoom-label tabular" onClick={() => zoomTo(1)} title="Tamaño real">
              {Math.round(scale * 100)}%
            </button>
            <button className="icon-btn sm" onClick={() => zoomStep(1)} title="Acercar (+)">
              <Icon name="plus" size={15} />
            </button>
            <button className="icon-btn sm" onClick={fitWidth} title="Ajustar al ancho">
              <Icon name="fit" size={15} />
            </button>
          </div>
          <button className="btn ghost sm tone-btn" onClick={() => setTone(NEXT_TONE[tone])} title="Tono de las páginas">
            <Icon name={tone === 'night' ? 'moon' : 'sun'} size={15} /> {TONES[tone]}
          </button>
          <div className="marker" role="group" aria-label="Marcador">
            <Icon name="highlighter" size={15} />
            {COLOR_KEYS.map((k, i) => (
              <button
                key={k}
                className={`swatch sm ${marker === k ? 'active' : ''}`}
                style={{ '--c': COLORS[k].hex } as React.CSSProperties}
                onClick={() => chooseMarker(marker === k ? null : k)}
                title={marker === k ? `${labels[k]}: tocá para apagar` : `Subrayar siempre con ${labels[k]} (${i + 1})`}
                aria-pressed={marker === k}
              />
            ))}
          </div>
          <div className="history-btns">
            <button className="icon-btn sm" onClick={undo} disabled={!history.canUndo} title="Deshacer (⌘Z)">
              <Icon name="undo" size={15} />
            </button>
            <button className="icon-btn sm" onClick={redo} disabled={!history.canRedo} title="Rehacer (⌘⇧Z)">
              <Icon name="redo" size={15} />
            </button>
          </div>
        </div>

        <div className="bar-right">
          <button
            className={`btn sm save-btn ${unsaved ? 'unsaved' : ''}`}
            onClick={save}
            disabled={saving}
            title={
              canSaveToOriginal
                ? 'Escribe los subrayados dentro del archivo PDF'
                : 'Descarga el PDF con los subrayados adentro (se ven en Libros, Vista Previa, el celu…)'
            }
          >
            <Icon name="save" size={15} />
            {saving ? 'Guardando…' : unsaved ? 'Guardar en PDF' : 'Guardado'}
          </button>
          <MiniTomato pomo={pomo} />
          <button
            className={`icon-btn ${panelOpen ? 'active' : ''}`}
            onClick={() => setPanelOpen(!panelOpen)}
            title="Subrayados"
          >
            <Icon name="sidebarRight" />
            {highlights.length > 0 && <span className="badge">{highlights.length}</span>}
          </button>
        </div>
      </header>

      <div className="reader-body">
      <div
        className="viewer"
        ref={(el) => {
          viewerRef.current = el;
          setViewer(el);
        }}
        onScroll={onScroll}
        data-marker={marker ?? undefined}
        onPointerDown={(e) => {
          pointerDown.current = true;
          altKey.current = e.altKey;
          setSelBox(null);
        }}
        onClick={onClick}
        onMouseMove={onMouseMove}
      >
        {error && <div className="viewer-message">{error}</div>}
        {!pdf && !error && <div className="viewer-message muted">Abriendo…</div>}
        {pdf && (
          <div className="pages">
            {sizes.map((s, i) => (
              <PdfPage
                key={i}
                pdf={pdf}
                n={i + 1}
                width={s.w}
                height={s.h}
                scale={scale}
                root={viewer}
                rects={rectsByPage.get(i + 1) ?? EMPTY}
              />
            ))}
          </div>
        )}
      </div>
      {panelOpen && (
        <HighlightsPanel
          doc={doc}
          highlights={highlights}
          labels={labels}
          setLabels={setLabels}
          onJump={jumpTo}
          onHover={flash}
          onClose={() => setPanelOpen(false)}
        />
      )}
      <BreakOverlay pomo={pomo} />
      </div>

      {selBox && (
        <div
          className="sel-toolbar"
          style={{ left: selBox.x, top: selBox.y }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault() /* no perder la selección */}
        >
          {COLOR_KEYS.map((k, i) => (
            <button
              key={k}
              className="swatch"
              style={{ '--c': COLORS[k].hex } as React.CSSProperties}
              onClick={() => highlightWith(k)}
              title={`${labels[k]} (${i + 1}) · queda como marcador`}
              aria-label={`Subrayar: ${labels[k]}`}
            />
          ))}
          <span className="sep" />
          <button className="icon-btn sm" onClick={copySelection} title="Copiar">
            <Icon name="copy" size={15} />
          </button>
        </div>
      )}

      {popover && popoverHighlight && (
        <HighlightPopover
          key={popover.id}
          highlight={popoverHighlight}
          x={popover.x}
          y={popover.y}
          labels={labels}
          history={history}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}

const EMPTY: PageRect[] = [];
