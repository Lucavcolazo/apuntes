import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration } from '../lib/dates';
import { EVAL_KINDS } from '../lib/db';
import { evalStatus, sortEvaluations } from '../lib/evaluations';
import { db, type Doc, type Folder } from '../lib/db';
import { Link, navigate } from '../lib/router';
import { reviewQueue } from '../lib/review';
import { useLocalState } from '../lib/storage';
import { computeStats, type DayStat } from '../lib/stats';
import { AccountButton, GuestBanner } from './Account';
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
              Mis apuntes
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

        <button className="scroll-hint" onClick={() => dashRef.current?.scrollIntoView({ behavior: 'smooth' })}>
          Tu resumen
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14m0 0-6-6m6 6 6-6" />
          </svg>
        </button>
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

  // Lo que viene: parciales y TPs pendientes con cuánto falta leer y a qué ritmo.
  const exams = sortEvaluations(evaluations)
    .upcoming.slice(0, 4)
    .map((ev) => ({ ev, ...evalStatus(ev, docs, live) }));

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
          Ir a mis apuntes <span aria-hidden="true">→</span>
        </Link>
      </header>

      <GuestBanner />

      <div className="dash-grid">
        <article className="card week-card">
          <div className="hero-figure">
            <span className="stat-label">Leíste esta semana</span>
            <span className="hero-number">{formatDuration(stats.weekMs)}</span>
            <span className="stat-delta muted">
              {delta === null
                ? stats.weekMs
                  ? 'Primera semana registrada'
                  : 'Abrí un libro y el tiempo se cuenta solo'
                : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs. los 7 días anteriores`}
            </span>
          </div>
          <WeekChart days={stats.week} />
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

        {exams.length > 0 && (
          <article className="card exams-card">
            <div className="card-title-row">
              <h3>Lo que viene</h3>
              <Link to="/parciales" className="btn ghost sm">
                Ver todo
              </Link>
            </div>
            <ul className="exam-list">
              {exams.map((e) => (
                <li key={e.ev.id} className={e.days <= 7 ? 'soon' : ''}>
                  <div className="exam-when">
                    <span className="exam-days tabular">{e.days === 0 ? '¡Hoy!' : e.days}</span>
                    {e.days > 0 && <span className="muted">{e.days === 1 ? 'día' : 'días'}</span>}
                  </div>
                  <div className="exam-body">
                    <Link to={`/parciales/${e.ev.id}`} className="exam-title">
                      <span className={`kind kind-${e.ev.kind}`}>{EVAL_KINDS[e.ev.kind]}</span>
                      <strong>{e.ev.title || 'Sin título'}</strong>
                    </Link>
                    <span className="muted">
                      {!e.docs.length
                        ? 'Sin apuntes conectados'
                        : e.pagesLeft
                          ? `Te faltan ${e.pagesLeft} páginas: unas ${e.perDay} por día`
                          : 'Ya leíste todo: a repasar'}
                      {e.due > 0 && ` · ${e.due} para repasar`}
                      {e.notesOpen > 0 && ` · ${e.notesOpen} ${e.notesOpen === 1 ? 'nota pendiente' : 'notas pendientes'}`}
                    </span>
                  </div>
                  {e.due > 0 && (
                    <Link to={`/repaso?parcial=${e.ev.id}`} className="btn ghost sm">
                      Repasar
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </article>
        )}

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
              {stats.inProgress.slice(0, 5).map(({ doc, pct, ms }) => (
                <li key={doc.id}>
                  <button className="progress-row" onClick={() => onOpen(doc.id)}>
                    <span className="mini-cover">{doc.thumb && <img src={doc.thumb} alt="" />}</span>
                    <span className="progress-body">
                      <span className="progress-title">{doc.name}</span>
                      <span className="muted progress-meta">
                        {doc.folderId ? `${folderName.get(doc.folderId) ?? ''} · ` : ''}
                        {formatDuration(ms)} leídos · p. {doc.maxPage ?? doc.lastPage}/{doc.pages}
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

        <article className="card folder-card">
          <h3>Tiempo por carpeta</h3>
          {stats.byFolder.length === 0 ? (
            <p className="muted card-empty">Sin lecturas todavía.</p>
          ) : (
            <ul className="bar-list">
              {stats.byFolder.slice(0, 6).map((f) => (
                <li key={f.name}>
                  <span className="bar-name">{f.name}</span>
                  <span className="bar-track">
                    <span style={{ width: `${(f.ms / stats.byFolder[0].ms) * 100}%` }} />
                  </span>
                  <span className="bar-value tabular">{formatDuration(f.ms)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted total-line">En total: {formatDuration(stats.totalMs)} de lectura</p>
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

// Topes "redondos" cuya mitad también es entera (sin "7.5" en el eje).
const STEPS = [10, 20, 30, 60, 90, 120, 180, 240, 360, 480, 720];

/** Minutos leídos en los últimos 7 días. Una sola serie: sin leyenda, el título la nombra. */
function WeekChart({ days }: { days: DayStat[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const mins = days.map((d) => d.ms / 60_000);
  const max = STEPS.find((s) => s >= Math.max(...mins)) ?? Math.ceil(Math.max(...mins) / 60) * 60;
  const ticks = [0, max / 2, max];
  const empty = mins.every((m) => m < 1);
  const peak = mins.indexOf(Math.max(...mins));

  return (
    <figure className="week-chart">
      <figcaption className="stat-label">Minutos por día</figcaption>
      <div className="chart-area">
        <div className="y-axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / max) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="plot">
          {ticks.map((t) => (
            <span key={t} className="gridline" style={{ bottom: `${(t / max) * 100}%` }} aria-hidden="true" />
          ))}
          {empty && <span className="plot-empty muted">Sin lecturas en los últimos 7 días</span>}
          {days.map((d, i) => {
            const h = (mins[i] / max) * 100;
            const showLabel = !empty && (d.isToday || i === peak) && mins[i] >= 1;
            return (
              <button
                key={d.date}
                className={`col ${hover === i ? 'hover' : ''}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${d.long}: ${formatDuration(d.ms)}`}
              >
                {mins[i] >= 0.5 && (
                  <span className="bar" style={{ height: `max(${h}%, 3px)` }}>
                    {showLabel && <span className="bar-cap tabular">{Math.round(mins[i])}</span>}
                  </span>
                )}
                {hover === i && (
                  <span className="tooltip" role="tooltip">
                    <strong>{formatDuration(d.ms)}</strong>
                    <span>{d.long}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="x-axis" aria-hidden="true">
        {days.map((d) => (
          <span key={d.date} className={d.isToday ? 'today' : ''}>
            {d.isToday ? 'hoy' : d.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Minutos de lectura por día</caption>
        <tbody>
          {days.map((d, i) => (
            <tr key={d.date}>
              <th scope="row">{d.long}</th>
              <td>{Math.round(mins[i])} min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
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
