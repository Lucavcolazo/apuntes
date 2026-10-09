import { useEffect, useRef, useState } from 'react';
import { lsGet, lsSet } from '../lib/storage';
import { Link } from '../lib/router';
import { cloudEnabled, signOut, useAuth } from '../lib/supabase';
import { Icon } from './Icon';
import { toast } from './Toast';

/** "Entrar" para invitados; inicial del mail con menú para quien tiene cuenta. */
export function AccountButton() {
  const { user, loading } = useAuth();
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
          <button
            role="menuitem"
            onClick={async () => {
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
        <span className="muted">
          Todo funciona, pero tus apuntes viven solo en este navegador: si borrás los datos o cambiás de dispositivo, no
          los vas a ver. Con una cuenta gratis quedan a salvo y te siguen al celu.
        </span>
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
