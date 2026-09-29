'use client';

import { useAuth, useClerk, useUser } from '@clerk/nextjs';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface AuthValue {
  /** Real accounts exist; otherwise only demo logins. */
  clerk: boolean;
  /** Clerk has restored (or ruled out) a session. Always true without Clerk. */
  loaded: boolean;
  /** Clerk couldn't load (offline, blocked script): only demo logins work. */
  unavailable: boolean;
  /** Signed in with a Clerk account. */
  signedIn: boolean;
  email: string | null;
  /** A fresh session token for the API (Clerk refreshes it; they live about a minute). */
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const DEMO_ONLY: AuthValue = {
  clerk: false,
  loaded: true,
  unavailable: false,
  signedIn: false,
  email: null,
  getToken: async () => null,
  signOut: async () => {},
};

const AuthContext = createContext<AuthValue>(DEMO_ONLY);

/** Rendered inside `<ClerkProvider>`: turns Clerk's hooks into the app's small auth surface. */
export function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const clerk = useClerk();
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  // If Clerk never loads, `isLoaded` stays false forever; stop waiting so the demo still works.
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const onStatus = (status: string) => setUnavailable(status === 'error');
    clerk.on('status', onStatus, { notify: true });
    return () => clerk.off('status', onStatus);
  }, [clerk]);

  const value = useMemo<AuthValue>(
    () => ({
      clerk: true,
      loaded: isLoaded || unavailable,
      unavailable,
      signedIn: Boolean(isSignedIn),
      email,
      getToken: () => getToken(),
      signOut: () => signOut(),
    }),
    [isLoaded, unavailable, isSignedIn, email, getToken, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthSession(): AuthValue {
  return useContext(AuthContext);
}
