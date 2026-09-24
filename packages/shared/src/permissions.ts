import type { Role } from './work-orders';

export type Action =
  | 'manage:sites'
  | 'manage:assets'
  | 'manage:templates'
  | 'manage:schedules'
  | 'manage:members'
  | 'assign:work_orders'
  | 'view:all_work_orders'
  | 'view:all_inspections'
  | 'perform:inspections'
  | 'view:issues';

const PERMISSIONS: Record<Role, readonly Action[]> = {
  ADMIN: [
    'manage:sites',
    'manage:assets',
    'manage:templates',
    'manage:schedules',
    'manage:members',
    'assign:work_orders',
    'view:all_work_orders',
    'view:all_inspections',
    'view:issues',
  ],
  INSPECTOR: ['perform:inspections', 'view:all_work_orders', 'view:issues'],
  TECHNICIAN: [],
};

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[role].includes(action);
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';

  constructor(action: Action) {
    super(`You don't have permission to ${action.replace(':', ' ').replace('_', ' ')}.`);
    this.name = 'ForbiddenError';
  }
}

export function requirePermission(role: Role, action: Action): void {
  if (!can(role, action)) throw new ForbiddenError(action);
}
