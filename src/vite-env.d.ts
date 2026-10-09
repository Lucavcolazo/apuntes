/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** "1" cuando el login con Google está configurado en Supabase. */
  readonly VITE_AUTH_GOOGLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
