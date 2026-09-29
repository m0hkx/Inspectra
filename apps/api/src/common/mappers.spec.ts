import type * as Db from '../generated/prisma/client';
import { toAuditEvent, toInspection, toIssue, toMember, toTemplate, toWorkOrder } from './mappers';

const at = new Date('2026-03-10T07:00:00.000Z');
const ORG = 'org-1';

describe('mappers', () => {
  it('orders template items by position without mutating the row', () => {
    const items = [
      {
        id: 'b',
        organizationId: ORG,
        templateId: 't',
        position: 1,
        prompt: 'Second',
        defaultSeverity: 'LOW',
      },
      {
        id: 'a',
        organizationId: ORG,
        templateId: 't',
        position: 0,
        prompt: 'First',
        defaultSeverity: 'HIGH',
      },
    ] as Db.TemplateItem[];
    const row = {
      id: 't',
      organizationId: ORG,
      name: 'T',
      description: '',
      createdAt: at,
      updatedAt: at,
      items,
    } as Db.InspectionTemplate & { items: Db.TemplateItem[] };

    expect(toTemplate(row).items).toEqual([
      { id: 'a', prompt: 'First', defaultSeverity: 'HIGH' },
      { id: 'b', prompt: 'Second', defaultSeverity: 'LOW' },
    ]);
    expect(row.items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('shapes an inspection: ISO dates, null submittedAt, responses by position with the prompt snapshot', () => {
    const responses = [
      {
        id: 'r2',
        organizationId: ORG,
        inspectionId: 'i',
        position: 1,
        itemPromptSnapshot: 'Horn',
        result: null,
        notes: '',
        severity: 'MEDIUM',
      },
      {
        id: 'r1',
        organizationId: ORG,
        inspectionId: 'i',
        position: 0,
        itemPromptSnapshot: 'Brakes',
        result: 'FAIL',
        notes: 'Soft',
        severity: 'CRITICAL',
      },
    ] as Db.InspectionResponse[];
    const row = {
      id: 'i',
      organizationId: ORG,
      number: 1041,
      scheduleId: 's',
      assetId: 'a',
      assigneeId: 'u',
      templateName: 'Pre-shift',
      dueAt: at,
      status: 'PENDING',
      submittedAt: null,
      createdAt: at,
      responses,
    } as Db.Inspection & { responses: Db.InspectionResponse[] };

    const inspection = toInspection(row);
    expect(inspection.dueAt).toBe('2026-03-10T07:00:00.000Z');
    expect(inspection.submittedAt).toBeNull();
    expect(inspection.responses).toEqual([
      { id: 'r1', itemPrompt: 'Brakes', result: 'FAIL', notes: 'Soft', severity: 'CRITICAL' },
      { id: 'r2', itemPrompt: 'Horn', result: null, notes: '', severity: 'MEDIUM' },
    ]);
    expect(inspection).not.toHaveProperty('organizationId');
  });

  it('exposes the issue response id under its API name', () => {
    const issue = toIssue({
      id: 'x',
      organizationId: ORG,
      number: 301,
      inspectionResponseId: 'resp',
      inspectionId: 'i',
      assetId: 'a',
      title: 'Brakes',
      notes: '',
      severity: 'HIGH',
      status: 'OPEN',
      createdAt: at,
    });
    expect(issue.responseId).toBe('resp');
    expect(issue).not.toHaveProperty('inspectionResponseId');
    expect(issue).not.toHaveProperty('organizationId');
  });

  it('never exposes the tenant or update time on work orders', () => {
    const wo = toWorkOrder({
      id: 'w',
      organizationId: ORG,
      number: 101,
      issueId: 'x',
      assigneeId: 'u',
      status: 'OPEN',
      dueAt: at,
      createdAt: at,
      updatedAt: at,
    });
    expect(Object.keys(wo).sort()).toEqual([
      'assigneeId',
      'createdAt',
      'dueAt',
      'id',
      'issueId',
      'number',
      'status',
    ]);
  });

  it('leaves audit snapshots out of the list shape', () => {
    const event = toAuditEvent({
      id: 'e',
      organizationId: ORG,
      actorId: null,
      entityType: 'work_order',
      entityId: 'w',
      action: 'CREATED',
      message: 'created WO-101',
      before: { status: 'OPEN' },
      after: { status: 'IN_PROGRESS' },
      createdAt: at,
    });
    expect(event).toEqual({
      id: 'e',
      actorId: null,
      entityType: 'work_order',
      entityId: 'w',
      action: 'CREATED',
      message: 'created WO-101',
      createdAt: at.toISOString(),
    });
  });

  it('identifies a member by their user id, not the membership id', () => {
    const member = toMember({
      id: 'membership-id',
      organizationId: ORG,
      userId: 'user-id',
      role: 'ADMIN',
      createdAt: at,
      user: {
        id: 'user-id',
        externalId: 'clerk_123',
        name: 'Ada',
        email: 'ada@a.test',
        createdAt: at,
      },
    } as Db.Membership & { user: Db.User });
    expect(member).toEqual({ id: 'user-id', name: 'Ada', email: 'ada@a.test', role: 'ADMIN' });
  });
});
