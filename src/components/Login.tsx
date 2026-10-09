import { useEffect, useState } from 'react';
import { Link, navigate } from '../lib/router';
import { googleEnabled, sendMagicLink, signInWithGoogle, useAuth, verifyCode } from '../lib/supabase';
import { toast } from './Toast';

type Stage = 'form' | 'sending' | 'sent';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_SECONDS = 60;

/** "Entrá a tu huerta": la planta crece con cada letra del mail y el tomate madura cuando es válido. */
export function Login() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const valid = EMAIL.test(email.trim());
  const growth = Math.min(1, email.length / 16);

  useEffect(() => {
    if (user) {
      toast('¡Adentro! Tus apuntes ahora se guardan en tu cuenta');
      navigate('/apuntes', { replace: true });
    }
  }, [user]);

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    if (!valid) return;
    setError(null);
    setStage('sending');
    try {
      await sendMagicLink(email.trim());
      // Dejamos que el tomate termine de caer antes de cambiar de pantalla.
      setTimeout(() => setStage('sent'), 900);
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setStage('form');
      const msg = e instanceof Error ? e.message : '';
      setError(
        /rate|limit|seconds/i.test(msg)
          ? 'Pediste muchos links seguidos. Esperá un minuto y probá de nuevo.'
          : 'No pudimos mandar el mail. Revisá la dirección e intentá otra vez.',
      );
    }
  };

  const enterCode = async () => {
    try {
      await verifyCode(email.trim(), code.trim());
    } catch {
      setError('Ese código no funcionó (o ya venció). Pedí uno nuevo.');
    }
  };

  return (
    <div className="login">
      <Link to="/" className="login-back">
        <img src="/favicon.svg" alt="" width={22} height={22} /> Tomapuntes
      </Link>

      <div className="login-stage">
        <Plant growth={stage === 'form' ? growth : 1} ripe={valid || stage !== 'form'} picked={stage !== 'form'} />

        <div className="login-card">
          {stage !== 'sent' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <h1>Entrá a tu huerta</h1>
              <p className="muted">
                Con tu cuenta, tus apuntes, subrayados y estadísticas te siguen a la compu y al celu. Sin contraseñas: te
                mandamos un link por mail.
              </p>
              <label className="login-field">
                <span>Tu mail</span>
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="vos@mail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  disabled={stage === 'sending'}
                />
              </label>
              <span className={`login-hint ${valid ? 'ok' : ''}`}>
                {valid ? 'El tomate está maduro. ¡A cosechar!' : email ? 'Seguí regando…' : 'Escribí tu mail y mirá la planta'}
              </span>
              {error && <p className="login-error">{error}</p>}
              <button className="btn primary big login-submit" disabled={!valid || stage === 'sending'}>
                {stage === 'sending' ? 'Cosechando…' : 'Mandame el link mágico'}
              </button>
              {googleEnabled && (
                <button type="button" className="btn ghost big login-google" onClick={() => void signInWithGoogle()}>
                  <GoogleMark /> Continuar con Google
                </button>
              )}
            </form>
          ) : (
            <div className="login-sent">
              <Envelope />
              <h1>¡Revisá tu mail!</h1>
              <p className="muted">
                Te mandamos un link a <strong>{email.trim()}</strong>. Abrilo en este mismo dispositivo y entrás directo.
              </p>
              <details className="login-code">
                <summary>¿Te llegó un código de 6 dígitos?</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void enterCode();
                  }}
                >
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <button className="btn primary" disabled={code.length !== 6}>
                    Entrar
                  </button>
                </form>
              </details>
              {error && <p className="login-error">{error}</p>}
              <p className="muted login-small">
                ¿No llegó? Mirá en spam o{' '}
                <button className="link-btn" disabled={cooldown > 0} onClick={() => void send()}>
                  {cooldown ? `reenviá en ${cooldown}s` : 'reenvialo'}
                </button>
                . ·{' '}
                <button
                  className="link-btn"
                  onClick={() => {
                    setStage('form');
                    setCode('');
                    setError(null);
                  }}
                >
                  Cambiar mail
                </button>
              </p>
            </div>
          )}

          <Link to="/" className="login-skip">
            Seguir sin cuenta →
          </Link>
        </div>
      </div>
    </div>
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
