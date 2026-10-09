import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration } from '../lib/dates';
import { db, type Doc, type Folder } from '../lib/db';
import { Link, navigate } from '../lib/router';
import { reviewQueue } from '../lib/review';
import { useLocalState } from '../lib/storage';
import { computeStats } from '../lib/stats';
import { AccountButton, GuestBanner } from './Account';
import { EvalChecklist } from './EvalChecklist';
import { Heatmap } from './Heatmap';
import { Icon } from './Icon';
import { Splat } from './Splat';

interface Props {
  docs: Doc[];
  folders: Folder[];
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpen: (id: string) => void;
}

type Phase = 'idle' | 'fly' | 'hit';
const FLY_MS = 850;

export function Landing({ docs, folders, theme, onToggleTheme, onOpen }: Props) {
  const dashRef = useRef<HTMLElement>(null);
  // Si venís desde la app (/#inicio) o con movimiento reducido, no hay tomatazo: la mancha ya está.
  const [intro] = useState(
    () => location.hash !== '#inicio' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  const [phase, setPhase] = useState<Phase>(intro ? 'idle' : 'hit');
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));

  useEffect(() => {
    if (!intro) {
      if (location.hash === '#inicio') {
        dashRef.current?.scrollIntoView();
        // Sacamos el #inicio de la URL: si después apretás F5, el tomatazo se repite.
        navigate('/', { replace: true });
      }
      return;
    }
    window.scrollTo(0, 0);
    let userScrolled = false;
    const onScroll = () => (userScrolled = window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    const timers = [
      setTimeout(() => setPhase('fly'), 400),
      setTimeout(() => setPhase('hit'), 400 + FLY_MS),
      // Después del impacto, bajamos solos al resumen (si no bajaste antes).
      setTimeout(() => !userScrolled && dashRef.current?.scrollIntoView({ behavior: 'smooth' }), 400 + FLY_MS + 1900),
    ];
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('scroll', onScroll);
    };
  }, [intro]);

  return (
    <div className="landing">
      <section className={`hero phase-${phase}`}>
        <nav className="hero-nav">
          <span className="hero-brand">
            <img src="/favicon.svg" alt="" width={26} height={26} /> Tomapuntes
          </span>
          <div className="head-actions">
            <button className="icon-btn" onClick={onToggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <Link to="/apuntes" className="btn ghost">
              Mi espacio
            </Link>
            <AccountButton />
          </div>
        </nav>

        <div className="hero-center">
          <div className="hero-title-wrap">
            <h1 className="hero-title">Tomapuntes</h1>
            {phase === 'fly' && (
              <div className="flyer" aria-hidden="true">
                <div className="flyer-y">
                  <img src="/favicon.svg" alt="" draggable={false} />
                </div>
              </div>
            )}
            {phase === 'hit' && <Splat seed={seed} animate={intro} />}
          </div>
          <p className="hero-sub">Leé, subrayá y descansá. Un tomate a la vez.</p>
        </div>

      </section>

      <section id="inicio" ref={dashRef} className="dash">
        <Dashboard docs={docs} folders={folders} onOpen={onOpen} />
      </section>
    </div>
  );
}

function Dashboard({ docs, folders, onOpen }: { docs: Doc[]; folders: Folder[]; onOpen: (id: string) => void }) {
  const reading = useLiveQuery(() => db.reading.toArray(), [], []);
  const pomodoros = useLiveQuery(() => db.pomodoros.toArray(), [], []);
  const highlights = useLiveQuery(() => db.highlights.toArray(), [], []);
  const [goal, setGoal] = useLocalState('apuntes.goal', 30);
  const evaluations = useLiveQuery(() => db.evaluations.toArray(), [], []);
  const stats = useMemo(() => computeStats(docs, folders, reading, pomodoros), [docs, folders, reading, pomodoros]);
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const docFolder = new Map(docs.map((d) => [d.id, d.folderId ?? null]));
  const live = highlights.filter((h) => docFolder.has(h.docId));
  const due = reviewQueue(live);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reading) map.set(r.date, (map.get(r.date) ?? 0) + r.ms);
    return map;
  }, [reading]);
  const pomodorosByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pomodoros) map.set(p.date, (map.get(p.date) ?? 0) + 1);
    return map;
  }, [pomodoros]);

  const delta =
    stats.prevWeekMs > 0 ? Math.round(((stats.weekMs - stats.prevWeekMs) / stats.prevWeekMs) * 100) : null;
  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <header className="dash-head">
        <div>
          <h2>Tu lectura</h2>
          <p className="muted">{today}</p>
        </div>
        <Link to="/apuntes" className="btn primary">
          Ir a mi espacio <span aria-hidden="true">→</span>
        </Link>
      </header>

      <GuestBanner />

      <div className="dash-grid">
        <article className="card heat-card">
          <div className="heat-head">
            <div className="hero-figure">
              <span className="stat-label">Esta semana</span>
              <span className="hero-number">{formatDuration(stats.weekMs)}</span>
              <span className="stat-delta muted">
                {delta === null
                  ? stats.weekMs
                    ? 'Primera semana registrada'
                    : 'Abrí un libro y el tiempo se cuenta solo'
                  : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs. los 7 días anteriores`}
              </span>
            </div>
            <div className="heat-total">
              <span className="stat-label">En total</span>
              <span className="tile-value">{formatDuration(stats.totalMs)}</span>
            </div>
          </div>
          <Heatmap byDay={byDay} pomodorosByDay={pomodorosByDay} />
        </article>

        <div className="tiles">
          <GoalTile todayMs={stats.todayMs} goal={goal} onGoal={setGoal} />
          <Tile
            label="Racha"
            value={`${stats.streak} ${stats.streak === 1 ? 'día' : 'días'}`}
            hint={stats.streak ? 'seguidos leyendo' : 'leé hoy para empezar'}
          />
          <Tile label="Pomodoros hoy" value={String(stats.pomodorosToday)} hint={`${stats.pomodorosTotal} en total`} />
          <Link to="/repaso" className="tile tile-link">
            <span className="stat-label">Para repasar</span>
            <span className="tile-value">{due.length}</span>
            <span className="muted tile-hint">
              {due.length ? 'Repasar ahora →' : `${live.length} subrayados al día`}
            </span>
          </Link>
        </div>

        <EvalChecklist evaluations={evaluations} docs={docs} folders={folders} highlights={live} />

        <article className="card continue-card">
          <h3>Seguí leyendo</h3>
          {stats.inProgress.length === 0 ? (
            <div className="card-empty">
              <p className="muted">
                {docs.length ? 'Cuando empieces un libro, va a aparecer acá con su progreso.' : 'Todavía no subiste apuntes.'}
              </p>
              <Link to="/apuntes" className="btn ghost sm">
                {docs.length ? 'Elegir un libro' : 'Subir PDFs'}
              </Link>
            </div>
          ) : (
            <ul className="progress-list">
              {stats.inProgress.slice(0, 4).map(({ doc, pct, ms }) => (
                <li key={doc.id}>
                  <button className="progress-row" onClick={() => onOpen(doc.id)}>
                    <span className="mini-cover">{doc.thumb && <img src={doc.thumb} alt="" />}</span>
                    <span className="progress-body">
                      <span className="progress-title">{doc.name}</span>
                      <span className="muted progress-meta">
                        {doc.folderId ? `${folderName.get(doc.folderId) ?? ''} · ` : ''}
                        {formatDuration(ms)} leídos
                      </span>
                      <span className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% leído`}>
                        <span style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                    <span className="progress-pct tabular">{pct}%</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="tile">
      <span className="stat-label">{label}</span>
      <span className="tile-value">{value}</span>
      {hint && <span className="muted tile-hint">{hint}</span>}
    </div>
  );
}

const GOALS = [15, 30, 45, 60, 90, 120];
const RING = 2 * Math.PI * 22;

/** Meta diaria: un anillo que se llena con los minutos de hoy. */
function GoalTile({ todayMs, goal, onGoal }: { todayMs: number; goal: number; onGoal: (g: number) => void }) {
  const pct = Math.min(1, todayMs / 60_000 / goal);
  const reached = pct >= 1;
  return (
    <div className={`tile goal-tile ${reached ? 'reached' : ''}`}>
      <div className="goal-top">
        <div>
          <span className="stat-label">Hoy</span>
          <span className="tile-value">{formatDuration(todayMs)}</span>
        </div>
        <svg width="54" height="54" viewBox="0 0 54 54" className="goal-ring" role="img" aria-label={`${Math.round(pct * 100)}% de la meta`}>
          <circle cx="27" cy="27" r="22" className="track" />
          <circle cx="27" cy="27" r="22" className="bar" strokeDasharray={RING} strokeDashoffset={RING * (1 - pct)} transform="rotate(-90 27 27)" />
          <text x="27" y="27" textAnchor="middle" dominantBaseline="central">{reached ? '✓' : `${Math.round(pct * 100)}%`}</text>
        </svg>
      </div>
      <label className="muted tile-hint goal-select">
        {reached ? '¡Meta cumplida! ' : 'Meta: '}
        <select value={goal} onChange={(e) => onGoal(Number(e.target.value))} aria-label="Meta diaria">
          {GOALS.map((g) => (
            <option key={g} value={g}>
              {g < 60 ? `${g} min` : `${g / 60} h`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
