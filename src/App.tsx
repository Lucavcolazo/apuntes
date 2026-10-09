import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { AppNav } from './components/AppNav';
import { Evaluations } from './components/Evaluations';
import { Landing } from './components/Landing';
import { Library, type FolderView } from './components/Library';
import { Login } from './components/Login';
import { BreakOverlay } from './components/Pomodoro';
import { Reader } from './components/Reader';
import { toast, Toaster } from './components/Toast';
import { useFaviconProgress } from './hooks/useFaviconProgress';
import { usePomodoro } from './hooks/usePomodoro';
import { DEFAULT_LABELS, type Labels } from './lib/colors';
import { db, sortHighlights } from './lib/db';
import { importPdfs, pickPdfs, sourcesFromDrop, type Source } from './lib/files';
import { navigate, useLocation } from './lib/router';
import { useLocalState } from './lib/storage';

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function App() {
  const path = useLocation().split('#')[0];
  const readerId = path.match(/^\/apuntes\/([^/]+)\/?$/)?.[1] ?? null;
  const route = readerId
    ? 'reader'
    : path.startsWith('/apuntes')
      ? 'library'
      : path.startsWith('/parciales')
      ? 'evals'
      : path.startsWith('/entrar')
          ? 'login'
          : 'landing';

  const loadedDocs = useLiveQuery(() => db.docs.toArray());
  const docs = loadedDocs ?? [];
  const folders = useLiveQuery(() => db.folders.toArray());
  const [savedView, setView] = useLocalState<FolderView>('apuntes.folder', 'all');
  // Si la carpeta guardada ya no existe, mostramos "Todos".
  const view =
    savedView === 'all' || savedView === 'none' || !folders || folders.some((f) => f.id === savedView)
      ? savedView
      : 'all';
  // Lo que subís desde la biblioteca entra en la carpeta abierta.
  const folderId = route === 'library' && view !== 'all' && view !== 'none' ? view : null;
  const doc = docs.find((d) => d.id === readerId) ?? null;
  const highlights = useLiveQuery(
    async () => (readerId ? sortHighlights(await db.highlights.where('docId').equals(readerId).toArray()) : []),
    [readerId],
    [],
  );
  const [labels, setLabels] = useLocalState<Labels>('apuntes.labels', DEFAULT_LABELS);
  const [theme, setTheme] = useLocalState<'light' | 'dark'>('apuntes.theme', prefersDark() ? 'dark' : 'light');
  const pomo = usePomodoro();
  useFaviconProgress(pomo);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // El repaso se sacó por ahora: los links viejos van a la biblioteca.
  useEffect(() => {
    if (path.startsWith('/repaso')) navigate('/apuntes', { replace: true });
  }, [path]);

  // Un link a un libro que ya no existe vuelve a la biblioteca.
  useEffect(() => {
    if (readerId && loadedDocs && !doc) navigate('/apuntes', { replace: true });
  }, [readerId, loadedDocs, doc]);

  useEffect(() => {
    if (route === 'library' || route === 'evals') window.scrollTo(0, 0);
  }, [route]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const open = (id: string) => {
    navigate(`/apuntes/${id}`);
    if (pomo.settings.startOnOpen && !pomo.running && pomo.mode === 'focus') {
      pomo.start();
      toast(`Pomodoro en marcha: ${pomo.settings.focus} min de lectura`);
    }
  };

  const handleImport = async (sources: Source[]) => {
    if (!sources.length) return;
    try {
      const imported = await importPdfs(sources, folderId);
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
    // Solo archivos de afuera: arrastrar un libro a una carpeta no cuenta.
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer?.types.includes('Files') && !e.dataTransfer.types.includes('text/x-apuntes-doc');
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
      {route === 'reader' ? (
        doc && (
          <Reader
            key={doc.id}
            doc={doc}
            folderName={folders?.find((f) => f.id === doc.folderId)?.name}
            highlights={highlights}
            labels={labels}
            setLabels={setLabels}
            pomo={pomo}
            onBack={() => navigate('/apuntes')}
          />
        )
      ) : (
        <>
          {route !== 'login' && <AppNav route={route} theme={theme} onToggleTheme={toggleTheme} />}
          {route === 'evals' ? (
            <Evaluations
              evalId={path.match(/^\/parciales\/([^/]+)/)?.[1] ?? null}
              docs={docs}
              folders={folders ?? []}
              onOpenDoc={open}
            />
          ) : route === 'login' ? (
            <Login />
          ) : route === 'library' ? (
            <Library
              docs={docs}
              folders={folders ?? []}
              view={view}
              onView={setView}
              pomo={pomo}
              onOpen={open}
              onUpload={upload}
            />
          ) : (
            <Landing docs={docs} folders={folders ?? []} theme={theme} onToggleTheme={toggleTheme} onOpen={open} />
          )}
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
