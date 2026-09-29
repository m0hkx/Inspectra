import type { Inspection, Issue, WorkOrder, WorkOrderStatus } from '@inspectra/shared';
import { as, type TestApp } from './app';

const DAY = 86_400_000;

/** Multi-step API journeys shared by the e2e files. Everything goes through HTTP. */
export function flows(t: TestApp) {
  async function generate(userId = t.ids.a.admin): Promise<number> {
    const res = await t.http().post('/api/schedules/generate').set(as(userId)).expect(200);
    return res.body.created as number;
  }

  /** Generates today's inspections and returns the fixture schedule's pending one. */
  async function pendingInspection(
    scheduleId = t.ids.a.schedule,
    userId = t.ids.a.inspector,
  ): Promise<Inspection> {
    await generate();
    const res = await t.http().get('/api/inspections').set(as(userId)).expect(200);
    const inspection = (res.body as Inspection[]).find(
      (i) => i.scheduleId === scheduleId && i.status === 'PENDING',
    );
    if (!inspection) throw new Error(`no pending inspection for schedule ${scheduleId}`);
    return inspection;
  }

  /** Answers every item: the first `fails` FAIL, the rest PASS. */
  function answers(inspection: Inspection, fails: number) {
    return inspection.responses.map((r, i) => ({
      id: r.id,
      result: i < fails ? ('FAIL' as const) : ('PASS' as const),
      notes: i < fails ? `Broken ${i + 1}` : '',
      severity: r.severity,
    }));
  }

  async function submit(
    inspection: Inspection,
    fails: number,
    userId = t.ids.a.inspector,
  ): Promise<Inspection> {
    const res = await t
      .http()
      .post(`/api/inspections/${inspection.id}/submit`)
      .set(as(userId))
      .send({ responses: answers(inspection, fails) })
      .expect(200);
    return res.body as Inspection;
  }

  async function issuesOf(inspectionId: string): Promise<Issue[]> {
    const res = await t.http().get('/api/issues').set(as(t.ids.a.admin)).expect(200);
    return (res.body as Issue[])
      .filter((i) => i.inspectionId === inspectionId)
      .sort((x, y) => x.number - y.number);
  }

  /** A submitted inspection with one failed item, so exactly one OPEN issue. */
  async function openIssue(): Promise<Issue> {
    const inspection = await pendingInspection();
    await submit(inspection, 1);
    const [issue] = await issuesOf(inspection.id);
    if (!issue) throw new Error('submit opened no issue');
    return issue;
  }

  function createWorkOrder(issueId: string, assigneeId = t.ids.a.tech, userId = t.ids.a.admin) {
    return t
      .http()
      .post(`/api/issues/${issueId}/work-orders`)
      .set(as(userId))
      .send({ assigneeId, dueAt: new Date(Date.now() + DAY).toISOString() });
  }

  async function openWorkOrder(
    assigneeId = t.ids.a.tech,
  ): Promise<{ workOrder: WorkOrder; issue: Issue }> {
    const issue = await openIssue();
    const res = await createWorkOrder(issue.id, assigneeId).expect(201);
    return { workOrder: res.body as WorkOrder, issue };
  }

  function move(id: string, userId: string, to: WorkOrderStatus, reason?: string) {
    return t.http().post(`/api/work-orders/${id}/transitions`).set(as(userId)).send({ to, reason });
  }

  /** Adds another schedule for the fixture template/asset (e.g. for a second inspector). */
  async function addSchedule(assigneeId: string, timeOfDay = '08:00'): Promise<string> {
    const res = await t
      .http()
      .post('/api/schedules')
      .set(as(t.ids.a.admin))
      .send({
        templateId: t.ids.a.template,
        assetId: t.ids.a.asset,
        frequency: 'DAILY',
        timeOfDay,
        assigneeId,
      })
      .expect(201);
    return res.body.id as string;
  }

  return {
    generate,
    pendingInspection,
    answers,
    submit,
    issuesOf,
    openIssue,
    createWorkOrder,
    openWorkOrder,
    move,
    addSchedule,
  };
}
