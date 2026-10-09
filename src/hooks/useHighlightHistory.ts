import { useCallback, useMemo, useReducer, useRef } from 'react';
import { db, touchDoc, type Highlight } from '../lib/db';

type Entry =
  | { kind: 'add'; h: Highlight }
  | { kind: 'remove'; h: Highlight }
  | { kind: 'update'; before: Highlight; after: Highlight; at: number };

const LIMIT = 200;
/** Cambios seguidos sobre el mismo subrayado (por ejemplo, escribir una nota) cuentan como uno. */
const MERGE_MS = 2500;

/** Crear, borrar y editar subrayados pasando por un historial para ⌘Z / ⌘⇧Z. */
export function useHighlightHistory(docId: string) {
  const undoStack = useRef<Entry[]>([]);
  const redoStack = useRef<Entry[]>([]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const push = useCallback((entry: Entry) => {
    const stack = undoStack.current;
    const last = stack[stack.length - 1];
    if (entry.kind === 'update' && last?.kind === 'update' && last.after.id === entry.after.id && entry.at - last.at < MERGE_MS) {
      last.after = entry.after;
      last.at = entry.at;
    } else {
      stack.push(entry);
      if (stack.length > LIMIT) stack.shift();
    }
    redoStack.current = [];
    rerender();
  }, []);

  const add = useCallback(
    async (h: Highlight) => {
      await db.highlights.add(h);
      void touchDoc(docId);
      push({ kind: 'add', h });
    },
    [docId, push],
  );

  const remove = useCallback(
    async (h: Highlight) => {
      await db.highlights.delete(h.id);
      void touchDoc(docId);
      push({ kind: 'remove', h });
    },
    [docId, push],
  );

  const update = useCallback(
    async (before: Highlight, changes: Partial<Highlight>) => {
      const after = { ...before, ...changes };
      await db.highlights.put(after);
      void touchDoc(docId);
      push({ kind: 'update', before, after, at: Date.now() });
    },
    [docId, push],
  );

  const apply = useCallback(
    async (entry: Entry, direction: 'undo' | 'redo') => {
      const undoing = direction === 'undo';
      if (entry.kind === 'add') {
        if (undoing) await db.highlights.delete(entry.h.id);
        else await db.highlights.put(entry.h);
      } else if (entry.kind === 'remove') {
        if (undoing) await db.highlights.put(entry.h);
        else await db.highlights.delete(entry.h.id);
      } else {
        await db.highlights.put(undoing ? entry.before : entry.after);
      }
      void touchDoc(docId);
    },
    [docId],
  );

  const undo = useCallback(async () => {
    const entry = undoStack.current.pop();
    if (!entry) return null;
    await apply(entry, 'undo');
    redoStack.current.push(entry);
    rerender();
    return entry.kind;
  }, [apply]);

  const redo = useCallback(async () => {
    const entry = redoStack.current.pop();
    if (!entry) return null;
    await apply(entry, 'redo');
    undoStack.current.push(entry);
    rerender();
    return entry.kind;
  }, [apply]);

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  // Objeto estable: el popover lo usa en efectos y la app re-renderiza cada segundo por el pomodoro.
  return useMemo(
    () => ({ add, remove, update, undo, redo, canUndo, canRedo }),
    [add, remove, update, undo, redo, canUndo, canRedo],
  );
}

export type HighlightHistory = ReturnType<typeof useHighlightHistory>;
