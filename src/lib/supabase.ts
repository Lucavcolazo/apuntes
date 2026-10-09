import { createClient, type Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Sin variables de entorno la app funciona igual, solo local (sin login ni nube). */
export const supabase = url && key
  ? createClient(url, key, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export const cloudEnabled = !!supabase;
export const googleEnabled = cloudEnabled && import.meta.env.VITE_AUTH_GOOGLE === '1';

// --- Sesión como store externo: cualquier componente se entera al entrar o salir ---
/** undefined = todavía cargando; null = invitado. */
let session: Session | null | undefined = supabase ? undefined : null;
const listeners = new Set<() => void>();
const set = (s: Session | null) => {
  session = s;
  listeners.forEach((l) => l());
};

if (supabase) {
  void supabase.auth.getSession().then(({ data }) => set(data.session));
  supabase.auth.onAuthStateChange((event, s) => {
    set(s);
    // El link del mail vuelve con ?code=… en la URL: lo limpiamos una vez canjeado.
    if (event === 'SIGNED_IN' && location.search.includes('code=')) {
      history.replaceState(null, '', location.pathname + location.hash);
    }
  });
}

export function useAuth() {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => session,
  );
  return { session: s, user: s?.user ?? null, loading: s === undefined };
}

const redirectTo = () => `${location.origin}/apuntes`;

export async function sendMagicLink(email: string) {
  if (!supabase) throw new Error('La nube no está configurada');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
  if (error) throw error;
}

/** Si la plantilla del mail incluye el código de 6 dígitos, se puede entrar escribiéndolo. */
export async function verifyCode(email: string, token: string) {
  if (!supabase) throw new Error('La nube no está configurada');
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

export async function signInWithGoogle() {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
}

export async function signOut() {
  await supabase?.auth.signOut();
}
