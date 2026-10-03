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
import { Onboarding } from '@/components/onboarding';
import { SignInScreen } from '@/components/sign-in-screen';
import { api, ApiRequestError, type Credentials } from './api';
import { useAuthSession } from './auth';
import type { Db } from './types';

export type SiteInput = Omit<Site, 'id'>;
export type AssetInput = Omit<Asset, 'id'>;
export type TemplateInput = Omit<Template, 'id'> & { id?: string };
export type ScheduleInput = Omit<Schedule, 'id' | 'active'>;
export type ResponseInput = Pick<InspectionResponse, 'id' | 'result' | 'notes' | 'severity'>;

interface StoreValue {
  db: Db;
  me: User;
  role: Role;
  signOut: () => void;
  actions: {
    saveSite: (input: SiteInput, id?: string) => Promise<void>;
    saveAsset: (input: AssetInput, id?: string) => Promise<void>;
    saveTemplate: (input: TemplateInput) => Promise<string>;
    createSchedule: (input: ScheduleInput) => Promise<void>;
    toggleSchedule: (id: string) => Promise<void>;
    deleteSchedule: (id: string) => Promise<void>;
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
  /** Nobody is signed in: the sign-in screen. */
  | { status: 'signed-out' }
  /** Signed in but in no organization yet. */
  | { status: 'onboarding' }
  | { status: 'ready'; db: Db; me: Me };

const StoreContext = createContext<StoreValue | null>(null);

async function loadDb(credentials: Credentials): Promise<{ db: Db; me: Me }> {
  const get = <T,>(path: string) => api<T>(path, { credentials });
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
  const auth = useAuthSession();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const credentialsRef = useRef<Credentials | null>(null);
  // Drops responses that arrive after the user signed out.
  const loadToken = useRef(0);
  // Clerk's getToken changes identity between renders; reading it through a ref
  // keeps the credentials stable without reloading everything.
  const authRef = useRef(auth);
  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  const load = useCallback(async (credentials: Credentials) => {
    const token = ++loadToken.current;
    const { db, me } = await loadDb(credentials);
    if (token !== loadToken.current) return;
    credentialsRef.current = credentials;
    setState({ status: 'ready', db, me });
  }, []);

  useEffect(() => {
    if (!auth.loaded) return;
    let cancelled = false;
    (async () => {
      if (!auth.signedIn) {
        credentialsRef.current = null;
        setState({ status: 'signed-out' });
        return;
      }
      const credentials: Credentials = { getToken: () => authRef.current.getToken() };
      try {
        await load(credentials);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiRequestError && error.code === 'NO_ORGANIZATION') {
          credentialsRef.current = credentials;
          setState({ status: 'onboarding' });
          return;
        }
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not load Inspectra.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, attempt, auth.loaded, auth.signedIn]);

  /** Runs a write as the current user, then reloads so every page shows the server's truth. */
  const mutate = useCallback(
    async <T,>(fn: (credentials: Credentials) => Promise<T>): Promise<T> => {
      const credentials = credentialsRef.current;
      if (!credentials) throw new Error('Not signed in.');
      const result = await fn(credentials);
      await load(credentials);
      return result;
    },
    [load],
  );

  const actions = useMemo<StoreValue['actions']>(() => {
    const send = <T,>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
      mutate((credentials) => api<T>(path, { method, body, credentials }));

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
      deleteSchedule: async (id) => {
        await send('DELETE', `/schedules/${id}`);
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

  const signOut = useCallback(() => {
    credentialsRef.current = null;
    loadToken.current++;
    setState({ status: 'loading' });
    // Clerk flips `signedIn`, which reruns the session effect.
    void authRef.current.signOut();
  }, []);

  /** Onboarding: start an organization, then load it like any other sign-in. */
  const createOrganization = useCallback(
    async (name: string) => {
      const credentials = credentialsRef.current;
      if (!credentials) throw new Error('Not signed in.');
      await api<Me>('/organizations', { method: 'POST', body: { name }, credentials });
      await load(credentials);
    },
    [load],
  );

  if (state.status === 'loading') {
    return <div className="grid min-h-dvh place-items-center text-sm text-slate-500">Loading Inspectra…</div>;
  }

  if (state.status === 'signed-out') {
    return <SignInScreen />;
  }

  if (state.status === 'onboarding') {
    return <Onboarding email={auth.email} onCreate={createOrganization} onSignOut={signOut} />;
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
      value={{
        db: state.db,
        me: state.me.user,
        role: state.me.role,
        signOut,
        actions,
      }}
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
