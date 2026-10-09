import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { dayKey } from '../lib/dates';
import { db, uid } from '../lib/db';
import { lsGet, lsSet, useLocalState } from '../lib/storage';

export type Mode = 'focus' | 'short' | 'long';

export interface PomodoroSettings {
  focus: number;
  short: number;
  long: number;
  every: number;
  lockBreak: boolean;
  sound: boolean;
  /** Arrancar la lectura apenas abrís un libro. */
  startOnOpen: boolean;
}

interface TimerState {
  mode: Mode;
  running: boolean;
  endAt: number;
  remaining: number;
  cycle: number;
}

export type Overlay = 'none' | 'break' | 'done';

export const MODE_LABEL: Record<Mode, string> = {
  focus: 'Lectura',
  short: 'Pausa corta',
  long: 'Pausa larga',
};

const DEFAULTS: PomodoroSettings = {
  focus: 25,
  short: 5,
  long: 15,
  every: 4,
  lockBreak: true,
  sound: true,
  startOnOpen: true,
};

const todayKey = () => dayKey();

let audio: AudioContext | undefined;
function ensureAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    /* sin audio */
  }
}

function chime() {
  if (!audio) return;
  const t = audio.currentTime;
  [660, 880, 990].forEach((freq, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    const start = t + i * 0.18;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
    osc.connect(gain).connect(audio!.destination);
    osc.start(start);
    osc.stop(start + 0.65);
  });
}

function notify(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    new Notification(title, { body });
  }
}

export function usePomodoro() {
  const [settings, setSettings] = useLocalState('apuntes.pomodoro.settings', DEFAULTS);
  const s = { ...DEFAULTS, ...settings };
  const duration = useCallback((m: Mode) => s[m] * 60_000, [s.focus, s.short, s.long]);

  const [timer, setTimer] = useState<TimerState>(() =>
    lsGet('apuntes.pomodoro.state', { mode: 'focus', running: false, endAt: 0, remaining: s.focus * 60_000, cycle: 0 }),
  );
  const [overlay, setOverlay] = useState<Overlay>(() =>
    timer.running && timer.mode !== 'focus' && s.lockBreak ? 'break' : 'none',
  );
  // Una sola fuente: la base. El resumen y el tomate cuentan lo mismo, y a medianoche vuelve a cero solo.
  const date = todayKey();
  const todayLogs = useLiveQuery(() => db.pomodoros.where('date').equals(date).toArray(), [date], []);
  const today = {
    count: todayLogs.length,
    minutes: todayLogs.reduce((sum, p) => sum + p.minutes, 0),
  };

  useEffect(() => lsSet('apuntes.pomodoro.state', timer), [timer]);

  const total = duration(timer.mode);

  const start = useCallback(() => {
    ensureAudio();
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    setTimer((t) => ({ ...t, running: true, endAt: Date.now() + t.remaining }));
  }, []);

  const pause = useCallback(() => {
    setTimer((t) => ({ ...t, running: false, remaining: Math.max(0, t.endAt - Date.now()) }));
  }, []);

  const setMode = useCallback(
    (mode: Mode, autostart = false) => {
      const ms = duration(mode);
      setTimer((t) => ({ ...t, mode, running: autostart, remaining: ms, endAt: Date.now() + ms }));
    },
    [duration],
  );

  const reset = useCallback(() => setMode(timer.mode), [setMode, timer.mode]);

  const complete = useRef<() => void>(() => {});
  complete.current = () => {
    if (s.sound) chime();
    if (timer.mode === 'focus') {
      const cycle = timer.cycle + 1;
      const next: Mode = cycle % s.every === 0 ? 'long' : 'short';
      void db.pomodoros.add({ id: uid(), date: todayKey(), at: Date.now(), minutes: s.focus });
      setTimer({ mode: next, running: true, remaining: duration(next), endAt: Date.now() + duration(next), cycle });
      notify('¡Terminaste un pomodoro!', `Tomate ${s[next]} minutos de pausa.`);
      if (s.lockBreak) setOverlay('break');
    } else {
      setTimer((t) => ({ ...t, mode: 'focus', running: false, remaining: duration('focus') }));
      notify('Pausa terminada', 'Volvé a los apuntes cuando quieras.');
      setOverlay(s.lockBreak ? 'done' : 'none');
    }
  };

  // Un solo temporizador al momento justo de terminar (no un reloj que redibuje toda la app).
  // Al volver a la pestaña también se chequea: el navegador demora los timers en segundo plano.
  useEffect(() => {
    if (!timer.running) return;
    const check = () => Date.now() >= timer.endAt && complete.current();
    const t = setTimeout(check, Math.max(0, timer.endAt - Date.now()) + 50);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, [timer.running, timer.endAt]);

  const skipBreak = () => {
    setMode('focus');
    setOverlay('none');
  };
  const backToReading = () => {
    setOverlay('none');
    start();
  };

  const updateSettings = (next: PomodoroSettings) => {
    setSettings(next);
    if (!timer.running) setTimer((t) => ({ ...t, remaining: next[t.mode] * 60_000 }));
  };

  /** Duración elegida girando el tomate. */
  const setDuration = (mode: Mode, minutes: number) => updateSettings({ ...s, [mode]: minutes });

  return {
    ...timer,
    total,
    settings: s,
    today,
    overlay,
    start,
    pause,
    reset,
    setMode,
    skipBreak,
    backToReading,
    closeOverlay: () => setOverlay('none'),
    updateSettings,
    setDuration,
  };
}

export type Pomodoro = ReturnType<typeof usePomodoro>;

export function formatTime(ms: number) {
  const totalSec = Math.ceil(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}

/** Tiempo restante al momento de llamarlo (usar junto con useTimerTick para que se actualice). */
export function liveRemaining(p: { running: boolean; endAt: number; remaining: number }) {
  return p.running ? Math.max(0, p.endAt - Date.now()) : p.remaining;
}

export function liveProgress(p: { running: boolean; endAt: number; remaining: number; total: number }) {
  return p.total ? 1 - liveRemaining(p) / p.total : 0;
}

/** Redibuja solo el componente que lo usa, mientras el timer corre. */
export function useTimerTick(active: boolean, ms = 250) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(force, ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
