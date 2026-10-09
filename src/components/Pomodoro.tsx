import { useEffect, useId, useRef, useState } from 'react';
import {
  formatTime,
  liveProgress,
  liveRemaining,
  MODE_LABEL,
  useTimerTick,
  type Mode,
  type Pomodoro as P,
  type PomodoroSettings,
} from '../hooks/usePomodoro';
import { Icon } from './Icon';

const MODES: Mode[] = ['focus', 'short', 'long'];
const MAX_MIN = 60;

// Geometría del dial (como un timer de cocina: el anillo gira y la flecha queda fija arriba).
const CX = 130;
const CY = 138;
const R_TICK = 118;
const R_NUM = 104;
const ARC_R = 124;
const ARC_LEN = 2 * Math.PI * ARC_R;

const angleAt = (svg: SVGSVGElement, x: number, y: number) => {
  const box = svg.getBoundingClientRect();
  const sx = ((x - box.left) / box.width) * 260;
  const sy = ((y - box.top) / box.height) * 270;
  return (Math.atan2(sy - CY, sx - CX) * 180) / Math.PI;
};

/** El tomate grande: se gira para elegir los minutos y se toca para empezar/pausar. */
export function TomatoTimer({ pomo, compact = false }: { pomo: P; compact?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gradId = useId();
  const drag = useRef<{ last: number; minutes: number; moved: number } | null>(null);
  const [dragMinutes, setDragMinutes] = useState<number | null>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);

  useTimerTick(pomo.running);
  const remaining = liveRemaining(pomo);
  const minutes = dragMinutes ?? remaining / 60_000;
  const rotation = -Math.min(minutes, MAX_MIN) * 6;
  const done = pomo.overlay === 'done';

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current!;
    svg.setPointerCapture(e.pointerId);
    drag.current = { last: angleAt(svg, e.clientX, e.clientY), minutes: liveRemaining(pomo) / 60_000, moved: 0 };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || pomo.running) return;
    const a = angleAt(svgRef.current!, e.clientX, e.clientY);
    let delta = a - d.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    d.last = a;
    d.moved += Math.abs(delta);
    // Girar el dial en sentido antihorario suma minutos, como uno de verdad.
    d.minutes = Math.min(MAX_MIN, Math.max(1, d.minutes - delta / 6));
    if (d.moved > 4) setDragMinutes(Math.round(d.minutes));
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved <= 4) {
      if (pomo.running) pomo.pause();
      else pomo.start();
    } else {
      pomo.setDuration(pomo.mode, Math.round(d.minutes));
    }
    setDragMinutes(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (pomo.running) return;
    const current = Math.round(pomo.settings[pomo.mode]);
    pomo.setDuration(pomo.mode, Math.min(MAX_MIN, Math.max(1, current + (e.deltaY < 0 ? 1 : -1))));
  };

  return (
    <div className={`tomato-timer ${compact ? 'compact' : ''}`} data-mode={pomo.mode}>
      <div className="mode-tabs" role="tablist">
        {MODES.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={pomo.mode === m}
            className={pomo.mode === m ? 'active' : ''}
            onClick={() => pomo.setMode(m)}
            disabled={pomo.running && pomo.mode !== m}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 260 270"
        className={`tomato ${pomo.running ? 'running' : ''} ${dragMinutes != null ? 'dragging' : ''} ${done ? 'ding' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        role="slider"
        aria-label={`${MODE_LABEL[pomo.mode]}: ${Math.round(minutes)} minutos`}
        aria-valuemin={1}
        aria-valuemax={MAX_MIN}
        aria-valuenow={Math.round(minutes)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (pomo.running) return;
          const cur = pomo.settings[pomo.mode];
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') pomo.setDuration(pomo.mode, Math.min(MAX_MIN, cur + 1));
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') pomo.setDuration(pomo.mode, Math.max(1, cur - 1));
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pomo.start();
          }
        }}
      >
        <defs>
          <radialGradient id={`${gradId}-body`} cx="0.36" cy="0.32" r="0.8">
            <stop offset="0" className="t-light" />
            <stop offset="0.55" className="t-mid" />
            <stop offset="1" className="t-dark" />
          </radialGradient>
        </defs>

        {/* Flecha fija */}
        <path d={`M${CX - 7} 4 L${CX + 7} 4 L${CX} 15 Z`} className="pointer" />

        {/* Anillo que gira */}
        <g className="dial" style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
          <circle
            cx={CX}
            cy={CY}
            r={ARC_R}
            className="dial-arc"
            strokeDasharray={`${(ARC_LEN * Math.min(minutes, MAX_MIN)) / 60} ${ARC_LEN}`}
            transform={`rotate(-90 ${CX} ${CY})`}
          />
          {Array.from({ length: 60 }, (_, i) => {
            const a = ((i * 6 - 90) * Math.PI) / 180;
            const long = i % 5 === 0;
            const r1 = long ? R_TICK - 8 : R_TICK - 4;
            return (
              <line
                key={i}
                x1={CX + Math.cos(a) * r1}
                y1={CY + Math.sin(a) * r1}
                x2={CX + Math.cos(a) * R_TICK}
                y2={CY + Math.sin(a) * R_TICK}
                className={long ? 'tick long' : 'tick'}
              />
            );
          })}
          {Array.from({ length: 12 }, (_, i) => {
            const a = ((i * 30 - 90) * Math.PI) / 180;
            const x = CX + Math.cos(a) * R_NUM;
            const y = CY + Math.sin(a) * R_NUM;
            return (
              <text
                key={i}
                x={x}
                y={y}
                transform={`rotate(${-rotation} ${x} ${y})`}
                className="num"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {i * 5}
              </text>
            );
          })}
        </g>

        {/* Tomate */}
        <g className="tomato-body">
          <path
            d={`M${CX} 68 C ${CX + 40} 58, ${CX + 84} 86, ${CX + 84} 140 C ${CX + 84} 190, ${CX + 46} 220, ${CX} 220 C ${CX - 46} 220, ${CX - 84} 190, ${CX - 84} 140 C ${CX - 84} 86, ${CX - 40} 58, ${CX} 68 Z`}
            fill={`url(#${gradId}-body)`}
          />
          <path
            d={`M${CX - 30} 70 C ${CX - 46} 96, ${CX - 50} 170, ${CX - 26} 214`}
            className="crease"
          />
          <path d={`M${CX + 30} 70 C ${CX + 46} 96, ${CX + 50} 170, ${CX + 26} 214`} className="crease" />
          <ellipse cx={CX - 42} cy={104} rx={16} ry={9} transform={`rotate(-35 ${CX - 42} 104)`} className="gloss" />
        </g>

        {/* Hojitas y cabito */}
        <g className="calyx" style={{ transformOrigin: `${CX}px 68px` }}>
          <g transform={`translate(${CX} 70) scale(1 0.5)`}>
            {[0, 72, 144, 216, 288].map((a) => (
              <path key={a} d="M0 0 C -8 -12, -6 -30, 0 -38 C 6 -30, 8 -12, 0 0 Z" transform={`rotate(${a})`} />
            ))}
          </g>
          <path d={`M${CX} 68 C ${CX} 58, ${CX + 3} 50, ${CX + 10} 45`} className="stem" />
        </g>

        <text x={CX} y={CY + 10} className="time" textAnchor="middle" dominantBaseline="central">
          {dragMinutes != null ? `${dragMinutes}:00` : formatTime(remaining)}
        </text>
        <text x={CX} y={CY + 42} className="hint" textAnchor="middle">
          {dragMinutes != null ? 'soltá' : pomo.running ? 'tocá: pausa' : 'girá · tocá'}
        </text>
      </svg>

      <div className="timer-actions">
        <button className="btn primary" onClick={pomo.running ? pomo.pause : pomo.start}>
          <Icon name={pomo.running ? 'pause' : 'play'} size={15} />
          {pomo.running ? 'Pausar' : 'Empezar'}
        </button>
        <button className="icon-btn" onClick={pomo.reset} title="Reiniciar">
          <Icon name="reset" />
        </button>
        <button className="icon-btn" onClick={() => settingsRef.current?.showModal()} title="Ajustes">
          <Icon name="settings" />
        </button>
      </div>

      <TodayTomatoes count={pomo.today.count} minutes={pomo.today.minutes} />
      <SettingsDialog ref={settingsRef} settings={pomo.settings} onSave={pomo.updateSettings} />
    </div>
  );
}

function TodayTomatoes({ count, minutes }: { count: number; minutes: number }) {
  const shown = Math.min(count, 8);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return (
    <div className="today">
      <div className="today-row" aria-hidden="true">
        {Array.from({ length: Math.max(shown, 4) }, (_, i) => (
          <span key={i} className={`mini-dot ${i < shown ? 'on' : ''}`} />
        ))}
        {count > 8 && <span className="muted">+{count - 8}</span>}
      </div>
      <span className="muted">
        {count === 0
          ? 'Todavía sin pomodoros hoy'
          : `${count} ${count === 1 ? 'pomodoro' : 'pomodoros'} hoy · ${h ? `${h} h ` : ''}${m} min de lectura`}
      </span>
    </div>
  );
}

/** Tomatito de la barra de lectura: se va "llenando" a medida que avanza. Abre el timer grande. */
export function MiniTomato({ pomo }: { pomo: P }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const clipId = useId();
  useTimerTick(pomo.running);
  const fill = liveProgress(pomo);

  return (
    <>
      <button
        className={`mini-tomato ${pomo.running ? 'running' : ''}`}
        data-mode={pomo.mode}
        onClick={() => dialogRef.current?.showModal()}
        title="Pomodoro"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y={24 - 20 * fill - 3} width="24" height="24" />
            </clipPath>
          </defs>
          <path d="M12 6.5c4.5-1 9 2 9 7.5 0 4.6-4 7.5-9 7.5s-9-2.9-9-7.5c0-5.5 4.5-8.5 9-7.5z" className="mt-shell" />
          <path
            d="M12 6.5c4.5-1 9 2 9 7.5 0 4.6-4 7.5-9 7.5s-9-2.9-9-7.5c0-5.5 4.5-8.5 9-7.5z"
            className="mt-fill"
            clipPath={`url(#${clipId})`}
          />
          <path d="M12 7 9 4.5M12 7l3-2.5M12 7V3.5" className="mt-leaf" />
        </svg>
        <span className="tabular">{formatTime(liveRemaining(pomo))}</span>
      </button>
      <dialog
        ref={dialogRef}
        className="dialog timer-dialog"
        onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}
      >
        <button className="icon-btn dialog-close" onClick={() => dialogRef.current?.close()} aria-label="Cerrar">
          <Icon name="x" />
        </button>
        <TomatoTimer pomo={pomo} compact />
      </dialog>
    </>
  );
}

function SettingsDialog({
  ref,
  settings,
  onSave,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  settings: PomodoroSettings;
  onSave: (s: PomodoroSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);

  const num = (k: 'focus' | 'short' | 'long' | 'every', min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      value={draft[k]}
      onChange={(e) => setDraft({ ...draft, [k]: Math.min(max, Math.max(min, Number(e.target.value) || min)) })}
    />
  );
  const check = (k: 'lockBreak' | 'sound' | 'startOnOpen', label: string) => (
    <label className="check">
      <input type="checkbox" checked={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <dialog ref={ref} className="dialog" onClose={() => setDraft(settings)}>
      <form method="dialog" onSubmit={() => onSave(draft)}>
        <h3>Ajustes del pomodoro</h3>
        <div className="field-grid">
          <label>Lectura (min){num('focus', 1, MAX_MIN)}</label>
          <label>Pausa corta (min){num('short', 1, MAX_MIN)}</label>
          <label>Pausa larga (min){num('long', 1, MAX_MIN)}</label>
          <label>Pausa larga cada{num('every', 2, 12)}</label>
        </div>
        {check('startOnOpen', 'Arrancar el pomodoro al abrir un libro')}
        {check('lockBreak', 'Tapar los apuntes durante las pausas')}
        {check('sound', 'Sonido al terminar')}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            Guardar
          </button>
        </div>
      </form>
    </dialog>
  );
}

const TIPS = [
  'Pará, estirá las piernas y tomá agua.',
  'Mirá algo lejos unos 20 segundos.',
  'Contate en voz alta lo último que leíste.',
  'Alejate de la pantalla, el celu también cuenta.',
  'Respirá hondo un par de veces.',
];

export function BreakOverlay({ pomo }: { pomo: P }) {
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  useTimerTick(pomo.running && pomo.overlay !== 'none');
  if (pomo.overlay === 'none') return null;
  const done = pomo.overlay === 'done';

  return (
    <div className="break-overlay">
      <div className="break-card">
        <div className="break-kicker">{done ? 'Pausa terminada' : MODE_LABEL[pomo.mode]}</div>
        <div className="break-time tabular">{done ? '¿Seguimos?' : formatTime(liveRemaining(pomo))}</div>
        <p className="break-tip">{done ? `Llevás ${pomo.today.count} ${pomo.today.count === 1 ? 'pomodoro' : 'pomodoros'} hoy.` : tip}</p>
        {done ? (
          <div className="break-actions">
            <button className="btn primary" onClick={pomo.backToReading}>
              Volver a leer
            </button>
            <button className="btn ghost" onClick={pomo.closeOverlay}>
              Ahora no
            </button>
          </div>
        ) : (
          <button className="btn ghost" onClick={pomo.skipBreak}>
            Saltar pausa
          </button>
        )}
      </div>
    </div>
  );
}
