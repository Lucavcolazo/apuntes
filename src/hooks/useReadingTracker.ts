import { useEffect, useRef } from 'react';
import { dayKey } from '../lib/dates';
import { addReading } from '../lib/db';

/** Sin tocar nada durante este tiempo, asumimos que dejaste de leer. */
const IDLE_MS = 3 * 60_000;
const TICK_MS = 5_000;
const FLUSH_MS = 30_000;

/**
 * Cuenta el tiempo que pasás leyendo un libro: solo con la pestaña visible,
 * si hubo actividad hace poco y si no estás en una pausa del pomodoro.
 */
export function useReadingTracker(docId: string, paused: boolean) {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let lastActivity = Date.now();
    let last = Date.now();
    let pending = 0;

    const activity = () => (lastActivity = Date.now());
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, activity, { passive: true, capture: true }));

    const tick = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(now - last, TICK_MS * 2);
      last = now;
      if (document.visibilityState === 'visible' && !pausedRef.current && now - lastActivity < IDLE_MS) pending += dt;
    }, TICK_MS);

    const flush = () => {
      if (pending < 1000) return;
      const ms = pending;
      pending = 0;
      void addReading(docId, dayKey(), ms);
    };
    const flusher = setInterval(flush, FLUSH_MS);
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);

    return () => {
      clearInterval(tick);
      clearInterval(flusher);
      events.forEach((e) => window.removeEventListener(e, activity, { capture: true }));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [docId]);
}
