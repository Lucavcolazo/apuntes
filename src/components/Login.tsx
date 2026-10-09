import { useEffect, useState } from 'react';
import { Link, navigate } from '../lib/router';
import {
  authErrorMessage,
  googleEnabled,
  sendMagicLink,
  sendPasswordReset,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  updatePassword,
  useAuth,
  verifyCode,
} from '../lib/supabase';
import { toast } from './Toast';

type Mode = 'password' | 'magic';
type Intent = 'signin' | 'signup';
/** Pantallas después de enviar algo por mail. */
type Sent = null | 'magic' | 'confirm' | 'reset';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 6;
const RESEND_SECONDS = 60;

/** "Entrá a tu huerta": la planta crece mientras completás los datos y el tomate madura cuando están bien. */
export function Login() {
  const { user } = useAuth();
  const recovering = new URLSearchParams(location.search).has('recuperar');
  const [mode, setMode] = useState<Mode>('password');
  const [intent, setIntent] = useState<Intent>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const emailOk = EMAIL.test(email.trim());
  const passwordOk = password.length >= MIN_PASSWORD;
  const ready = mode === 'magic' ? emailOk : emailOk && passwordOk;
  const typed = mode === 'magic' ? email.length : email.length + password.length * 1.5;
  const growth = Math.min(1, typed / (mode === 'magic' ? 16 : 26));

  // Con sesión iniciada (y sin estar cambiando la contraseña), adentro.
  useEffect(() => {
    if (user && !recovering) {
      toast('¡Adentro! Tus apuntes ahora se guardan en tu cuenta');
      navigate('/apuntes', { replace: true });
    }
  }, [user, recovering]);

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      const mail = email.trim();
      if (mode === 'magic') {
        await sendMagicLink(mail);
        setCooldown(RESEND_SECONDS);
        setTimeout(() => setSent('magic'), 700);
      } else if (intent === 'signin') {
        await signInWithPassword(mail, password);
      } else {
        const signedIn = await signUpWithPassword(mail, password);
        if (!signedIn) setTimeout(() => setSent('confirm'), 700);
      }
    });

  const forgot = () => {
    if (!emailOk) return setError('Escribí tu mail arriba y tocá de nuevo.');
    void run(async () => {
      await sendPasswordReset(email.trim());
      setSent('reset');
    });
  };

  const picked = busy || !!sent;
  const title = recovering
    ? 'Nueva contraseña'
    : sent === 'magic' || sent === 'reset'
      ? 'Revisá tu mail'
      : sent === 'confirm'
        ? 'Confirmá tu mail'
        : intent === 'signup' && mode === 'password'
          ? 'Plantá tu cuenta'
          : 'Entrá a tu huerta';

  return (
    <div className="login">
      <Link to="/" className="login-back">
        <img src="/favicon.svg" alt="" width={22} height={22} /> Tomapuntes
      </Link>

      <div className="login-stage">
        <Plant growth={sent || recovering ? 1 : growth} ripe={ready || !!sent || recovering} picked={picked && !recovering} />

        <div className="login-card">
          <h1>{title}</h1>

          {recovering ? (
            <NewPassword hasSession={!!user} />
          ) : sent ? (
            <div className="login-sent">
              <Envelope />
              <p className="muted">
                {sent === 'reset' ? 'Te mandamos un link para cambiarla a ' : 'Abrí el link que mandamos a '}
                <strong>{email.trim()}</strong>
              </p>
              {sent === 'magic' && (
                <details className="login-code">
                  <summary>¿Te llegó un código?</summary>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(() => verifyCode(email.trim(), code.trim()));
                    }}
                  >
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      aria-label="Código de 6 dígitos"
                    />
                    <button className="btn primary" disabled={code.length !== 6 || busy}>
                      Entrar
                    </button>
                  </form>
                </details>
              )}
              {error && <p className="login-error">{error}</p>}
              <p className="muted login-small">
                {sent === 'magic' && (
                  <>
                    <button className="link-btn" disabled={cooldown > 0 || busy} onClick={() => void submit()}>
                      {cooldown ? `Reenviar en ${cooldown}s` : 'Reenviar'}
                    </button>
                    {' · '}
                  </>
                )}
                <button
                  className="link-btn"
                  onClick={() => {
                    setSent(null);
                    setCode('');
                    setError(null);
                  }}
                >
                  Volver
                </button>
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (ready && !busy) void submit();
              }}
            >
              <div className="mode-tabs login-modes" role="tablist" aria-label="Cómo entrar">
                <button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? 'active' : ''} onClick={() => setMode('password')}>
                  Contraseña
                </button>
                <button type="button" role="tab" aria-selected={mode === 'magic'} className={mode === 'magic' ? 'active' : ''} onClick={() => setMode('magic')}>
                  Link mágico
                </button>
              </div>

              <input
                className="login-input"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="Mail"
                aria-label="Mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
              {mode === 'password' && (
                <div className="password-field">
                  <input
                    className="login-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={intent === 'signup' ? 'new-password' : 'current-password'}
                    placeholder={intent === 'signup' ? `Contraseña (mín. ${MIN_PASSWORD})` : 'Contraseña'}
                    aria-label="Contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="show-password"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
              )}

              {error && <p className="login-error">{error}</p>}

              <button className="btn primary big login-submit" disabled={!ready || busy}>
                {busy
                  ? 'Cosechando…'
                  : mode === 'magic'
                    ? 'Mandame el link'
                    : intent === 'signup'
                      ? 'Crear cuenta'
                      : 'Entrar'}
              </button>

              {mode === 'password' && (
                <div className="login-links">
                  <button type="button" className="link-btn" onClick={() => setIntent(intent === 'signin' ? 'signup' : 'signin')}>
                    {intent === 'signin' ? 'Crear cuenta' : 'Ya tengo cuenta'}
                  </button>
                  {intent === 'signin' && (
                    <button type="button" className="link-btn muted-link" onClick={forgot}>
                      ¿Te olvidaste la contraseña?
                    </button>
                  )}
                </div>
              )}

              {googleEnabled && (
                <button type="button" className="btn ghost big login-google" onClick={() => void signInWithGoogle()}>
                  <GoogleMark /> Continuar con Google
                </button>
              )}
            </form>
          )}

          {!recovering && (
            <Link to="/" className="login-skip">
              Seguir sin cuenta →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** Al volver del mail de "cambiar contraseña": se elige la nueva y adentro. */
function NewPassword({ hasSession }: { hasSession: boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hasSession) {
    return <p className="muted">Abriendo el link…</p>;
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await updatePassword(password);
          toast('Listo, contraseña cambiada');
          navigate('/apuntes', { replace: true });
        } catch (err) {
          setError(authErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        className="login-input"
        type="password"
        autoComplete="new-password"
        placeholder={`Nueva contraseña (mín. ${MIN_PASSWORD})`}
        aria-label="Nueva contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
      />
      {error && <p className="login-error">{error}</p>}
      <button className="btn primary big login-submit" disabled={password.length < MIN_PASSWORD || busy}>
        Guardar contraseña
      </button>
    </form>
  );
}

/** Planta en maceta: el tallo se dibuja con el progreso, las hojas aparecen de a una y el tomate madura. */
function Plant({ growth, ripe, picked }: { growth: number; ripe: boolean; picked: boolean }) {
  const leaves = [
    { at: 0.22, d: 'M121 214 C 100 206, 88 212, 80 224 C 96 228, 110 224, 121 214Z', origin: '121px 214px' },
    { at: 0.4, d: 'M118 178 C 138 166, 152 170, 162 182 C 146 188, 130 186, 118 178Z', origin: '118px 178px' },
    { at: 0.58, d: 'M122 146 C 102 136, 90 140, 82 150 C 98 156, 112 154, 122 146Z', origin: '122px 146px' },
    { at: 0.74, d: 'M119 118 C 136 104, 150 106, 158 116 C 144 124, 130 124, 119 118Z', origin: '119px 118px' },
  ];
  const fruitScale = growth < 0.86 ? 0 : ripe ? 1 : 0.62;

  return (
    <svg className={`plant ${ripe ? 'ripe' : ''} ${picked ? 'picked' : ''}`} viewBox="0 0 240 330" aria-hidden="true">
      {/* Maceta */}
      <path d="M70 262 H170 L160 318 H80 Z" className="pot" />
      <rect x="64" y="252" width="112" height="16" rx="4" className="pot-rim" />
      <ellipse cx="120" cy="254" rx="50" ry="6" className="soil" />

      {/* Tallo */}
      <path
        d="M120 254 C 112 214, 132 178, 120 140 C 112 114, 124 98, 121 82"
        className="stem"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={1 - growth}
        // Con el tallo en cero, la punta redondeada dibujaría un puntito suelto.
        opacity={growth > 0 ? 1 : 0}
      />
      {leaves.map((l, i) => (
        <path
          key={i}
          d={l.d}
          className="leaf"
          style={{ transformOrigin: l.origin, transform: `scale(${growth >= l.at ? 1 : 0})` }}
        />
      ))}

      {/* Tomate colgando */}
      <g className="fruit" style={{ transform: `scale(${fruitScale})` }}>
        <path d="M121 84 C 128 86, 136 90, 140 96" className="stalk" />
        {/* La animación de caída va en este <g>: el de adentro conserva su translate. */}
        <g className="fruit-drop">
          <g transform="translate(146 118)">
            <path d="M0 -20C11 -22.5 27 -15 27 2 27 16 15 25 0 25S-27 16 -27 2C-27 -15 -11 -22.5 0 -20Z" className="fruit-body" />
            <ellipse cx="-11" cy="-7" rx="6" ry="3.4" transform="rotate(-35 -11 -7)" className="fruit-gloss" />
            <path d="M0 -19 -7 -24M0 -19l7 -5M0 -19l-5 5M0 -19l5 5" className="fruit-calyx" />
          </g>
        </g>
      </g>
    </svg>
  );
}

function Envelope() {
  return (
    <svg className="envelope" viewBox="0 0 120 84" aria-hidden="true">
      <rect x="4" y="10" width="112" height="70" rx="8" className="env-body" />
      <path d="M8 16 L60 52 L112 16" className="env-flap" />
      <g transform="translate(60 52)" className="env-seal">
        <circle r="15" />
        <path d="M0 -8C4 -9 10 -6 10 1 10 6 6 10 0 10S-10 6 -10 1C-10 -6 -4 -9 0 -8Z" className="seal-tomato" />
        <path d="M0 -8 -3 -11M0 -8l3 -3" className="seal-leaf" />
      </g>
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
