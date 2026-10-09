import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Home } from './components/Home';
import { BreakOverlay } from './components/Pomodoro';
import { Reader } from './components/Reader';
import { toast, Toaster } from './components/Toast';
import { usePomodoro } from './hooks/usePomodoro';
import { DEFAULT_LABELS, type Labels } from './lib/colors';
import { db, sortHighlights } from './lib/db';
import { importPdfs, pickPdfs, sourcesFromDrop, type Source } from './lib/files';
import { useLocalState } from './lib/storage';

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function App() {
  const docs = useLiveQuery(() => db.docs.toArray(), [], []);
  const [openId, setOpenId] = useState<string | null>(null);
  const doc = docs.find((d) => d.id === openId) ?? null;
  const highlights = useLiveQuery(
    async () => (openId ? sortHighlights(await db.highlights.where('docId').equals(openId).toArray()) : []),
    [openId],
    [],
  );
  const [labels, setLabels] = useLocalState<Labels>('apuntes.labels', DEFAULT_LABELS);
  const [theme, setTheme] = useLocalState<'light' | 'dark'>('apuntes.theme', prefersDark() ? 'dark' : 'light');
  const pomo = usePomodoro();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const open = (id: string) => {
    setOpenId(id);
    if (pomo.settings.startOnOpen && !pomo.running && pomo.mode === 'focus') {
      pomo.start();
      toast(`Pomodoro en marcha: ${pomo.settings.focus} min de lectura`);
    }
  };

  const handleImport = async (sources: Source[]) => {
    if (!sources.length) return;
    try {
      const imported = await importPdfs(sources);
      if (!imported.length) return toast('Solo se pueden subir archivos PDF');
      const found = imported.reduce((n, i) => n + i.found, 0);
      toast(
        `${imported.length === 1 ? 'PDF agregado' : `${imported.length} PDFs agregados`}` +
          (found ? ` · ${found} subrayados encontrados en el archivo` : ''),
      );
    } catch {
      toast('No se pudo leer ese PDF');
    }
  };

  const upload = async () => {
    const sources = await pickPdfs(fileInput.current!);
    if (sources) await handleImport(sources);
  };

  // Arrastrar PDFs a cualquier parte de la ventana.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      await handleImport(await sourcesFromDrop(e.dataTransfer!));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  });

  return (
    <>
      {doc ? (
        <Reader
          key={doc.id}
          doc={doc}
          highlights={highlights}
          labels={labels}
          setLabels={setLabels}
          pomo={pomo}
          onBack={() => setOpenId(null)}
        />
      ) : (
        <>
          <Home
            docs={docs}
            pomo={pomo}
            theme={theme}
            onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            onOpen={open}
            onUpload={upload}
          />
          <BreakOverlay pomo={pomo} />
        </>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          await handleImport(files.map((file) => ({ file })));
        }}
      />
      {dragging && (
        <div className="drop-overlay">
          <div>Soltá los PDFs para agregarlos</div>
        </div>
      )}
      <Toaster />
    </>
  );
}
