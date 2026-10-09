/**
 * El hero con el tomatazo se muestra una sola vez por carga de página.
 * Vive en memoria a propósito: F5 lo reinicia y el tomatazo vuelve.
 */
import { useSyncExternalStore } from 'react';

let done = false;
const listeners = new Set<() => void>();

export const heroDone = () => done;

export function markHeroDone() {
  if (done) return;
  done = true;
  listeners.forEach((l) => l());
}

export function useHeroDone() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => done,
  );
}
