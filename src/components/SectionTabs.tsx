import { Link } from '../lib/router';
import { Icon } from './Icon';

/** Las dos secciones de la app: los apuntes y lo que hay que rendir o entregar. */
export function SectionTabs({ active, badge }: { active: 'notes' | 'evals'; badge?: number }) {
  return (
    <nav className="section-tabs" aria-label="Secciones">
      <Link to="/apuntes" className={active === 'notes' ? 'active' : ''} aria-current={active === 'notes' ? 'page' : undefined}>
        <Icon name="book" size={16} /> Mis apuntes
      </Link>
      <Link to="/parciales" className={active === 'evals' ? 'active' : ''} aria-current={active === 'evals' ? 'page' : undefined}>
        <Icon name="calendar" size={16} /> Parciales y TPs
        {badge ? <span className="pill tabular">{badge}</span> : null}
      </Link>
    </nav>
  );
}
