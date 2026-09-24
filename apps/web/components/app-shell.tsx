'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Buildings,
  CalendarBlank,
  ClipboardText,
  Cube,
  House,
  ListChecks,
  UsersThree,
  WarningCircle,
  Wrench,
} from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';
import { humanize } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { Role } from '@/lib/types';
import { SearchBox } from './search-box';
import { Card, Tooltip, cx } from './ui';

const NAV: { href: string; label: string; icon: Icon; roles: Role[] }[] = [
  { href: '/dashboard', label: 'Overview', icon: House, roles: ['ADMIN', 'INSPECTOR', 'TECHNICIAN'] },
  { href: '/inspections', label: 'Inspections', icon: ClipboardText, roles: ['ADMIN', 'INSPECTOR'] },
  { href: '/issues', label: 'Issues', icon: WarningCircle, roles: ['ADMIN', 'INSPECTOR'] },
  { href: '/work-orders', label: 'Work orders', icon: Wrench, roles: ['ADMIN', 'INSPECTOR', 'TECHNICIAN'] },
  { href: '/assets', label: 'Assets', icon: Cube, roles: ['ADMIN', 'INSPECTOR', 'TECHNICIAN'] },
  { href: '/sites', label: 'Sites', icon: Buildings, roles: ['ADMIN'] },
  { href: '/templates', label: 'Templates', icon: ListChecks, roles: ['ADMIN'] },
  { href: '/schedules', label: 'Schedules', icon: CalendarBlank, roles: ['ADMIN'] },
  { href: '/settings/members', label: 'Members', icon: UsersThree, roles: ['ADMIN'] },
];

function Logo() {
  return (
    <Link href="/dashboard" className="inline-flex items-center gap-2 text-[0.9375rem] font-bold tracking-tight">
      <span className="grid size-8 place-items-center rounded-xl bg-slate-900">
        <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden>
          <path d="M4 1h6l3 3v13H1V4z" fill="none" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="7" cy="4.5" r="1.3" fill="white" />
          <path d="M4.2 10.5l1.9 1.9 3.7-4" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      Inspectra
    </Link>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function UserMenu() {
  const { me, role, demoUsers, switchUser } = useStore();
  const organizations = [...new Set(demoUsers.map((u) => u.organizationName))];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-2.5 rounded-xl py-1 pr-2 pl-1 text-left hover:bg-white"
      >
        <span className="grid size-9 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
          {initials(me.name)}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-sm font-semibold">{me.name}</span>
          <span className="block text-xs text-slate-500">{humanize(role)}</span>
        </span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
          {organizations.map((organization) => (
            <div key={organization} className="py-1">
              <p className="px-3 pt-2 pb-1 text-xs text-slate-500">{organization}</p>
              {demoUsers
                .filter((u) => u.organizationName === organization)
                .map((u) => {
                  const current = u.id === me.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={current}
                      onClick={() => {
                        switchUser(u.id);
                        setOpen(false);
                      }}
                      className={cx(
                        'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left',
                        current ? 'bg-slate-100' : 'hover:bg-slate-50',
                      )}
                    >
                      <span className="grid size-8 place-items-center rounded-full bg-slate-200 text-[0.6875rem] font-bold">
                        {initials(u.name)}
                      </span>
                      <span className="leading-tight">
                        <span className="block text-sm font-semibold">{u.name}</span>
                        <span className="block text-xs text-slate-500">{humanize(u.role)}</span>
                      </span>
                    </button>
                  );
                })}
            </div>
          ))}
          <p className="border-t border-slate-100 px-3 pt-3 pb-2 text-xs text-slate-500">
            Demo sign-in. Each person sees only their own organization.
          </p>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { role } = useStore();
  const items = NAV.filter((item) => item.roles.includes(role));

  const nav = (
    <nav
      aria-label="Main"
      className="no-scrollbar flex w-max max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1 md:overflow-visible"
    >
      {items.map(({ href, label, icon: NavIcon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'group relative flex h-9 shrink-0 items-center gap-2 rounded-xl text-sm transition-colors',
              active ? 'bg-slate-900 pr-3.5 pl-3 font-semibold text-white' : 'w-9 justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <NavIcon size={18} weight={active ? 'fill' : 'regular'} aria-hidden />
            {active ? label : <span className="sr-only">{label}</span>}
            {!active && <Tooltip>{label}</Tooltip>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 bg-slate-100/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 pt-4 pb-3 lg:px-8">
          <Logo />
          <div className="hidden flex-1 justify-center md:flex">{nav}</div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <UserMenu />
            <SearchBox className="hidden w-64 lg:block" />
          </div>
        </div>
        <div className="flex flex-col gap-2 px-4 pb-3 lg:hidden">
          <div className="md:hidden">{nav}</div>
          <SearchBox />
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 pt-4 pb-12 lg:px-8">
        {children}
      </main>
    </div>
  );
}

/** Client-side mirror of the API's role guard, so users don't land on screens they can't use. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { role } = useStore();
  if (roles.includes(role)) return <>{children}</>;
  return (
    <Card className="p-8">
      <p className="text-xl font-light">This page is for {roles.map(humanize).join(' and ')} roles.</p>
      <p className="mt-1 text-sm text-slate-500">
        Switch user from the menu at the top, or go back to the{' '}
        <Link href="/dashboard" className="font-semibold text-slate-900 underline underline-offset-4">
          overview
        </Link>
        .
      </p>
    </Card>
  );
}
