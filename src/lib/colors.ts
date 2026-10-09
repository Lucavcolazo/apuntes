import type { ColorKey } from './db';

export const COLORS: Record<ColorKey, { hex: string; rgb: [number, number, number]; label: string }> = {
  yellow: { hex: '#ffe066', rgb: [1, 0.878, 0.4], label: 'Importante' },
  green: { hex: '#9be7a0', rgb: [0.608, 0.906, 0.627], label: 'Definición' },
  blue: { hex: '#9ccbff', rgb: [0.612, 0.796, 1], label: 'Ejemplo' },
  pink: { hex: '#ffb3d9', rgb: [1, 0.702, 0.851], label: 'Duda' },
};

export const COLOR_KEYS = Object.keys(COLORS) as ColorKey[];

export type Labels = Record<ColorKey, string>;

export const DEFAULT_LABELS = Object.fromEntries(
  COLOR_KEYS.map((k) => [k, COLORS[k].label]),
) as Labels;

/** Color más cercano de la paleta, para resaltados que vienen de otras apps. */
export function nearestColor(rgb: ArrayLike<number> | null | undefined): ColorKey {
  if (!rgb || rgb.length < 3) return 'yellow';
  const [r, g, b] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
  let best: ColorKey = 'yellow';
  let bestDist = Infinity;
  for (const k of COLOR_KEYS) {
    const [cr, cg, cb] = COLORS[k].rgb;
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best;
}
