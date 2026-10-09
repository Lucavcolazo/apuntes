/**
 * Router mínimo con la History API: tres rutas no justifican una dependencia.
 *   /               landing + resumen
 *   /apuntes        biblioteca
 *   /apuntes/:id    lector
 */
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
window.addEventListener('popstate', notify);

export function navigate(to: string, { replace = false } = {}) {
  if (to === location.pathname + location.hash) return;
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  notify();
}

export function useLocation() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => location.pathname + location.hash,
  );
}

export function Link({ to, ...props }: { to: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={to}
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}
