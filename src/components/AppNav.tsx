import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { daysUntil } from '../lib/dates';
import { db } from '../lib/db';
import { useHeroDone } from '../lib/hero';
import { Link } from '../lib/router';
import { AccountButton } from './Account';
import { Icon, type IconName } from './Icon';

export type NavRoute = 'landing' | 'library' | 'evals';

interface Props {
  route: NavRoute;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

/**
 * Barra fija de la app. En la entrada aparece recién al bajar del hero
 * (el hero tiene su propia navegación); en el resto está siempre.
 */
export function AppNav({ route, theme, onToggleTheme }: Props) {
  // Mientras está el hero, la barra aparece al bajar; sin hero, está siempre.
  const heroGone = useHeroDone();
  const reveal = route === 'landing' && !heroGone;
  const [shown, setShown] = useState(!reveal);

  useEffect(() => {
    if (!reveal) {
      setShown(true);
      return;
    }
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 0.7);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [reveal]);

  // Insignia: fechas de esta semana.
  const soon = useLiveQuery(
    async () => (await db.evaluations.toArray()).filter((e) => !e.done && daysUntil(e.date) >= 0 && daysUntil(e.date) <= 7).length,
    [],
    0,
  );

  const links: { to: string; label: string; icon: IconName; key: NavRoute; badge?: number }[] = [
    { to: '/#inicio', label: 'Inicio', icon: 'chart', key: 'landing' },
    { to: '/apuntes', label: 'Mis apuntes', icon: 'book', key: 'library' },
    { to: '/parciales', label: 'Parciales y TPs', icon: 'calendar', key: 'evals', badge: soon },
  ];

  return (
    <header className={`app-nav ${reveal ? 'reveal' : ''} ${shown ? 'shown' : ''}`} aria-hidden={!shown}>
      <div className="app-nav-inner">
        <Link to="/" className="nav-brand" title="Tomapuntes" tabIndex={shown ? 0 : -1}>
          <img src="/favicon.svg" alt="" width={24} height={24} />
          <span>Tomapuntes</span>
        </Link>

        <nav className="nav-links" aria-label="Secciones">
          {links.map((l) => (
            <Link
              key={l.key}
              to={l.to}
              className={route === l.key ? 'active' : ''}
              aria-current={route === l.key ? 'page' : undefined}
              tabIndex={shown ? 0 : -1}
              onClick={(e) => {
                // Ya en la entrada: "Inicio" baja al resumen sin recargar.
                if (l.key === 'landing' && route === 'landing') {
                  e.preventDefault();
                  document.getElementById('inicio')?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              title={l.label}
            >
              <Icon name={l.icon} size={16} />
              <span className="nav-label">{l.label}</span>
              {l.badge ? <span className="pill tabular">{l.badge}</span> : null}
            </Link>
          ))}
        </nav>

        <div className="nav-end">
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            tabIndex={shown ? 0 : -1}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <AccountButton />
        </div>
      </div>
    </header>
  );
}
