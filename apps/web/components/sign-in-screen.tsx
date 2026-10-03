'use client';

import { SignIn } from '@clerk/nextjs';
import { useAuthSession } from '@/lib/auth';
import { Logo } from './logo';
import { Card } from './ui';

/**
 * Shown in place of any page while nobody is signed in, so a deep link survives
 * sign-in. Clerk's form uses hash routing for the same reason: no /sign-in route.
 */
export function SignInScreen() {
  const { unavailable } = useAuthSession();
  const here =
    typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`;

  return (
    <div className="min-h-dvh px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Logo href="/" />
        {/* Phones: heading, then sign-in. Desktop: sign-in in its own column on the right. */}
        <div className="mt-10 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <section>
            <h1 className="max-w-[20ch] text-3xl font-light tracking-tight sm:text-4xl">
              Inspections, issues and work orders in one loop.
            </h1>
            <p className="mt-3 max-w-[52ch] text-sm text-slate-600">
              Sign in with your account, or create one to start your organization.
            </p>
          </section>

          <div className="justify-self-center lg:justify-self-end">
            {unavailable ? (
              <Card className="max-w-sm p-6">
                <p className="text-sm font-semibold">
                  Account sign-in isn&apos;t available right now.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Check your connection or ad blocker and reload.
                </p>
              </Card>
            ) : (
              <SignIn
                routing="hash"
                withSignUp
                fallbackRedirectUrl={here}
                signUpFallbackRedirectUrl={here}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Built without a Clerk publishable key: nobody can sign in, so say how to fix it. */
export function SignInNotConfigured() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <Card className="w-full max-w-md p-8">
        <Logo href="/" />
        <h1 className="mt-6 text-xl font-light">Sign-in isn&apos;t configured</h1>
        <p className="mt-2 text-sm text-slate-600">
          Inspectra signs people in with Clerk. Set{' '}
          <code className="font-semibold text-slate-900">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> for
          the web app and <code className="font-semibold text-slate-900">CLERK_SECRET_KEY</code> for
          the API, then restart <code>next dev</code> or rebuild the image.
        </p>
      </Card>
    </div>
  );
}
