import { randomUUID } from 'node:crypto';
import { nextDueAt } from '@inspectra/shared';
import type { Prisma, PrismaClient, ResponseResult, Severity } from '../generated/prisma/client';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const HISTORY_DAYS = 120;

export const DEMO_ORG_NAME = 'Northwind Facilities';

interface TemplateSeed {
  key: string;
  name: string;
  description: string;
  items: { prompt: string; severity: Severity }[];
}

const TEMPLATES: TemplateSeed[] = [
  {
    key: 'fire',
    name: 'Fire Safety Check',
    description: 'Monthly walk-through of extinguishers, exits and alarms.',
    items: [
      { prompt: 'Extinguisher pressure gauge in the green zone', severity: 'HIGH' },
      { prompt: 'Safety pin and tamper seal intact', severity: 'MEDIUM' },
      { prompt: 'Emergency exit signage illuminated', severity: 'HIGH' },
      { prompt: 'Path to extinguisher is unobstructed', severity: 'LOW' },
    ],
  },
  {
    key: 'forklift',
    name: 'Forklift Pre-Shift Check',
    description: 'Daily check before the first shift operates the forklift.',
    items: [
      { prompt: 'Brakes and parking brake hold', severity: 'CRITICAL' },
      { prompt: 'Horn and warning lights work', severity: 'MEDIUM' },
      { prompt: 'No hydraulic fluid leaks', severity: 'HIGH' },
      { prompt: 'Tyres free of cuts and bulges', severity: 'MEDIUM' },
    ],
  },
  {
    key: 'hvac',
    name: 'HVAC Weekly Inspection',
    description: 'Filters, drainage and temperature output.',
    items: [
      { prompt: 'Air filter clean (not clogged)', severity: 'MEDIUM' },
      { prompt: 'Condensate drain flowing freely', severity: 'LOW' },
      { prompt: 'Supply air within 12–16 °C', severity: 'HIGH' },
    ],
  },
];

/** Deterministic PRNG so every seed produces the same history. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeds the demo organizations. Idempotent: returns false and changes nothing when
 * the demo organization already exists.
 */
export async function seedDemo(prisma: PrismaClient, now = new Date()): Promise<boolean> {
  if (await prisma.organization.findFirst({ where: { name: DEMO_ORG_NAME } })) return false;

  const at = (offset: number) => new Date(now.getTime() + offset);
  const ids = new Map<string, string>();
  const id = (key: string) => {
    if (!ids.has(key)) ids.set(key, randomUUID());
    return ids.get(key)!;
  };
  const orgId = id('org');

  const users = [
    { key: 'admin', name: 'Mohammad Khalid', email: 'mohammad@northwind.test', role: 'ADMIN' as const },
    { key: 'inspector', name: 'Sara Haddad', email: 'sara@northwind.test', role: 'INSPECTOR' as const },
    { key: 'tech', name: 'Ahmed Nasser', email: 'ahmed@northwind.test', role: 'TECHNICIAN' as const },
    { key: 'tech2', name: 'Lina Farouk', email: 'lina@northwind.test', role: 'TECHNICIAN' as const },
  ];

  const sites = [
    { key: 'hq', name: 'Head Office', address: '12 King Fahd Rd, Riyadh', timezone: 'Asia/Riyadh' },
    { key: 'wh', name: 'North Warehouse', address: 'Unit 4, Trafford Park, Manchester', timezone: 'Europe/London' },
  ];
  const tz = Object.fromEntries(sites.map((s) => [s.key, s.timezone]));

  const assets = [
    { key: 'ext1', site: 'hq', name: 'Fire Extinguisher A1', category: 'Fire Safety', serial: 'FE-20231', location: 'Floor 1, Lobby', status: 'ACTIVE' as const },
    { key: 'ext2', site: 'wh', name: 'Fire Extinguisher B2', category: 'Fire Safety', serial: 'FE-20488', location: 'Loading Bay, Door B2', status: 'ACTIVE' as const },
    { key: 'fl3', site: 'wh', name: 'Forklift #3', category: 'Vehicles', serial: 'TY-8FGU25-3310', location: 'Aisle 7', status: 'ACTIVE' as const },
    { key: 'fl5', site: 'wh', name: 'Forklift #5', category: 'Vehicles', serial: 'TY-8FGU25-4127', location: 'Aisle 2', status: 'ACTIVE' as const },
    { key: 'hvac', site: 'hq', name: 'Rooftop HVAC Unit 1', category: 'HVAC', serial: 'CR-48TC-0092', location: 'Roof, East side', status: 'ACTIVE' as const },
    { key: 'ups', site: 'hq', name: 'Server Room UPS', category: 'Electrical', serial: 'APC-SRT5K-7781', location: 'Floor 2, Server Room', status: 'OUT_OF_SERVICE' as const },
  ];
  const assetSite = Object.fromEntries(assets.map((a) => [a.key, a.site]));

  const schedules = [
    { key: 'fire_wh', template: 'fire', asset: 'ext2', frequency: 'MONTHLY' as const, time: '09:00' },
    { key: 'fire_hq', template: 'fire', asset: 'ext1', frequency: 'MONTHLY' as const, time: '10:00' },
    { key: 'fl3', template: 'forklift', asset: 'fl3', frequency: 'DAILY' as const, time: '07:00' },
    { key: 'fl5', template: 'forklift', asset: 'fl5', frequency: 'DAILY' as const, time: '07:00' },
    { key: 'hvac', template: 'hvac', asset: 'hvac', frequency: 'WEEKLY' as const, time: '08:30' },
  ];
  const template = (key: string) => TEMPLATES.find((t) => t.key === key)!;
  const scheduleDue = (key: string) => {
    const s = schedules.find((x) => x.key === key)!;
    return nextDueAt(s.frequency, s.time, tz[assetSite[s.asset]], now);
  };

  type InspectionRow = Prisma.InspectionCreateManyInput;
  type ResponseRow = Prisma.InspectionResponseCreateManyInput;
  const inspections: InspectionRow[] = [];
  const responses: ResponseRow[] = [];
  const issues: Prisma.IssueCreateManyInput[] = [];
  const workOrders: Prisma.WorkOrderCreateManyInput[] = [];
  const audit: Prisma.AuditEventCreateManyInput[] = [];

  const addInspection = (
    key: string,
    number: number,
    schedule: string,
    dueAt: Date,
    submittedAt: Date | null,
    results: (null | { result: ResponseResult; notes?: string })[] | null,
  ) => {
    const s = schedules.find((x) => x.key === schedule)!;
    const t = template(s.template);
    inspections.push({
      id: id(key),
      organizationId: orgId,
      number,
      scheduleId: id(`sch_${schedule}`),
      assetId: id(`ast_${s.asset}`),
      assigneeId: id('user_inspector'),
      templateName: t.name,
      dueAt,
      status: submittedAt ? 'SUBMITTED' : 'PENDING',
      submittedAt,
      createdAt: new Date(dueAt.getTime() - DAY),
    });
    t.items.forEach((item, position) => {
      const answer = results?.[position] ?? null;
      responses.push({
        id: id(`${key}_r${position + 1}`),
        organizationId: orgId,
        inspectionId: id(key),
        position,
        itemPromptSnapshot: item.prompt,
        result: answer?.result ?? null,
        notes: answer?.notes ?? '',
        severity: item.severity,
      });
    });
  };

  // History: ~4 months of submitted inspections so the activity chart has real data.
  const rand = mulberry32(20260924);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const plan: { schedule: string; day: Date; hour: number }[] = [];
  for (let k = HISTORY_DAYS; k >= 1; k--) {
    const day = new Date(startOfToday.getTime() - k * DAY);
    const weekday = day.getDay();
    const workday = weekday !== 0 && weekday !== 6;
    if (workday && k >= 2) plan.push({ schedule: 'fl3', day, hour: 7 });
    if (workday) plan.push({ schedule: 'fl5', day, hour: 7 });
    if (weekday === 1 && k >= 3) plan.push({ schedule: 'hvac', day, hour: 8 });
    if (day.getDate() === 1 && k >= 4) {
      plan.push({ schedule: 'fire_wh', day, hour: 9 });
      plan.push({ schedule: 'fire_hq', day, hour: 10 });
    }
  }
  const kept = plan.filter(() => rand() > 0.06);
  const historyFails: { inspection: string; response: string; asset: string; prompt: string; severity: Severity; at: Date }[] = [];
  kept.forEach((p, i) => {
    const key = `hist_${i}`;
    const dueAt = new Date(p.day.getTime() + p.hour * HOUR);
    const submittedAt = new Date(dueAt.getTime() + (10 + Math.floor(rand() * 80)) * 60_000);
    const s = schedules.find((x) => x.key === p.schedule)!;
    const t = template(s.template);
    const results = t.items.map((item, position) => {
      const roll = rand();
      const result: ResponseResult = roll < 0.045 ? 'FAIL' : roll < 0.07 ? 'NA' : 'PASS';
      if (result === 'FAIL') {
        historyFails.push({ inspection: key, response: `${key}_r${position + 1}`, asset: s.asset, prompt: item.prompt, severity: item.severity, at: submittedAt });
      }
      return { result, notes: result === 'FAIL' ? 'Found during routine check; reported to maintenance.' : '' };
    });
    addInspection(key, 1040 - kept.length + 1 + i, p.schedule, dueAt, submittedAt, results);
  });

  historyFails.forEach((f, i) => {
    const issueKey = `hist_iss_${i}`;
    issues.push({
      id: id(issueKey),
      organizationId: orgId,
      number: 301 - historyFails.length + 1 + i,
      inspectionResponseId: id(f.response),
      inspectionId: id(f.inspection),
      assetId: id(`ast_${f.asset}`),
      title: f.prompt,
      notes: 'Found during routine check; reported to maintenance.',
      severity: f.severity,
      status: 'RESOLVED',
      createdAt: f.at,
    });
    workOrders.push({
      id: id(`hist_wo_${i}`),
      organizationId: orgId,
      number: 101 - historyFails.length + 1 + i,
      issueId: id(issueKey),
      assigneeId: id(i % 2 === 0 ? 'user_tech' : 'user_tech2'),
      status: 'VERIFIED',
      dueAt: new Date(f.at.getTime() + 3 * DAY),
      createdAt: new Date(f.at.getTime() + 2 * HOUR),
    });
  });

  // The live part of the demo: recent submissions, open work, and what is due next.
  addInspection('insp_1041', 1041, 'fire_wh', at(-3 * DAY), at(-3 * DAY + 2 * HOUR), [
    { result: 'PASS' },
    { result: 'PASS' },
    { result: 'FAIL', notes: 'Exit sign above door B2 is dark — likely a failed LED driver.' },
    { result: 'FAIL', notes: 'Pallets stacked in front of the extinguisher cabinet.' },
  ]);
  addInspection('insp_1042', 1042, 'fl3', at(-1 * DAY), at(-1 * DAY + HOUR), [
    { result: 'PASS' },
    { result: 'PASS' },
    { result: 'FAIL', notes: 'Small puddle under the mast cylinder.' },
    { result: 'NA' },
  ]);
  addInspection('insp_1043', 1043, 'hvac', at(-2 * DAY), null, null);
  // Seeded at exactly the times the generation job computes, so its first run adds no near-duplicates.
  addInspection('insp_1044', 1044, 'fl3', scheduleDue('fl3'), null, null);
  addInspection('insp_1045', 1045, 'fire_hq', scheduleDue('fire_hq'), null, null);

  const fire = template('fire');
  const forklift = template('forklift');
  const liveIssue = (key: string, number: number, inspection: string, position: number, prompt: string, notes: string, severity: Severity, status: 'OPEN' | 'IN_WORK', created: Date, asset: string) =>
    issues.push({
      id: id(key),
      organizationId: orgId,
      number,
      inspectionResponseId: id(`${inspection}_r${position + 1}`),
      inspectionId: id(inspection),
      assetId: id(`ast_${asset}`),
      title: prompt,
      notes,
      severity,
      status,
      createdAt: created,
    });
  liveIssue('iss_302', 302, 'insp_1041', 2, fire.items[2].prompt, 'Exit sign above door B2 is dark — likely a failed LED driver.', 'HIGH', 'IN_WORK', at(-3 * DAY + 2 * HOUR), 'ext2');
  liveIssue('iss_303', 303, 'insp_1041', 3, fire.items[3].prompt, 'Pallets stacked in front of the extinguisher cabinet.', 'LOW', 'OPEN', at(-3 * DAY + 2 * HOUR), 'ext2');
  liveIssue('iss_304', 304, 'insp_1042', 2, forklift.items[2].prompt, 'Small puddle under the mast cylinder.', 'HIGH', 'IN_WORK', at(-1 * DAY + HOUR), 'fl3');

  workOrders.push(
    { id: id('wo_102'), organizationId: orgId, number: 102, issueId: id('iss_302'), assigneeId: id('user_tech'), status: 'COMPLETED', dueAt: at(2 * DAY), createdAt: at(-2 * DAY) },
    { id: id('wo_103'), organizationId: orgId, number: 103, issueId: id('iss_304'), assigneeId: id('user_tech'), status: 'OPEN', dueAt: at(1 * DAY), createdAt: at(-20 * HOUR) },
  );

  const event = (offset: number, actor: string | null, entityType: string, entity: string, action: string, message: string) =>
    audit.push({
      organizationId: orgId,
      actorId: actor ? id(`user_${actor}`) : null,
      entityType,
      entityId: id(entity),
      action,
      message,
      createdAt: at(offset),
    });
  event(-3 * DAY + 2 * HOUR, 'inspector', 'inspection', 'insp_1041', 'SUBMITTED', 'submitted INS-1041 (2 items failed)');
  event(-3 * DAY + 2 * HOUR, 'inspector', 'issue', 'iss_302', 'CREATED', 'ISS-302 created (Fire Safety Check, item 3 failed)');
  event(-3 * DAY + 2 * HOUR, 'inspector', 'issue', 'iss_303', 'CREATED', 'ISS-303 created (Fire Safety Check, item 4 failed)');
  event(-2 * DAY, 'admin', 'work_order', 'wo_102', 'CREATED', 'created WO-102 from ISS-302');
  event(-2 * DAY, 'admin', 'work_order', 'wo_102', 'ASSIGNED', 'assigned WO-102 to Ahmed Nasser');
  event(-2 * DAY + 3 * HOUR, 'tech', 'work_order', 'wo_102', 'IN_PROGRESS', 'moved WO-102 to IN_PROGRESS');
  event(-1 * DAY + HOUR, 'inspector', 'inspection', 'insp_1042', 'SUBMITTED', 'submitted INS-1042 (1 item failed)');
  event(-1 * DAY + HOUR, 'inspector', 'issue', 'iss_304', 'CREATED', 'ISS-304 created (Forklift Pre-Shift Check, item 3 failed)');
  event(-1 * DAY + 5 * HOUR, 'tech', 'work_order', 'wo_102', 'COMPLETED', 'moved WO-102 to COMPLETED');
  event(-20 * HOUR, 'admin', 'work_order', 'wo_103', 'CREATED', 'created WO-103 from ISS-304');
  event(-20 * HOUR, 'admin', 'work_order', 'wo_103', 'ASSIGNED', 'assigned WO-103 to Ahmed Nasser');

  await prisma.$transaction(
    async (tx) => {
      await tx.organization.create({
        data: { id: orgId, name: DEMO_ORG_NAME, inspectionSeq: 1045, issueSeq: 304, workOrderSeq: 103 },
      });
      await tx.user.createMany({ data: users.map((u) => ({ id: id(`user_${u.key}`), name: u.name, email: u.email })) });
      await tx.membership.createMany({
        data: users.map((u, i) => ({ organizationId: orgId, userId: id(`user_${u.key}`), role: u.role, createdAt: at(-365 * DAY + i * 1000) })),
      });
      await tx.site.createMany({
        data: sites.map((s) => ({ id: id(`site_${s.key}`), organizationId: orgId, name: s.name, address: s.address, timezone: s.timezone })),
      });
      await tx.asset.createMany({
        data: assets.map((a) => ({
          id: id(`ast_${a.key}`),
          organizationId: orgId,
          siteId: id(`site_${a.site}`),
          name: a.name,
          category: a.category,
          serial: a.serial,
          location: a.location,
          status: a.status,
        })),
      });
      await tx.inspectionTemplate.createMany({
        data: TEMPLATES.map((t) => ({ id: id(`tpl_${t.key}`), organizationId: orgId, name: t.name, description: t.description })),
      });
      await tx.templateItem.createMany({
        data: TEMPLATES.flatMap((t) =>
          t.items.map((item, position) => ({
            organizationId: orgId,
            templateId: id(`tpl_${t.key}`),
            position,
            prompt: item.prompt,
            defaultSeverity: item.severity,
          })),
        ),
      });
      await tx.inspectionSchedule.createMany({
        data: schedules.map((s, i) => ({
          id: id(`sch_${s.key}`),
          organizationId: orgId,
          templateId: id(`tpl_${s.template}`),
          assetId: id(`ast_${s.asset}`),
          frequency: s.frequency,
          timeOfDay: s.time,
          assigneeId: id('user_inspector'),
          createdAt: at(-HISTORY_DAYS * DAY - DAY + i * 1000),
        })),
      });
      await tx.inspection.createMany({ data: inspections });
      await tx.inspectionResponse.createMany({ data: responses });
      await tx.issue.createMany({ data: issues });
      await tx.workOrder.createMany({ data: workOrders });
      await tx.auditEvent.createMany({ data: audit });

      // A second, small organization: switch to its admin to see that nothing above is visible.
      const harborId = randomUUID();
      const noorId = randomUUID();
      await tx.organization.create({ data: { id: harborId, name: 'Harbor Labs' } });
      await tx.user.create({ data: { id: noorId, name: 'Noor Salem', email: 'noor@harborlabs.test' } });
      await tx.membership.create({ data: { organizationId: harborId, userId: noorId, role: 'ADMIN' } });
      const harborSite = randomUUID();
      await tx.site.create({ data: { id: harborSite, organizationId: harborId, name: 'Pier 9 Lab', address: 'Pier 9, San Francisco', timezone: 'America/Los_Angeles' } });
      await tx.asset.create({
        data: { organizationId: harborId, siteId: harborSite, name: 'Fume Hood 2', category: 'Lab Safety', serial: 'FH-7710', location: 'Wet lab', status: 'ACTIVE' },
      });
    },
    { timeout: 60_000 },
  );

  return true;
}
