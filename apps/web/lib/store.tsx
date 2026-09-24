'use client';

import {
  can,
  type AuditEvent,
  type Asset,
  type Inspection,
  type InspectionResponse,
  type Issue,
  type Me,
  type Member,
  type Role,
  type Schedule,
  type Site,
  type Template,
  type User,
  type WorkOrder,
  type WorkOrderStatus,
} from '@inspectra/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Db } from './types';

const USER_KEY = 'inspectra-demo-user';

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationName: string;
}

export type SiteInput = Omit<Site, 'id'>;
export type AssetInput = Omit<Asset, 'id'>;
export type TemplateInput = Omit<Template, 'id'> & { id?: string };
export type ScheduleInput = Omit<Schedule, 'id' | 'active'>;
export type ResponseInput = Pick<InspectionResponse, 'id' | 'result' | 'notes' | 'severity'>;

interface StoreValue {
  db: Db;
  me: User;
  role: Role;
  demoUsers: DemoUser[];
  switchUser: (userId: string) => void;
  actions: {
    saveSite: (input: SiteInput, id?: string) => Promise<void>;
    saveAsset: (input: AssetInput, id?: string) => Promise<void>;
    saveTemplate: (input: TemplateInput) => Promise<string>;
    createSchedule: (input: ScheduleInput) => Promise<void>;
    toggleSchedule: (id: string) => Promise<void>;
    runGeneration: () => Promise<number>;
    /** Resolves to the number of failed items (one issue opened for each). */
    submitInspection: (id: string, responses: ResponseInput[]) => Promise<number>;
    createWorkOrder: (issueId: string, assigneeId: string, dueAt: string) => Promise<string>;
    transitionWorkOrder: (id: string, to: WorkOrderStatus, reason?: string) => Promise<void>;
    inviteMember: (name: string, email: string, role: Role) => Promise<void>;
    changeRole: (userId: string, role: Role) => Promise<void>;
  };
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; db: Db; me: Me; demoUsers: DemoUser[]; userId: string };

const StoreContext = createContext<StoreValue | null>(null);

function readStoredUser(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

function storeUser(userId: string): void {
  try {
    localStorage.setItem(USER_KEY, userId);
  } catch {
    // Private mode or blocked storage: the choice just won't survive a reload.
  }
}

/** Default demo login: the first admin of the largest demo organization. */
function defaultUser(users: DemoUser[]): string {
  const sizes = new Map<string, number>();
  for (const u of users) sizes.set(u.organizationName, (sizes.get(u.organizationName) ?? 0) + 1);
  const largest = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const admin = users.find((u) => u.organizationName === largest && u.role === 'ADMIN');
  return (admin ?? users[0]).id;
}

async function loadDb(userId: string): Promise<{ db: Db; me: Me }> {
  const get = <T,>(path: string) => api<T>(path, { userId });
  const me = await get<Me>('/me');
  const seesInspections = can(me.role, 'view:all_inspections') || can(me.role, 'perform:inspections');
  const [members, sites, assets, templates, schedules, inspections, issues, workOrders, auditEvents] = await Promise.all([
    get<Member[]>('/members'),
    get<Site[]>('/sites'),
    get<Asset[]>('/assets'),
    get<Template[]>('/templates'),
    get<Schedule[]>('/schedules'),
    seesInspections ? get<Inspection[]>('/inspections') : Promise.resolve([]),
    get<Issue[]>('/issues'),
    get<WorkOrder[]>('/work-orders'),
    get<AuditEvent[]>('/audit-events?limit=300'),
  ]);
  return {
    me,
    db: {
      organization: me.organization,
      users: members.map(({ id, name, email }) => ({ id, name, email })),
      memberships: members.map((m) => ({ userId: m.id, role: m.role })),
      sites,
      assets,
      templates,
      schedules,
      inspections,
      issues,
      workOrders,
      auditEvents,
    },
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const userRef = useRef<string | null>(null);
  const demoUsersRef = useRef<DemoUser[]>([]);
  // Drops responses that arrive after the user switched again.
  const loadToken = useRef(0);

  const load = useCallback(async (userId: string, demoUsers: DemoUser[]) => {
    const token = ++loadToken.current;
    const { db, me } = await loadDb(userId);
    if (token !== loadToken.current) return;
    userRef.current = userId;
    demoUsersRef.current = demoUsers;
    setState({ status: 'ready', db, me, demoUsers, userId });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const demoUsers = await api<DemoUser[]>('/auth/demo-users');
        if (demoUsers.length === 0) throw new Error('The database has no users yet. Seed it with `pnpm --filter @inspectra/api db:seed`.');
        const stored = readStoredUser();
        const userId = demoUsers.some((u) => u.id === stored) ? stored! : defaultUser(demoUsers);
        if (!cancelled) await load(userId, demoUsers);
      } catch (error) {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not load Inspectra.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  /** Runs a write as the current user, then reloads so every page shows the server's truth. */
  const mutate = useCallback(
    async <T,>(fn: (userId: string) => Promise<T>): Promise<T> => {
      const userId = userRef.current;
      if (!userId) throw new Error('Not signed in.');
      const result = await fn(userId);
      await load(userId, demoUsersRef.current);
      return result;
    },
    [load],
  );

  const actions = useMemo<StoreValue['actions']>(() => {
    const send = <T,>(method: 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown) =>
      mutate((userId) => api<T>(path, { method, body, userId }));

    return {
      saveSite: async (input, id) => {
        await send(id ? 'PATCH' : 'POST', id ? `/sites/${id}` : '/sites', input);
      },
      saveAsset: async (input, id) => {
        await send(id ? 'PATCH' : 'POST', id ? `/assets/${id}` : '/assets', input);
      },
      saveTemplate: async ({ id, ...input }) => {
        const saved = await send<Template>(id ? 'PUT' : 'POST', id ? `/templates/${id}` : '/templates', input);
        return saved.id;
      },
      createSchedule: async (input) => {
        await send('POST', '/schedules', input);
      },
      toggleSchedule: async (id) => {
        const schedule = (state.status === 'ready' ? state.db.schedules : []).find((s) => s.id === id);
        await send('PATCH', `/schedules/${id}`, { active: !schedule?.active });
      },
      runGeneration: async () => (await send<{ created: number }>('POST', '/schedules/generate')).created,
      submitInspection: async (id, responses) => {
        if (responses.some((r) => r.result === null)) throw new Error('Answer every item before submitting.');
        await send('POST', `/inspections/${id}/submit`, { responses });
        return responses.filter((r) => r.result === 'FAIL').length;
      },
      createWorkOrder: async (issueId, assigneeId, dueAt) =>
        (await send<WorkOrder>('POST', `/issues/${issueId}/work-orders`, { assigneeId, dueAt })).id,
      transitionWorkOrder: async (id, to, reason) => {
        await send('POST', `/work-orders/${id}/transitions`, { to, reason: reason || undefined });
      },
      inviteMember: async (name, email, role) => {
        await send('POST', '/members', { name, email, role });
      },
      changeRole: async (userId, role) => {
        await send('PATCH', `/members/${userId}`, { role });
      },
    };
  }, [mutate, state]);

  const switchUser = useCallback(
    (userId: string) => {
      storeUser(userId);
      load(userId, demoUsersRef.current).catch((error: unknown) =>
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not switch user.' }),
      );
    },
    [load],
  );

  if (state.status === 'loading') {
    return <div className="grid min-h-dvh place-items-center text-sm text-slate-500">Loading Inspectra…</div>;
  }

  if (state.status === 'error') {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8">
          <p className="text-xl font-light">Inspectra couldn&apos;t load.</p>
          <p className="mt-2 text-sm text-slate-600">{state.message}</p>
          <button
            type="button"
            onClick={() => {
              setState({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
            className="mt-5 inline-flex min-h-10 cursor-pointer items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <StoreContext.Provider
      value={{ db: state.db, me: state.me.user, role: state.me.role, demoUsers: state.demoUsers, switchUser, actions }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>');
  return value;
}

export function useLookup() {
  const { db } = useStore();
  return useMemo(
    () => ({
      user: (id: string | null) => db.users.find((u) => u.id === id),
      asset: (id: string) => db.assets.find((a) => a.id === id),
      site: (id: string) => db.sites.find((s) => s.id === id),
      template: (id: string) => db.templates.find((t) => t.id === id),
      issue: (id: string) => db.issues.find((i) => i.id === id),
      roleOf: (userId: string) => db.memberships.find((m) => m.userId === userId)?.role,
      usersWithRole: (role: Role) =>
        db.users.filter((u) => db.memberships.find((m) => m.userId === u.id)?.role === role),
    }),
    [db],
  );
}
