import { useEffect, useRef } from 'react';
import type { Pomodoro } from './usePomodoro';

const BODY = 'M32 15C43 12.5 59 20 59 37 59 51 47 60 32 60S5 51 5 37C5 20 21 12.5 32 15Z';
const COLORS = {
  focus: ['#ff8f6e', '#e2492f', '#a32d1b'],
  break: ['#cfe7a0', '#86b955', '#4e7d2c'],
};

/** Tomate de la pestaña que se va "llenando" de abajo hacia arriba a medida que avanza el pomodoro. */
function tomatoSvg(progress: number, isBreak: boolean) {
  const [light, mid, dark] = isBreak ? COLORS.break : COLORS.focus;
  // El cuerpo va de y=13 a y=60: la parte llena sube con el progreso.
  const top = 60 - 47 * Math.min(1, Math.max(0, progress));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="g" cx=".36" cy=".34" r=".78"><stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
    <clipPath id="c"><rect x="0" y="${top.toFixed(1)}" width="64" height="64"/></clipPath>
  </defs>
  <path d="${BODY}" fill="${mid}" fill-opacity=".22" stroke="${mid}" stroke-width="3"/>
  <path d="${BODY}" fill="url(#g)" clip-path="url(#c)"/>
  <path d="M32 16C32 11 33.5 7.5 37 5.5" fill="none" stroke="#3f6e27" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M32 17 23 13M32 17l9-4M32 17l-6 6M32 17l6 6" stroke="#3f6e27" stroke-width="3.4" stroke-linecap="round"/>
</svg>`;
}

export function useFaviconProgress(pomo: Pomodoro) {
  const lastKey = useRef('');
  // Redondeamos para no regenerar el ícono 4 veces por segundo.
  const step = Math.round(pomo.progress * 40);
  const isBreak = pomo.mode !== 'focus';

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
    if (!link) return;
    const key = pomo.running ? `${step}-${isBreak}` : 'static';
    if (key === lastKey.current) return;
    lastKey.current = key;
    link.href = pomo.running
      ? `data:image/svg+xml,${encodeURIComponent(tomatoSvg(step / 40, isBreak))}`
      : '/favicon.svg';
  }, [pomo.running, step, isBreak]);
}
