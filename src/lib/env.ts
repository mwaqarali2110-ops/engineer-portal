/**
 * Typed access to the Vite environment. Never put secrets in here — only the
 * public anon key and flags belong in a frontend bundle.
 */

const rawUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const rawUseMock = import.meta.env.VITE_USE_MOCK_DATA ?? '';

export const env = {
  supabaseUrl: rawUrl.trim(),
  supabaseAnonKey: rawAnonKey.trim(),
  /**
   * Mock mode stays on unless it is explicitly disabled AND Supabase is
   * configured, so a missing .env can never silently point the portal at a
   * half-configured backend.
   */
  useMockData: rawUseMock.trim().toLowerCase() !== 'false',
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

/** True while the portal is running entirely on local mock data. */
export const isMockMode = env.useMockData || !isSupabaseConfigured;
