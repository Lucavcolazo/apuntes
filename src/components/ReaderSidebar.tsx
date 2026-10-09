import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from '../lib/pdf';
import { loadOutline, searchPdf, type OutlineItem, type SearchHit } from '../lib/pdfSearch';
import { Icon } from './Icon';

export type SidebarTab = 'outline' | 'search';

interface Props {
  pdf: PDFDocumentProxy;
  tab: SidebarTab;
  onTab: (t: SidebarTab) => void;
  page: number;
  onGoPage: (page: number) => void;
  onHits: (hits: SearchHit[], current: number) => void;
  onClose: () => void;
  focusToken: number;
}

export function ReaderSidebar({ pdf, tab, onTab, page, onGoPage, onHits, onClose, focusToken }: Props) {
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [current, setCurrent] = useState(0);
  const [searching, setSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const onHitsRef = useRef(onHits);
  onHitsRef.current = onHits;

  useEffect(() => {
    let alive = true;
    void loadOutline(pdf).then((o) => alive && setOutline(o));
    return () => {
      alive = false;
    };
  }, [pdf]);

  // ⌘F trae el foco al buscador aunque el panel ya esté abierto.
  useEffect(() => {
    if (tab === 'search') {
      input.current?.focus();
      input.current?.select();
    }
  }, [tab, focusToken]);

  useEffect(() => {
    const signal = { cancelled: false };
    if (query.trim().length < 2) {
      setHits([]);
      onHitsRef.current([], 0);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const found = await searchPdf(pdf, query, signal);
      if (signal.cancelled) return;
      setHits(found);
      setCurrent(0);
      setSearching(false);
      onHitsRef.current(found, 0);
    }, 220);
    return () => {
      signal.cancelled = true;
      clearTimeout(t);
    };
  }, [query, pdf]);

  const select = (i: number) => {
    if (!hits.length) return;
    const next = (i + hits.length) % hits.length;
    setCurrent(next);
    onHits(hits, next);
    list.current?.querySelector(`[data-hit="${next}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  // Sección actual del índice: la última que empieza en una página anterior o igual a la que leés.
  const currentSection = outline
    ? outline.reduce((best, item, i) => (item.page != null && item.page <= page ? i : best), -1)
    : -1;

  return (
    <aside className="reader-sidebar" aria-label="Índice y búsqueda">
      <header className="sidebar-head">
        <div className="mode-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'outline'} className={tab === 'outline' ? 'active' : ''} onClick={() => onTab('outline')}>
            Índice
          </button>
          <button role="tab" aria-selected={tab === 'search'} className={tab === 'search' ? 'active' : ''} onClick={() => onTab('search')}>
            Buscar
          </button>
        </div>
        <button className="icon-btn sm" onClick={onClose} title="Cerrar">
          <Icon name="x" size={16} />
        </button>
      </header>

      {tab === 'search' ? (
        <>
          <div className="search-box">
            <Icon name="search" size={15} />
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en este PDF"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  select(current + (e.shiftKey ? -1 : 1));
                }
                if (e.key === 'Escape') onClose();
              }}
            />
            {hits.length > 0 && (
              <span className="muted tabular search-count">
                {current + 1}/{hits.length}
              </span>
            )}
          </div>
          <div className="sidebar-list" ref={list}>
            {query.trim().length >= 2 && !searching && !hits.length && <p className="muted sidebar-empty">Sin resultados.</p>}
            {query.trim().length < 2 && (
              <p className="muted sidebar-empty">
                No distingue acentos ni mayúsculas. <kbd>Enter</kbd> pasa al siguiente.
              </p>
            )}
            {hits.map((h, i) => (
              <button key={h.id} data-hit={i} className={`search-hit ${i === current ? 'current' : ''}`} onClick={() => select(i)}>
                <span className="muted hit-page">p. {h.page}</span>
                <span className="hit-text">
                  {h.before.length >= 40 && '…'}
                  {h.before}
                  <mark>{h.match}</mark>
                  {h.after}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="sidebar-list">
          {outline === null && <p className="muted sidebar-empty">Cargando…</p>}
          {outline?.length === 0 && (
            <p className="muted sidebar-empty">Este PDF no trae índice. Probá con "Buscar" para encontrar un tema.</p>
          )}
          {outline?.map((item, i) => (
            <button
              key={i}
              className={`outline-item ${i === currentSection ? 'current' : ''}`}
              style={{ paddingLeft: 12 + item.depth * 14 }}
              onClick={() => item.page && onGoPage(item.page)}
              disabled={!item.page}
            >
              <span className="outline-title">{item.title}</span>
              {item.page && <span className="muted tabular">{item.page}</span>}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
