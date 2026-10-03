import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { restoreSession, signIn as serviceSignIn, signOut as serviceSignOut } from '../../services/authService';
import type { AuthSession, Engineer } from '../../types/domain';

type AuthContextValue = {
  engineer: Engineer | null;
  isRestoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Wraps the auth service so screens never call it directly. Swapping the
 * service to Supabase Auth later requires no change here or in the UI.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let active = true;

    restoreSession()
      .then((restored) => {
        if (active) setSession(restored);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setIsRestoring(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await serviceSignIn(email, password);
    setSession(next);
  }, []);

  const signOut = useCallback(async () => {
    await serviceSignOut();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ engineer: session?.engineer ?? null, isRestoring, signIn, signOut }),
    [session, isRestoring, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
