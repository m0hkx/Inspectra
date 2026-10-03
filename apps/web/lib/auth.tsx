'use client';

import { useAuth, useClerk, useUser } from '@clerk/nextjs';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface AuthValue {
  /** Clerk has restored (or ruled out) a session, or failed to load. */
  loaded: boolean;
  /** Clerk couldn't load (offline, blocked script): nobody can sign in. */
  unavailable: boolean;
  /** Signed in with a Clerk account. */
  signedIn: boolean;
  email: string | null;
  /** A fresh session token for the API (Clerk refreshes it; they live about a minute). */
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Rendered inside `<ClerkProvider>`: turns Clerk's hooks into the app's small auth surface. */
export function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const clerk = useClerk();
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  // If Clerk never loads, `isLoaded` stays false forever; stop waiting so the sign-in screen can say so.
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const onStatus = (status: string) => setUnavailable(status === 'error');
    clerk.on('status', onStatus, { notify: true });
    return () => clerk.off('status', onStatus);
  }, [clerk]);

  const value = useMemo<AuthValue>(
    () => ({
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
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuthSession must be used inside <ClerkAuthBridge>');
  return value;
}
