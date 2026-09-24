'use client';

import { assertTransition } from '@inspectra/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { code } from './format';
import { requirePermission } from './permissions';
import { nextDueAt } from './schedule';
import { DEMO_USERS, SEED_VERSION, createSeed } from './seed';
import type {
  Asset,
  AuditEvent,
  Db,
  InspectionResponse,
  Role,
  Schedule,
  Site,
  Template,
  User,
  WorkOrderStatus,
} from './types';

const STORAGE_KEY = `inspectra-demo-v${SEED_VERSION}`;

interface Persisted {
  db: Db;
  currentUserId: string;
}

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode, quota) — the demo still works in memory.
  }
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
  switchUser: (userId: string) => void;
  resetDemo: () => void;
  actions: {
    saveSite: (input: SiteInput, id?: string) => void;
    saveAsset: (input: AssetInput, id?: string) => void;
    saveTemplate: (input: TemplateInput) => string;
    createSchedule: (input: ScheduleInput) => void;
    toggleSchedule: (id: string) => void;
    runGeneration: () => number;
    submitInspection: (id: string, responses: ResponseInput[]) => number;
    createWorkOrder: (issueId: string, assigneeId: string, dueAt: string) => string;
    transitionWorkOrder: (id: string, to: WorkOrderStatus, reason?: string) => void;
    inviteMember: (name: string, email: string, role: Role) => void;
    changeRole: (userId: string, role: Role) => void;
  };
}

const StoreContext = createContext<StoreValue | null>(null);

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted | null>(null);
  const stateRef = useRef<Persisted | null>(null);

  useEffect(() => {
    const initial = load() ?? { db: createSeed(), currentUserId: DEMO_USERS.admin };
    stateRef.current = initial;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setState(initial);
  }, []);

  const commit = useCallback((next: Persisted) => {
    stateRef.current = next;
    save(next);
    setState(next);
  }, []);

  /**
   * Runs `fn` against a copy of the database and commits only if it doesn't throw —
   * the in-browser stand-in for a database transaction.
   */
  const transaction = useCallback(
    <T,>(fn: (db: Db, actor: { id: string; role: Role }, log: Logger) => T): T => {
      const current = stateRef.current!;
      const db = structuredClone(current.db);
      const actorId = current.currentUserId;
      const role = db.memberships.find((m) => m.userId === actorId)!.role;
      const now = new Date().toISOString();
      const log: Logger = (entityType, entityId, action, message) => {
        const event: AuditEvent = {
          id: newId('ae'),
          actorId,
          entityType,
          entityId,
          action,
          message,
          createdAt: now,
        };
        db.auditEvents.push(event);
      };
      const result = fn(db, { id: actorId, role }, log);
      commit({ ...current, db });
      return result;
    },
    [commit],
  );

  const actions = useMemo<StoreValue['actions']>(
    () => ({
      saveSite: (input, id) =>
        transaction((db, actor, log) => {
          requirePermission(actor.role, 'manage:sites');
          if (id) {
            Object.assign(db.sites.find((s) => s.id === id)!, input);
            log('site', id, 'UPDATED', `updated site ${input.name}`);
          } else {
            const site = { id: newId('site'), ...input };
            db.sites.push(site);
            log('site', site.id, 'CREATED', `created site ${input.name}`);
          }
        }),

      saveAsset: (input, id) =>
        transaction((db, actor, log) => {
          requirePermission(actor.role, 'manage:assets');
          if (id) {
            Object.assign(db.assets.find((a) => a.id === id)!, input);
            log('asset', id, 'UPDATED', `updated asset ${input.name}`);
          } else {
            const asset = { id: newId('ast'), ...input };
            db.assets.push(asset);
            log('asset', asset.id, 'CREATED', `created asset ${input.name}`);
          }
        }),

      saveTemplate: (input) =>
        transaction((db, actor, log) => {
          requirePermission(actor.role, 'manage:templates');
          if (!input.name.trim()) throw new Error('Template name is required.');
          if (input.items.length === 0) throw new Error('Add at least one checklist item.');
          if (input.items.some((i) => !i.prompt.trim())) throw new Error('Every item needs a prompt.');
          const existing = input.id ? db.templates.find((t) => t.id === input.id) : undefined;
          if (existing) {
            Object.assign(existing, input);
            log('template', existing.id, 'UPDATED', `updated template ${input.name}`);
            return existing.id;
          }
          const template: Template = { ...input, id: newId('tpl') };
          db.templates.push(template);
          log('template', template.id, 'CREATED', `created template ${input.name}`);
          return template.id;
        }),

      createSchedule: (input) =>
        transaction((db, actor, log) => {
          requirePermission(actor.role, 'manage:schedules');
          const schedule: Schedule = { ...input, id: newId('sch'), active: true };
          db.schedules.push(schedule);
          const template = db.templates.find((t) => t.id === input.templateId)!;
          const asset = db.assets.find((a) => a.id === input.assetId)!;
          log('schedule', schedule.id, 'CREATED', `scheduled ${template.name} for ${asset.name}`);
        }),

      toggleSchedule: (id) =>
        transaction((db, actor, log) => {
          requirePermission(actor.role, 'manage:schedules');
          const schedule = db.schedules.find((s) => s.id === id)!;
          schedule.active = !schedule.active;
          log('schedule', id, schedule.active ? 'ACTIVATED' : 'PAUSED', `${schedule.active ? 'resumed' : 'paused'} a schedule`);
        }),

      // Simulates the hourly BullMQ job. The (scheduleId, dueAt) check mirrors the
      // UNIQUE constraint the database will enforce, so running it twice is a no-op.
      runGeneration: () =>
        transaction((db, actor, log) => {
          requirePermission(actor.role, 'manage:schedules');
          const now = new Date();
          let created = 0;
          for (const schedule of db.schedules.filter((s) => s.active)) {
            const asset = db.assets.find((a) => a.id === schedule.assetId)!;
            const site = db.sites.find((s) => s.id === asset.siteId)!;
            const template = db.templates.find((t) => t.id === schedule.templateId)!;
            const dueAt = nextDueAt(schedule.frequency, schedule.timeOfDay, site.timezone, now).toISOString();
            const exists = db.inspections.some((i) => i.scheduleId === schedule.id && i.dueAt === dueAt);
            if (exists) continue;
            const number = ++db.counters.inspection;
            const id = newId('insp');
            db.inspections.push({
              id,
              number,
              scheduleId: schedule.id,
              templateName: template.name,
              assetId: asset.id,
              assigneeId: schedule.assigneeId,
              dueAt,
              status: 'PENDING',
              submittedAt: null,
              responses: template.items.map((item) => ({
                id: newId('resp'),
                itemPrompt: item.prompt,
                result: null,
                notes: '',
                severity: item.defaultSeverity,
              })),
            });
            db.auditEvents.push({
              id: newId('ae'),
              actorId: null,
              entityType: 'inspection',
              entityId: id,
              action: 'GENERATED',
              message: `${code.inspection(number)} generated from schedule (${template.name}, ${asset.name})`,
              createdAt: now.toISOString(),
            });
            created++;
          }
          if (created === 0) log('schedule', 'all', 'GENERATION_NOOP', 'checked the schedules; no new inspections were due');
          return created;
        }),

      submitInspection: (id, responses) =>
        transaction((db, actor, log) => {
          requirePermission(actor.role, 'perform:inspections');
          const inspection = db.inspections.find((i) => i.id === id)!;
          if (inspection.assigneeId !== actor.id) throw new Error('This inspection is assigned to someone else.');
          if (inspection.status === 'SUBMITTED') throw new Error('This inspection was already submitted.');
          if (responses.some((r) => r.result === null)) throw new Error('Answer every item before submitting.');

          const now = new Date().toISOString();
          for (const input of responses) {
            Object.assign(inspection.responses.find((r) => r.id === input.id)!, input);
          }
          inspection.status = 'SUBMITTED';
          inspection.submittedAt = now;

          const failed = inspection.responses.filter((r) => r.result === 'FAIL');
          log(
            'inspection',
            id,
            'SUBMITTED',
            `submitted ${code.inspection(inspection.number)} (${failed.length} item${failed.length === 1 ? '' : 's'} failed)`,
          );

          for (const response of failed) {
            // Mirrors UNIQUE (inspection_response_id) on issues.
            if (db.issues.some((i) => i.responseId === response.id)) continue;
            const number = ++db.counters.issue;
            const issueId = newId('iss');
            db.issues.push({
              id: issueId,
              number,
              inspectionId: id,
              responseId: response.id,
              assetId: inspection.assetId,
              title: response.itemPrompt,
              notes: response.notes,
              severity: response.severity,
              status: 'OPEN',
              createdAt: now,
            });
            const itemNo = inspection.responses.indexOf(response) + 1;
            log('issue', issueId, 'CREATED', `${code.issue(number)} created (${inspection.templateName}, item ${itemNo} failed)`);
          }
          return failed.length;
        }),

      createWorkOrder: (issueId, assigneeId, dueAt) =>
        transaction((db, actor, log) => {
          requirePermission(actor.role, 'assign:work_orders');
          const issue = db.issues.find((i) => i.id === issueId)!;
          if (issue.status !== 'OPEN') throw new Error('Only open issues can get a work order.');
          const assignee = db.users.find((u) => u.id === assigneeId)!;
          const number = ++db.counters.workOrder;
          const id = newId('wo');
          db.workOrders.push({
            id,
            number,
            issueId,
            assigneeId,
            status: 'OPEN',
            dueAt,
            createdAt: new Date().toISOString(),
          });
          issue.status = 'IN_WORK';
          log('work_order', id, 'CREATED', `created ${code.workOrder(number)} from ${code.issue(issue.number)}`);
          log('work_order', id, 'ASSIGNED', `assigned ${code.workOrder(number)} to ${assignee.name}`);
          return id;
        }),

      transitionWorkOrder: (id, to, reason) =>
        transaction((db, actor, log) => {
          const wo = db.workOrders.find((w) => w.id === id)!;
          const transition = assertTransition(wo.status, to, { userId: actor.id, role: actor.role }, wo.assigneeId);
          if (transition.requiresReason && !reason?.trim()) throw new Error('A reason is required to reject work.');

          const issue = db.issues.find((i) => i.id === wo.issueId)!;
          const from = wo.status;
          wo.status = to;
          if (to === 'VERIFIED') issue.status = 'RESOLVED';
          if (to === 'CANCELLED') issue.status = 'OPEN';

          const label = code.workOrder(wo.number);
          if (from === 'COMPLETED' && to === 'IN_PROGRESS') {
            log('work_order', id, 'REJECTED', `rejected ${label}: "${reason!.trim()}"`);
          } else {
            log('work_order', id, to, `moved ${label} to ${to}`);
          }
          if (to === 'VERIFIED') log('issue', issue.id, 'RESOLVED', `${code.issue(issue.number)} resolved`);
        }),

      inviteMember: (name, email, role) =>
        transaction((db, actor, log) => {
          requirePermission(actor.role, 'manage:members');
          if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
            throw new Error('Someone with that email is already a member.');
          }
          const user = { id: newId('user'), name, email };
          db.users.push(user);
          db.memberships.push({ userId: user.id, role });
          log('membership', user.id, 'INVITED', `invited ${name} as ${role}`);
        }),

      changeRole: (userId, role) =>
        transaction((db, actor, log) => {
          requirePermission(actor.role, 'manage:members');
          const admins = db.memberships.filter((m) => m.role === 'ADMIN');
          const membership = db.memberships.find((m) => m.userId === userId)!;
          if (membership.role === 'ADMIN' && role !== 'ADMIN' && admins.length === 1) {
            throw new Error('An organization needs at least one admin.');
          }
          membership.role = role;
          const user = db.users.find((u) => u.id === userId)!;
          log('membership', userId, 'ROLE_CHANGED', `changed ${user.name}'s role to ${role}`);
        }),
    }),
    [transaction],
  );

  const switchUser = useCallback(
    (userId: string) => commit({ ...stateRef.current!, currentUserId: userId }),
    [commit],
  );

  const resetDemo = useCallback(
    () => commit({ db: createSeed(), currentUserId: DEMO_USERS.admin }),
    [commit],
  );

  if (!state) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading…</div>;
  }

  const me = state.db.users.find((u) => u.id === state.currentUserId)!;
  const role = state.db.memberships.find((m) => m.userId === me.id)!.role;

  return (
    <StoreContext.Provider value={{ db: state.db, me, role, switchUser, resetDemo, actions }}>
      {children}
    </StoreContext.Provider>
  );
}

type Logger = (entityType: AuditEvent['entityType'], entityId: string, action: string, message: string) => void;

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
