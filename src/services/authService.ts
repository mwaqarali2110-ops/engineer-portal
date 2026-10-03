/**
 * Authentication adapter.
 *
 * Mock mode (VITE_USE_MOCK_DATA=true): prototype sign-in. Any correctly
 * formatted engineer email plus a 6+ character password starts a local session.
 * No credentials are stored in the codebase.
 *
 * Real mode (VITE_USE_MOCK_DATA=false): Supabase Auth
 * (`signInWithPassword`) only. No session is ever fabricated in localStorage —
 * the Supabase SDK persists and refreshes its own session.
 *
 * A successful password check is not enough: the account must also be a
 * legitimate active engineer (`profiles.role = 'engineer'` and
 * `engineer_profiles.active`). Anything else is signed straight back out, so a
 * customer account can never sit inside the Engineer Portal shell. This is a
 * usability gate, not the security boundary — RLS
 * (`private.is_active_engineer`) is what actually protects customer data.
 */

import { isMockMode } from '../lib/env';
import { getSupabaseClient, requireSupabaseClient } from '../lib/supabase';
import type { AuthSession, Engineer } from '../types/domain';

const SESSION_STORAGE_KEY = 'kaamasaan-engineer-session';
const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'not_an_engineer'
  | 'inactive_engineer'
  | 'unavailable'
  | 'validation';

const MESSAGES: Record<AuthErrorKind, string> = {
  invalid_credentials: 'Invalid email or password.',
  not_an_engineer: 'This account does not have Engineer Portal access.',
  inactive_engineer: 'Your Engineer Portal access is currently inactive.',
  unavailable: 'Unable to sign in right now. Please try again.',
  validation: 'Enter your email and password.',
};

export class AuthError extends Error {
  kind: AuthErrorKind;
  /** Developer-facing detail; never rendered in the UI. */
  diagnostic?: string;

  constructor(kind: AuthErrorKind, message?: string, diagnostic?: string) {
    super(message ?? MESSAGES[kind]);
    this.name = 'AuthError';
    this.kind = kind;
    this.diagnostic = diagnostic;
  }
}

function logDiagnostic(context: string, detail: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[authService] ${context}:`, detail);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nameFromEmail(email: string): string {
  const handle = email.split('@')[0] ?? 'engineer';
  return (
    handle
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Design Engineer'
  );
}

function prototypeEngineer(email: string): Engineer {
  return {
    id: `prototype:${email.toLowerCase()}`,
    email: email.toLowerCase(),
    fullName: nameFromEmail(email),
    role: 'design_engineer',
  };
}

type ProfileRow = { id: string; full_name?: string | null; role?: string | null };
type EngineerProfileRow = { user_id: string; employee_code?: string | null; active?: boolean | null };

/**
 * Loads the engineer identity and refuses anything that is not an active
 * engineer. The caller is responsible for signing the rejected session out.
 */
async function loadEngineer(authUserId: string, email: string): Promise<Engineer> {
  const supabase = requireSupabaseClient();

  const [profileResult, engineerResult] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role').eq('id', authUserId).maybeSingle(),
    supabase
      .from('engineer_profiles')
      .select('user_id, employee_code, active')
      .eq('user_id', authUserId)
      .maybeSingle(),
  ]);

  if (profileResult.error) {
    logDiagnostic('profile lookup failed', profileResult.error);
    throw new AuthError('unavailable', undefined, `profiles: ${profileResult.error.message}`);
  }

  const profile = profileResult.data as ProfileRow | null;
  if (!profile || profile.role !== 'engineer') {
    throw new AuthError(
      'not_an_engineer',
      undefined,
      `profiles.role = ${profile?.role ?? 'no profile row'}`,
    );
  }

  // A missing engineer_profiles row is treated as "not provisioned yet" rather
  // than as access: the row is what carries the active flag.
  if (engineerResult.error) {
    logDiagnostic('engineer_profiles lookup failed', engineerResult.error);
    throw new AuthError(
      'unavailable',
      undefined,
      `engineer_profiles: ${engineerResult.error.message}`,
    );
  }

  const engineerProfile = engineerResult.data as EngineerProfileRow | null;
  if (!engineerProfile || engineerProfile.active !== true) {
    throw new AuthError(
      'inactive_engineer',
      undefined,
      engineerProfile ? 'engineer_profiles.active = false' : 'no engineer_profiles row',
    );
  }

  return {
    id: authUserId,
    authUserId,
    email: email.toLowerCase(),
    fullName: profile.full_name?.trim() || nameFromEmail(email),
    role: 'design_engineer',
    accountRole: profile.role,
    employeeCode: engineerProfile.employee_code ?? null,
  };
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const trimmedEmail = email.trim();

  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    throw new AuthError('validation', 'Enter a valid email address.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      'validation',
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  if (isMockMode) {
    await delay(400);
    const session: AuthSession = {
      engineer: prototypeEngineer(trimmedEmail),
      issuedAt: new Date().toISOString(),
    };
    persistMockSession(session);
    return session;
  }

  const supabase = requireSupabaseClient();

  let authUserId: string;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      logDiagnostic('signInWithPassword failed', error);
      // Supabase returns 400 "Invalid login credentials" for both a wrong
      // password and an unknown email; anything else is treated as an outage.
      const isCredentialFailure =
        error.status === 400 || /invalid login credentials/i.test(error.message);
      throw new AuthError(
        isCredentialFailure ? 'invalid_credentials' : 'unavailable',
        undefined,
        error.message,
      );
    }
    if (!data.user) throw new AuthError('unavailable', undefined, 'no user in auth response');
    authUserId = data.user.id;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    logDiagnostic('sign in transport failure', error);
    throw new AuthError(
      'unavailable',
      undefined,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const engineer = await loadEngineer(authUserId, trimmedEmail);
    return { engineer, issuedAt: new Date().toISOString() };
  } catch (error) {
    // Never leave a non-engineer signed in.
    await supabase.auth.signOut();
    throw error;
  }
}

export async function signOut(): Promise<void> {
  clearMockSession();
  if (isMockMode) return;

  const supabase = getSupabaseClient();
  if (supabase) await supabase.auth.signOut();
}

/**
 * Restores a session on boot: the prototype record in mock mode, the live
 * Supabase session in real mode. The engineer checks are re-run every time, so
 * revoking a role or deactivating an engineer ends the next session start.
 */
export async function restoreSession(): Promise<AuthSession | null> {
  if (isMockMode) return getMockSession();

  // A prototype record left behind by an earlier mock-mode run must never
  // linger next to a real session.
  clearMockSession();

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return null;

  try {
    const engineer = await loadEngineer(session.user.id, session.user.email ?? '');
    return {
      engineer,
      issuedAt: new Date(session.expires_at ? session.expires_at * 1000 : Date.now()).toISOString(),
    };
  } catch (error) {
    logDiagnostic('session restore rejected', error);
    await supabase.auth.signOut();
    return null;
  }
}

/* ------------------------------------------------ mock-mode session storage */

function getMockSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.engineer?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistMockSession(session: AuthSession): void {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable (private mode); the mock session just won't
    // survive a reload.
  }
}

function clearMockSession(): void {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore — nothing to clean up.
  }
}

export const authRules = { minPasswordLength: MIN_PASSWORD_LENGTH };
