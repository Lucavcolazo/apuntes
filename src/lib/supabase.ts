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
    // El link del mail vuelve con ?code=… en la URL: lo limpiamos una vez canjeado
    // (sin tocar otros parámetros, como ?recuperar=1 para cambiar la contraseña).
    if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && location.search.includes('code=')) {
      const params = new URLSearchParams(location.search);
      params.delete('code');
      const rest = params.toString();
      history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
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

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('La nube no está configurada');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Devuelve true si la cuenta quedó lista; false si hay que confirmar el mail primero. */
export async function signUpWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('La nube no está configurada');
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
  if (error) throw error;
  // Con un mail ya registrado, Supabase no da error (para no revelar cuentas) pero devuelve un usuario sin identidades.
  if (data.user && !data.user.identities?.length) throw new Error('User already registered');
  return !!data.session;
}

export async function sendPasswordReset(email: string) {
  if (!supabase) throw new Error('La nube no está configurada');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}/entrar?recuperar=1`,
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  if (!supabase) throw new Error('La nube no está configurada');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Mensajes de Supabase traducidos a algo que se entienda. */
export function authErrorMessage(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/invalid login credentials/i.test(msg)) return 'Mail o contraseña incorrectos.';
  if (/email not confirmed/i.test(msg)) return 'Primero confirmá tu mail: revisá tu bandeja.';
  if (/already registered|already been registered/i.test(msg)) return 'Ya hay una cuenta con ese mail. Entrá o recuperá la contraseña.';
  if (/password should be|weak password|at least/i.test(msg)) return 'La contraseña tiene que tener al menos 6 caracteres.';
  if (/rate|limit|seconds/i.test(msg)) return 'Demasiados intentos seguidos. Esperá un minuto.';
  if (/same password|different from the old/i.test(msg)) return 'Elegí una contraseña distinta a la anterior.';
  return 'Algo salió mal. Probá de nuevo.';
}

export async function signInWithGoogle() {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
}

export async function signOut() {
  await supabase?.auth.signOut();
}
