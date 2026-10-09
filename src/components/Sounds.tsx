import { useEffect, useRef, useState } from 'react';
import { AmbientMixer, SOUNDS, type SoundId } from '../lib/ambient';
import { useLocalState } from '../lib/storage';
import { Icon } from './Icon';

type Mix = Record<SoundId, { on: boolean; volume: number }>;

const DEFAULT_MIX: Mix = {
  fan: { on: false, volume: 0.5 },
  plane: { on: false, volume: 0.5 },
  rain: { on: false, volume: 0.5 },
  white: { on: false, volume: 0.35 },
};

/**
 * Botón + panel de sonidos de ambiente para la lectura.
 * `paused`: durante las pausas del pomodoro el sonido baja solo y vuelve al retomar.
 */
export function Sounds({ paused }: { paused: boolean }) {
  const [saved, setMix] = useLocalState<Mix>('apuntes.sounds', DEFAULT_MIX);
  const mix = { ...DEFAULT_MIX, ...saved };
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const mixer = useRef<AmbientMixer | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const active = SOUNDS.filter((s) => mix[s.id].on).length;

  // Sincroniza la mezcla con el motor de audio (la clave evita re-aplicar en cada render).
  const mixKey = JSON.stringify(mix);
  useEffect(() => {
    if (!active && !mixer.current) return;
    mixer.current ??= new AmbientMixer();
    for (const { id } of SOUNDS) mixer.current.set(id, mix[id].on ? mix[id].volume : 0);
    void mixer.current.resume().then((running) => setBlocked(!running && active > 0));
  }, [mixKey]);

  useEffect(() => mixer.current?.setPaused(paused), [paused, active]);

  // Al salir del lector, el sonido se apaga.
  useEffect(() => () => void mixer.current?.close(), []);

  // Si el navegador bloqueó el audio al entrar, arranca con el primer clic o tecla.
  useEffect(() => {
    if (!blocked) return;
    const unlock = () => void mixer.current?.resume().then((running) => running && setBlocked(false));
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [blocked]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const update = (id: SoundId, change: Partial<Mix[SoundId]>) => setMix({ ...mix, [id]: { ...mix[id], ...change } });

  return (
    <div className="sounds" ref={root}>
      <button
        className={`icon-btn ${open || active ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        title="Sonidos para leer"
        aria-expanded={open}
      >
        <Icon name="headphones" />
        {active > 0 && <span className={`sound-dot ${paused ? 'paused' : ''}`} />}
      </button>

      {open && (
        <div className="sounds-panel" role="dialog" aria-label="Sonidos para leer">
          <header>
            <h3>Sonidos para leer</h3>
            {active > 0 && (
              <button
                className="btn ghost sm"
                onClick={() => setMix(Object.fromEntries(SOUNDS.map(({ id }) => [id, { ...mix[id], on: false }])) as Mix)}
              >
                Apagar todo
              </button>
            )}
          </header>

          <ul>
            {SOUNDS.map(({ id, name }) => {
              const { on, volume } = mix[id];
              return (
                <li key={id} className={on ? 'on' : ''}>
                  <button className="sound-toggle" onClick={() => update(id, { on: !on })} aria-pressed={on}>
                    <span className="sound-icon">
                      <Icon name={id} size={18} />
                    </span>
                    {name}
                  </button>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => update(id, { volume: Number(e.target.value), on: true })}
                    aria-label={`Volumen de ${name}`}
                    style={{ '--fill': `${((volume - 0.05) / 0.95) * 100}%` } as React.CSSProperties}
                  />
                </li>
              );
            })}
          </ul>

          <p className="muted sounds-note">
            {blocked
              ? 'Tocá en cualquier lado para activar el sonido.'
              : paused
                ? 'En pausa: vuelven solos cuando retomás la lectura.'
                : 'Se pueden mezclar. Se bajan solos en las pausas del pomodoro.'}
          </p>
        </div>
      )}
    </div>
  );
}
