import { z } from 'zod';

export const roleSchema = z.enum(['ADMIN', 'INSPECTOR', 'TECHNICIAN']);
export type Role = z.infer<typeof roleSchema>;

export const severitySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type Severity = z.infer<typeof severitySchema>;

export const workOrderStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'VERIFIED',
  'CANCELLED',
]);
export type WorkOrderStatus = z.infer<typeof workOrderStatusSchema>;

export interface WorkOrderTransition {
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  roles: readonly Role[];
  /** Only the work order's assignee may perform it (roles still apply). */
  assigneeOnly?: boolean;
  requiresReason?: boolean;
  label: string;
}

/** The single source of truth for the work order state machine. */
export const WORK_ORDER_TRANSITIONS: readonly WorkOrderTransition[] = [
  { from: 'OPEN', to: 'IN_PROGRESS', roles: ['TECHNICIAN'], assigneeOnly: true, label: 'Start work' },
  { from: 'IN_PROGRESS', to: 'ON_HOLD', roles: ['TECHNICIAN'], assigneeOnly: true, label: 'Put on hold' },
  { from: 'ON_HOLD', to: 'IN_PROGRESS', roles: ['TECHNICIAN'], assigneeOnly: true, label: 'Resume' },
  { from: 'IN_PROGRESS', to: 'COMPLETED', roles: ['TECHNICIAN'], assigneeOnly: true, label: 'Mark completed' },
  { from: 'COMPLETED', to: 'VERIFIED', roles: ['INSPECTOR', 'ADMIN'], label: 'Verify' },
  {
    from: 'COMPLETED',
    to: 'IN_PROGRESS',
    roles: ['INSPECTOR', 'ADMIN'],
    requiresReason: true,
    label: 'Reject',
  },
  { from: 'OPEN', to: 'CANCELLED', roles: ['ADMIN'], label: 'Cancel' },
  { from: 'IN_PROGRESS', to: 'CANCELLED', roles: ['ADMIN'], label: 'Cancel' },
  { from: 'ON_HOLD', to: 'CANCELLED', roles: ['ADMIN'], label: 'Cancel' },
];

export interface TransitionActor {
  userId: string;
  role: Role;
}

/** Transitions out of `from` that `actor` may perform on a work order assigned to `assigneeId`. */
export function allowedTransitions(
  from: WorkOrderStatus,
  actor: TransitionActor,
  assigneeId: string | null,
): WorkOrderTransition[] {
  return WORK_ORDER_TRANSITIONS.filter(
    (t) =>
      t.from === from &&
      t.roles.includes(actor.role) &&
      (!t.assigneeOnly || assigneeId === actor.userId),
  );
}

export class InvalidTransitionError extends Error {
  readonly code = 'WORK_ORDER_INVALID_TRANSITION';

  constructor(from: WorkOrderStatus, to: WorkOrderStatus) {
    super(`Cannot move from ${from} to ${to}.`);
    this.name = 'InvalidTransitionError';
  }
}

/** Returns the matching transition or throws `InvalidTransitionError`. */
export function assertTransition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
  actor: TransitionActor,
  assigneeId: string | null,
): WorkOrderTransition {
  const match = allowedTransitions(from, actor, assigneeId).find((t) => t.to === to);
  if (!match) throw new InvalidTransitionError(from, to);
  return match;
}
