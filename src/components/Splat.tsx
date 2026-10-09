import { useMemo } from 'react';

/** PRNG con semilla: cada visita un tomatazo distinto, pero estable durante el render. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];
const f = (n: number) => n.toFixed(1);

/** Curva cerrada suave (Catmull-Rom → Bézier) que pasa por todos los puntos. */
function closedCurve(pts: Pt[]) {
  const n = pts.length;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return `${d}Z`;
}

interface Blob {
  path: string;
  tips: { x: number; y: number; r: number }[];
}

/** Mancha con "dedos" de salpicadura y una gota en la punta de algunos. */
function splatBlob(rand: () => number, cx: number, cy: number, r: number, stretch = 1.25): Blob {
  const n = 28;
  const radii = Array.from({ length: n }, () => r * (0.8 + rand() * 0.28));
  const tips: Blob['tips'] = [];
  // Lóbulos redondeados (pulpa que se desparrama) en vez de pinchos de explosión.
  for (let k = 0; k < 7; k++) {
    const i = Math.floor(rand() * n);
    const len = r * (1.2 + rand() * 0.45);
    radii[i] = len;
    radii[(i + 1) % n] = Math.max(radii[(i + 1) % n], len * 0.82);
    radii[(i + 2) % n] = Math.min(radii[(i + 2) % n], r * 0.86);
    radii[(i - 1 + n) % n] = Math.min(radii[(i - 1 + n) % n], r * 0.86);
    if (rand() < 0.7) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      const d = len + r * (0.14 + rand() * 0.2);
      tips.push({ x: cx + Math.cos(a) * d * stretch, y: cy + Math.sin(a) * d, r: r * (0.05 + rand() * 0.05) });
    }
  }
  const pts = radii.map((rad, i): Pt => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * rad * stretch, cy + Math.sin(a) * rad];
  });
  return { path: closedCurve(pts), tips };
}

interface Props {
  seed: number;
  animate: boolean;
}

export function Splat({ seed, animate }: Props) {
  const art = useMemo(() => {
    const rand = mulberry32(seed);
    const [cx, cy, r] = [500, 290, 150];
    const main = splatBlob(rand, cx, cy, r);
    const pulp = splatBlob(rand, cx - 18, cy - 14, r * 0.52, 1.15);

    const drops = Array.from({ length: 20 }, () => {
      const a = rand() * Math.PI * 2;
      const dist = r * (1.55 + rand() * 1.4);
      const size = r * (0.022 + rand() * 0.07);
      return {
        x: cx + Math.cos(a) * dist * 1.3,
        y: cy + Math.sin(a) * dist * 0.85,
        rx: size * (1 + rand() * 1.6),
        ry: size,
        rot: (a * 180) / Math.PI,
        delay: rand() * 0.08,
      };
    });

    const drips = Array.from({ length: 5 }, () => {
      const w = r * (0.07 + rand() * 0.06);
      return {
        x: cx + (rand() - 0.5) * r * 1.6,
        top: cy + r * (0.45 + rand() * 0.25),
        len: r * (0.55 + rand() * 1.1),
        w,
        delay: 0.25 + rand() * 0.5,
        dur: 1.6 + rand() * 1.4,
      };
    });

    const seeds = Array.from({ length: 10 }, () => {
      const a = rand() * Math.PI * 2;
      const d = rand() * r * 0.6;
      return { x: cx + Math.cos(a) * d * 1.2, y: cy + Math.sin(a) * d, rot: rand() * 180 };
    });

    // Manchitas satélite: que quede todo salpicado, no solo el título.
    const satellites = [
      splatBlob(rand, 140 + rand() * 60, 110 + rand() * 60, 26 + rand() * 14, 1.1),
      splatBlob(rand, 840 + rand() * 60, 470 + rand() * 50, 22 + rand() * 16, 1.1),
      splatBlob(rand, 820 + rand() * 80, 90 + rand() * 40, 12 + rand() * 8, 1),
    ];

    return { main, pulp, drops, drips, seeds, satellites };
  }, [seed]);

  return (
    <svg className={`splat ${animate ? 'animate' : ''}`} viewBox="0 0 1000 600" aria-hidden="true">
      <g className="splat-satellites">
        {art.satellites.map((s, i) => (
          <g key={i}>
            <path d={s.path} className="juice" />
            {s.tips.map((t, j) => (
              <circle key={j} cx={t.x} cy={t.y} r={t.r} className="juice" />
            ))}
          </g>
        ))}
      </g>

      {art.drips.map((d, i) => (
        <g
          key={i}
          className="drip"
          style={{ animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s` } as React.CSSProperties}
        >
          <rect x={d.x - d.w / 2} y={d.top} width={d.w} height={d.len} rx={d.w / 2} className="juice" />
          <circle cx={d.x} cy={d.top + d.len} r={d.w * 0.78} className="juice" />
        </g>
      ))}

      <g className="splat-main">
        <path d={art.main.path} className="juice" />
        {art.main.tips.map((t, i) => (
          <circle key={i} cx={t.x} cy={t.y} r={t.r} className="juice" />
        ))}
        <path d={art.pulp.path} className="pulp" />
        {art.seeds.map((s, i) => (
          <ellipse key={i} cx={s.x} cy={s.y} rx={7} ry={3.6} transform={`rotate(${s.rot} ${s.x} ${s.y})`} className="seed" />
        ))}
      </g>

      {/* La animación va en el <g>: si fuera en la elipse, el transform de CSS pisaría su rotación. */}
      {art.drops.map((d, i) => (
        <g
          key={i}
          className="drop"
          style={
            {
              '--dx': `${500 - d.x}px`,
              '--dy': `${290 - d.y}px`,
              animationDelay: `${d.delay}s`,
            } as React.CSSProperties
          }
        >
          <ellipse
            cx={d.x}
            cy={d.y}
            rx={d.rx}
            ry={d.ry}
            transform={`rotate(${d.rot} ${d.x} ${d.y})`}
            className="juice"
          />
        </g>
      ))}
    </svg>
  );
}
