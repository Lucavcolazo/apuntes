import { useCallback, useEffect, useRef, useState } from 'react';
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

const todayKey = () => new Date().toISOString().slice(0, 10);

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
  const [today, setToday] = useState(() => {
    const t = lsGet('apuntes.pomodoro.today', { date: todayKey(), count: 0, minutes: 0 });
    return t.date === todayKey() ? t : { date: todayKey(), count: 0, minutes: 0 };
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => lsSet('apuntes.pomodoro.state', timer), [timer]);
  useEffect(() => lsSet('apuntes.pomodoro.today', today), [today]);

  const remaining = timer.running ? Math.max(0, timer.endAt - now) : timer.remaining;
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
      setToday((t) => ({ ...t, count: t.count + 1, minutes: t.minutes + s.focus }));
      setTimer({ mode: next, running: true, remaining: duration(next), endAt: Date.now() + duration(next), cycle });
      notify('¡Terminaste un pomodoro!', `Tomate ${s[next]} minutos de pausa.`);
      if (s.lockBreak) setOverlay('break');
    } else {
      setTimer((t) => ({ ...t, mode: 'focus', running: false, remaining: duration('focus') }));
      notify('Pausa terminada', 'Volvé a los apuntes cuando quieras.');
      setOverlay(s.lockBreak ? 'done' : 'none');
    }
  };

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (timer.running && now >= timer.endAt) complete.current();
  }, [now, timer.running, timer.endAt]);

  useEffect(() => {
    if (!timer.running) {
      document.title = 'Apuntes';
      return;
    }
    const m = Math.floor(remaining / 60_000);
    const sec = Math.floor((remaining % 60_000) / 1000);
    document.title = `${m}:${String(sec).padStart(2, '0')} · ${MODE_LABEL[timer.mode]}`;
  }, [remaining, timer.running, timer.mode]);

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
    remaining,
    progress: total ? 1 - remaining / total : 0,
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
