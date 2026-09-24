import {
  WORK_ORDER_TRANSITIONS,
  InvalidTransitionError,
  allowedTransitions,
  assertTransition,
  roleSchema,
  workOrderStatusSchema,
} from './work-orders';

const tech = { userId: 'tech-1', role: 'TECHNICIAN' as const };
const otherTech = { userId: 'tech-2', role: 'TECHNICIAN' as const };
const inspector = { userId: 'insp-1', role: 'INSPECTOR' as const };
const admin = { userId: 'admin-1', role: 'ADMIN' as const };

describe('work order transitions', () => {
  it.each(WORK_ORDER_TRANSITIONS.map((t) => [t.from, t.to, t.roles] as const))(
    '%s -> %s succeeds for allowed roles',
    (from, to, roles) => {
      for (const role of roles) {
        const actor = { userId: 'tech-1', role };
        expect(assertTransition(from, to, actor, 'tech-1').to).toBe(to);
      }
    },
  );

  it('rejects every pair that is not in the table', () => {
    const allowed = new Set(WORK_ORDER_TRANSITIONS.map((t) => `${t.from}->${t.to}`));
    for (const from of workOrderStatusSchema.options) {
      for (const to of workOrderStatusSchema.options) {
        if (allowed.has(`${from}->${to}`)) continue;
        for (const role of roleSchema.options) {
          expect(() => assertTransition(from, to, { userId: 'x', role }, 'x')).toThrow(
            InvalidTransitionError,
          );
        }
      }
    }
  });

  it("does not let a technician act on someone else's work order", () => {
    expect(() => assertTransition('OPEN', 'IN_PROGRESS', otherTech, tech.userId)).toThrow(
      'Cannot move from OPEN to IN_PROGRESS.',
    );
    expect(allowedTransitions('OPEN', otherTech, tech.userId)).toEqual([]);
  });

  it('lets inspectors and admins verify or reject completed work', () => {
    for (const actor of [inspector, admin]) {
      const targets = allowedTransitions('COMPLETED', actor, tech.userId).map((t) => t.to);
      expect(targets.sort()).toEqual(['IN_PROGRESS', 'VERIFIED']);
    }
    expect(allowedTransitions('COMPLETED', tech, tech.userId)).toEqual([]);
  });

  it('only lets admins cancel, and never from a terminal state', () => {
    expect(assertTransition('ON_HOLD', 'CANCELLED', admin, tech.userId).to).toBe('CANCELLED');
    expect(() => assertTransition('OPEN', 'CANCELLED', inspector, tech.userId)).toThrow();
    expect(() => assertTransition('VERIFIED', 'CANCELLED', admin, tech.userId)).toThrow();
  });
});
