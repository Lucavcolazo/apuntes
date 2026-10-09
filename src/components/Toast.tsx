import { useEffect, useState } from 'react';

const listeners = new Set<(msg: string) => void>();

export function toast(msg: string) {
  listeners.forEach((l) => l(msg));
}

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (m: string) => {
      setMsg(m);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2600);
    };
    listeners.add(show);
    return () => {
      listeners.delete(show);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className={`toast ${msg ? 'show' : ''}`} role="status" aria-live="polite">
      {msg}
    </div>
  );
}
