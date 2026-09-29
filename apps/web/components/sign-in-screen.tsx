'use client';

import { SignIn } from '@clerk/nextjs';
import { ArrowRight } from '@phosphor-icons/react/dist/ssr';
import { useAuthSession } from '@/lib/auth';
import { humanize, initials } from '@/lib/format';
import type { DemoUser } from '@/lib/store';
import type { Role } from '@/lib/types';
import { Logo } from './logo';
import { Card, CardHeader } from './ui';

const ROLE_BLURB: Record<Role, string> = {
  ADMIN: 'sets up assets and schedules, assigns work',
  INSPECTOR: 'runs checklists, verifies fixes',
  TECHNICIAN: 'works through assigned work orders',
};

/**
 * Shown in place of any page while nobody is signed in, so a deep link survives
 * sign-in. Clerk's form uses hash routing for the same reason: no /sign-in route.
 */
export function SignInScreen({
  demoUsers,
  onDemo,
}: {
  demoUsers: DemoUser[];
  onDemo: (userId: string) => void;
}) {
  const { unavailable } = useAuthSession();
  const here =
    typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`;
  // Largest demo organization first: it holds the full story.
  const count = (organization: string) =>
    demoUsers.filter((u) => u.organizationName === organization).length;
  const organizations = [...new Set(demoUsers.map((u) => u.organizationName))].sort(
    (a, b) => count(b) - count(a),
  );

  return (
    <div className="min-h-dvh px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Logo href="/" />
        {/* Phones: heading, account sign-in, demo. Desktop: sign-in in its own column on the right. */}
        <div className="mt-10 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <section>
            <h1 className="max-w-[20ch] text-3xl font-light tracking-tight sm:text-4xl">
              Inspections, issues and work orders in one loop.
            </h1>
            <p className="mt-3 max-w-[52ch] text-sm text-slate-600">
              Sign in with your account, or look around as someone on the demo team. The demo needs
              no sign-up.
            </p>
          </section>

          <div className="justify-self-center lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:justify-self-end">
            {unavailable ? (
              <Card className="max-w-sm p-6">
                <p className="text-sm font-semibold">
                  Account sign-in isn&apos;t available right now.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Check your connection or ad blocker and reload. The demo still works.
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

          {demoUsers.length > 0 && (
            <Card className="max-w-xl">
              <CardHeader title="Try the demo" />
              <div className="px-2 pb-2">
                {organizations.map((organization) => (
                  <div key={organization}>
                    <p className="px-3 pt-2 pb-1 text-xs text-slate-500">{organization}</p>
                    <ul>
                      {demoUsers
                        .filter((u) => u.organizationName === organization)
                        .map((u) => (
                          <li key={u.id}>
                            <button
                              type="button"
                              onClick={() => onDemo(u.id)}
                              className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-200 text-[0.6875rem] font-bold">
                                {initials(u.name)}
                              </span>
                              <span className="min-w-0 flex-1 leading-tight">
                                <span className="block text-sm font-semibold">{u.name}</span>
                                <span className="block text-xs text-slate-500">
                                  {humanize(u.role)}, {ROLE_BLURB[u.role]}
                                </span>
                              </span>
                              <ArrowRight
                                size={16}
                                aria-hidden
                                className="shrink-0 text-slate-400 group-hover:text-slate-900"
                              />
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
