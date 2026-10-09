import { useEffect, useRef, useState } from 'react';
import { lsGet, lsSet } from '../lib/storage';
import { Link } from '../lib/router';
import { cloudEnabled, signOut, useAuth } from '../lib/supabase';
import { syncNow, useSyncState } from '../lib/sync';
import { Icon } from './Icon';
import { toast } from './Toast';

/** "Entrar" para invitados; inicial del mail con menú para quien tiene cuenta. */
export function AccountButton() {
  const { user, loading } = useAuth();
  const sync = useSyncState();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (!cloudEnabled || loading) return null;
  if (!user) {
    return (
      <Link to="/entrar" className="btn ghost">
        Entrar
      </Link>
    );
  }

  const email = user.email ?? '';
  return (
    <div className="account" ref={ref}>
      <button className="avatar" onClick={() => setOpen(!open)} title={email} aria-expanded={open}>
        {email.charAt(0).toUpperCase() || '?'}
      </button>
      {open && (
        <div className="menu account-menu" role="menu">
          <div className="menu-title">Tu cuenta</div>
          <p className="account-email">{email}</p>
          <p className={`sync-line ${sync.status}`}>
            <span className={`sync-dot inline ${sync.status}`} />
            {SYNC_LABEL[sync.status]}
            {sync.status === 'ok' && sync.lastSync ? ` · ${ago(sync.lastSync)}` : ''}
          </p>
          {sync.message && <p className="muted sync-msg">{sync.message}</p>}
          <button role="menuitem" onClick={() => void syncNow()} disabled={sync.status === 'syncing'}>
            <Icon name="reset" size={14} /> Sincronizar ahora
          </button>
          <button
            role="menuitem"
            onClick={async () => {
              // Antes de salir, subimos lo pendiente.
              await syncNow();
              await signOut();
              setOpen(false);
              toast('Cerraste sesión. Tus apuntes siguen en este navegador.');
            }}
          >
            <Icon name="x" size={14} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

const SYNC_LABEL = {
  off: 'Sin sincronizar',
  syncing: 'Sincronizando…',
  ok: 'Todo guardado en la nube',
  offline: 'Sin conexión: se sube cuando vuelva',
  error: 'No se pudo sincronizar',
};

function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'recién';
  const m = Math.round(s / 60);
  return m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
}

const DISMISS_KEY = 'apuntes.guestBannerUntil';
const DISMISS_DAYS = 7;

/** Aviso para invitados: todo funciona, pero vive solo en este navegador. */
export function GuestBanner() {
  const { user, loading } = useAuth();
  const [hidden, setHidden] = useState(() => lsGet(DISMISS_KEY, 0) > Date.now());
  if (!cloudEnabled || loading || user || hidden) return null;

  return (
    <aside className="guest-banner" role="note">
      <img src="/favicon.svg" alt="" width={34} height={34} />
      <div className="guest-text">
        <strong>Estás como invitado</strong>
        <span className="muted">Tus apuntes viven solo en este navegador. Con una cuenta te siguen a todos lados.</span>
      </div>
      <div className="guest-actions">
        <Link to="/entrar" className="btn primary">
          Crear cuenta
        </Link>
        <button
          className="btn ghost sm"
          onClick={() => {
            lsSet(DISMISS_KEY, Date.now() + DISMISS_DAYS * 86_400_000);
            setHidden(true);
          }}
        >
          Ahora no
        </button>
      </div>
    </aside>
  );
}
