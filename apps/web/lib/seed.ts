import type { AuditEvent, Db, Inspection, InspectionResponse, Template } from './types';

// Bumped whenever the seed's shape changes, so browsers holding old demo data re-seed.
export const SEED_VERSION = 2;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const DEMO_USERS = {
  admin: 'user_admin',
  inspector: 'user_inspector',
  technician: 'user_tech_ahmed',
  technician2: 'user_tech_lina',
} as const;

function responsesFrom(template: Template, prefix: string): InspectionResponse[] {
  return template.items.map((item, i) => ({
    id: `${prefix}_r${i + 1}`,
    itemPrompt: item.prompt,
    result: null,
    notes: '',
    severity: item.defaultSeverity,
  }));
}

/** A demo organization whose dates are relative to `now`, so the dashboard always has content. */
export function createSeed(now = new Date()): Db {
  const at = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();

  const fireSafety: Template = {
    id: 'tpl_fire',
    name: 'Fire Safety Check',
    description: 'Monthly walk-through of extinguishers, exits and alarms.',
    items: [
      { id: 'tpl_fire_1', prompt: 'Extinguisher pressure gauge in the green zone', defaultSeverity: 'HIGH' },
      { id: 'tpl_fire_2', prompt: 'Safety pin and tamper seal intact', defaultSeverity: 'MEDIUM' },
      { id: 'tpl_fire_3', prompt: 'Emergency exit signage illuminated', defaultSeverity: 'HIGH' },
      { id: 'tpl_fire_4', prompt: 'Path to extinguisher is unobstructed', defaultSeverity: 'LOW' },
    ],
  };
  const forklift: Template = {
    id: 'tpl_forklift',
    name: 'Forklift Pre-Shift Check',
    description: 'Daily check before the first shift operates the forklift.',
    items: [
      { id: 'tpl_fl_1', prompt: 'Brakes and parking brake hold', defaultSeverity: 'CRITICAL' },
      { id: 'tpl_fl_2', prompt: 'Horn and warning lights work', defaultSeverity: 'MEDIUM' },
      { id: 'tpl_fl_3', prompt: 'No hydraulic fluid leaks', defaultSeverity: 'HIGH' },
      { id: 'tpl_fl_4', prompt: 'Tyres free of cuts and bulges', defaultSeverity: 'MEDIUM' },
    ],
  };
  const hvac: Template = {
    id: 'tpl_hvac',
    name: 'HVAC Weekly Inspection',
    description: 'Filters, drainage and temperature output.',
    items: [
      { id: 'tpl_hvac_1', prompt: 'Air filter clean (not clogged)', defaultSeverity: 'MEDIUM' },
      { id: 'tpl_hvac_2', prompt: 'Condensate drain flowing freely', defaultSeverity: 'LOW' },
      { id: 'tpl_hvac_3', prompt: 'Supply air within 12–16 °C', defaultSeverity: 'HIGH' },
    ],
  };

  const submittedFire: Inspection = {
    id: 'insp_1',
    number: 1041,
    scheduleId: 'sch_fire',
    templateName: fireSafety.name,
    assetId: 'ast_ext_2',
    assigneeId: DEMO_USERS.inspector,
    dueAt: at(-3 * DAY),
    status: 'SUBMITTED',
    submittedAt: at(-3 * DAY + 2 * HOUR),
    responses: [
      { id: 'insp_1_r1', itemPrompt: fireSafety.items[0].prompt, result: 'PASS', notes: '', severity: 'HIGH' },
      { id: 'insp_1_r2', itemPrompt: fireSafety.items[1].prompt, result: 'PASS', notes: '', severity: 'MEDIUM' },
      {
        id: 'insp_1_r3',
        itemPrompt: fireSafety.items[2].prompt,
        result: 'FAIL',
        notes: 'Exit sign above door B2 is dark — likely a failed LED driver.',
        severity: 'HIGH',
      },
      {
        id: 'insp_1_r4',
        itemPrompt: fireSafety.items[3].prompt,
        result: 'FAIL',
        notes: 'Pallets stacked in front of the extinguisher cabinet.',
        severity: 'LOW',
      },
    ],
  };

  const submittedForklift: Inspection = {
    id: 'insp_2',
    number: 1042,
    scheduleId: 'sch_forklift',
    templateName: forklift.name,
    assetId: 'ast_forklift',
    assigneeId: DEMO_USERS.inspector,
    dueAt: at(-1 * DAY),
    status: 'SUBMITTED',
    submittedAt: at(-1 * DAY + HOUR),
    responses: [
      { id: 'insp_2_r1', itemPrompt: forklift.items[0].prompt, result: 'PASS', notes: '', severity: 'CRITICAL' },
      { id: 'insp_2_r2', itemPrompt: forklift.items[1].prompt, result: 'PASS', notes: '', severity: 'MEDIUM' },
      {
        id: 'insp_2_r3',
        itemPrompt: forklift.items[2].prompt,
        result: 'FAIL',
        notes: 'Small puddle under the mast cylinder.',
        severity: 'HIGH',
      },
      { id: 'insp_2_r4', itemPrompt: forklift.items[3].prompt, result: 'NA', notes: '', severity: 'MEDIUM' },
    ],
  };

  const audit = (
    id: string,
    offset: number,
    actorId: string | null,
    entityType: AuditEvent['entityType'],
    entityId: string,
    action: string,
    message: string,
  ): AuditEvent => ({ id, actorId, entityType, entityId, action, message, createdAt: at(offset) });

  const db: Db = {
    organization: { id: 'org_northwind', name: 'Northwind Facilities' },
    users: [
      { id: DEMO_USERS.admin, name: 'Mohammad Khalid', email: 'mohammad@northwind.test' },
      { id: DEMO_USERS.inspector, name: 'Sara Haddad', email: 'sara@northwind.test' },
      { id: DEMO_USERS.technician, name: 'Ahmed Nasser', email: 'ahmed@northwind.test' },
      { id: DEMO_USERS.technician2, name: 'Lina Farouk', email: 'lina@northwind.test' },
    ],
    memberships: [
      { userId: DEMO_USERS.admin, role: 'ADMIN' },
      { userId: DEMO_USERS.inspector, role: 'INSPECTOR' },
      { userId: DEMO_USERS.technician, role: 'TECHNICIAN' },
      { userId: DEMO_USERS.technician2, role: 'TECHNICIAN' },
    ],
    sites: [
      { id: 'site_hq', name: 'Head Office', address: '12 King Fahd Rd, Riyadh', timezone: 'Asia/Riyadh' },
      { id: 'site_wh', name: 'North Warehouse', address: 'Unit 4, Trafford Park, Manchester', timezone: 'Europe/London' },
    ],
    assets: [
      { id: 'ast_ext_1', siteId: 'site_hq', name: 'Fire Extinguisher A1', category: 'Fire Safety', serial: 'FE-20231', location: 'Floor 1, Lobby', status: 'ACTIVE' },
      { id: 'ast_ext_2', siteId: 'site_wh', name: 'Fire Extinguisher B2', category: 'Fire Safety', serial: 'FE-20488', location: 'Loading Bay, Door B2', status: 'ACTIVE' },
      { id: 'ast_forklift', siteId: 'site_wh', name: 'Forklift #3', category: 'Vehicles', serial: 'TY-8FGU25-3310', location: 'Aisle 7', status: 'ACTIVE' },
      { id: 'ast_forklift_2', siteId: 'site_wh', name: 'Forklift #5', category: 'Vehicles', serial: 'TY-8FGU25-4127', location: 'Aisle 2', status: 'ACTIVE' },
      { id: 'ast_hvac', siteId: 'site_hq', name: 'Rooftop HVAC Unit 1', category: 'HVAC', serial: 'CR-48TC-0092', location: 'Roof, East side', status: 'ACTIVE' },
      { id: 'ast_ups', siteId: 'site_hq', name: 'Server Room UPS', category: 'Electrical', serial: 'APC-SRT5K-7781', location: 'Floor 2, Server Room', status: 'OUT_OF_SERVICE' },
    ],
    templates: [fireSafety, forklift, hvac],
    schedules: [
      { id: 'sch_fire', templateId: 'tpl_fire', assetId: 'ast_ext_2', frequency: 'MONTHLY', timeOfDay: '09:00', assigneeId: DEMO_USERS.inspector, active: true },
      { id: 'sch_fire_hq', templateId: 'tpl_fire', assetId: 'ast_ext_1', frequency: 'MONTHLY', timeOfDay: '10:00', assigneeId: DEMO_USERS.inspector, active: true },
      { id: 'sch_forklift', templateId: 'tpl_forklift', assetId: 'ast_forklift', frequency: 'DAILY', timeOfDay: '07:00', assigneeId: DEMO_USERS.inspector, active: true },
      { id: 'sch_forklift_2', templateId: 'tpl_forklift', assetId: 'ast_forklift_2', frequency: 'DAILY', timeOfDay: '07:00', assigneeId: DEMO_USERS.inspector, active: true },
      { id: 'sch_hvac', templateId: 'tpl_hvac', assetId: 'ast_hvac', frequency: 'WEEKLY', timeOfDay: '08:30', assigneeId: DEMO_USERS.inspector, active: true },
    ],
    inspections: [
      submittedFire,
      submittedForklift,
      {
        id: 'insp_3',
        number: 1043,
        scheduleId: 'sch_hvac',
        templateName: hvac.name,
        assetId: 'ast_hvac',
        assigneeId: DEMO_USERS.inspector,
        dueAt: at(-2 * DAY),
        status: 'PENDING',
        submittedAt: null,
        responses: responsesFrom(hvac, 'insp_3'),
      },
      {
        id: 'insp_4',
        number: 1044,
        scheduleId: 'sch_forklift',
        templateName: forklift.name,
        assetId: 'ast_forklift',
        assigneeId: DEMO_USERS.inspector,
        dueAt: at(3 * HOUR),
        status: 'PENDING',
        submittedAt: null,
        responses: responsesFrom(forklift, 'insp_4'),
      },
      {
        id: 'insp_5',
        number: 1045,
        scheduleId: 'sch_fire_hq',
        templateName: fireSafety.name,
        assetId: 'ast_ext_1',
        assigneeId: DEMO_USERS.inspector,
        dueAt: at(4 * DAY),
        status: 'PENDING',
        submittedAt: null,
        responses: responsesFrom(fireSafety, 'insp_5'),
      },
    ],
    issues: [
      {
        id: 'iss_1', number: 302, inspectionId: 'insp_1', responseId: 'insp_1_r3', assetId: 'ast_ext_2',
        title: fireSafety.items[2].prompt, notes: submittedFire.responses[2].notes,
        severity: 'HIGH', status: 'IN_WORK', createdAt: at(-3 * DAY + 2 * HOUR),
      },
      {
        id: 'iss_2', number: 303, inspectionId: 'insp_1', responseId: 'insp_1_r4', assetId: 'ast_ext_2',
        title: fireSafety.items[3].prompt, notes: submittedFire.responses[3].notes,
        severity: 'LOW', status: 'OPEN', createdAt: at(-3 * DAY + 2 * HOUR),
      },
      {
        id: 'iss_3', number: 304, inspectionId: 'insp_2', responseId: 'insp_2_r3', assetId: 'ast_forklift',
        title: forklift.items[2].prompt, notes: submittedForklift.responses[2].notes,
        severity: 'HIGH', status: 'IN_WORK', createdAt: at(-1 * DAY + HOUR),
      },
    ],
    workOrders: [
      { id: 'wo_1', number: 102, issueId: 'iss_1', assigneeId: DEMO_USERS.technician, status: 'COMPLETED', dueAt: at(2 * DAY), createdAt: at(-2 * DAY) },
      { id: 'wo_2', number: 103, issueId: 'iss_3', assigneeId: DEMO_USERS.technician, status: 'OPEN', dueAt: at(1 * DAY), createdAt: at(-20 * HOUR) },
    ],
    auditEvents: [
      audit('ae_1', -3 * DAY + 2 * HOUR, DEMO_USERS.inspector, 'inspection', 'insp_1', 'SUBMITTED', 'submitted INS-1041 (2 items failed)'),
      audit('ae_2', -3 * DAY + 2 * HOUR, DEMO_USERS.inspector, 'issue', 'iss_1', 'CREATED', 'ISS-302 created (Fire Safety Check, item 3 failed)'),
      audit('ae_3', -3 * DAY + 2 * HOUR, DEMO_USERS.inspector, 'issue', 'iss_2', 'CREATED', 'ISS-303 created (Fire Safety Check, item 4 failed)'),
      audit('ae_4', -2 * DAY, DEMO_USERS.admin, 'work_order', 'wo_1', 'CREATED', 'created WO-102 from ISS-302'),
      audit('ae_5', -2 * DAY, DEMO_USERS.admin, 'work_order', 'wo_1', 'ASSIGNED', 'assigned WO-102 to Ahmed Nasser'),
      audit('ae_6', -2 * DAY + 3 * HOUR, DEMO_USERS.technician, 'work_order', 'wo_1', 'IN_PROGRESS', 'moved WO-102 to IN_PROGRESS'),
      audit('ae_7', -1 * DAY + 1 * HOUR, DEMO_USERS.inspector, 'inspection', 'insp_2', 'SUBMITTED', 'submitted INS-1042 (1 item failed)'),
      audit('ae_8', -1 * DAY + 1 * HOUR, DEMO_USERS.inspector, 'issue', 'iss_3', 'CREATED', 'ISS-304 created (Forklift Pre-Shift Check, item 3 failed)'),
      audit('ae_9', -1 * DAY + 5 * HOUR, DEMO_USERS.technician, 'work_order', 'wo_1', 'COMPLETED', 'moved WO-102 to COMPLETED'),
      audit('ae_10', -20 * HOUR, DEMO_USERS.admin, 'work_order', 'wo_2', 'CREATED', 'created WO-103 from ISS-304'),
      audit('ae_11', -20 * HOUR, DEMO_USERS.admin, 'work_order', 'wo_2', 'ASSIGNED', 'assigned WO-103 to Ahmed Nasser'),
    ],
    counters: { inspection: 1045, issue: 304, workOrder: 103 },
  };

  appendHistory(db, now, { fireSafety, forklift, hvac });
  return db;
}

/** Deterministic PRNG so every reset produces the same history. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HISTORY_DAYS = 120;

/**
 * Backfills ~4 months of submitted inspections so the dashboard charts show real
 * store data. Every historical FAIL gets its issue and a verified work order, keeping
 * the "one issue per failed item" invariant. History has no audit events so the
 * logbook stays focused on recent activity.
 */
function appendHistory(db: Db, now: Date, t: { fireSafety: Template; forklift: Template; hvac: Template }) {
  const rand = mulberry32(20260924);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const plan: { scheduleId: string; assetId: string; template: Template; day: Date; hour: number }[] = [];
  for (let k = HISTORY_DAYS; k >= 1; k--) {
    const day = new Date(startOfToday.getTime() - k * DAY);
    const weekday = day.getDay();
    const workday = weekday !== 0 && weekday !== 6;
    // The seeded "live" records already cover the most recent occurrences.
    if (workday && k >= 2) plan.push({ scheduleId: 'sch_forklift', assetId: 'ast_forklift', template: t.forklift, day, hour: 7 });
    if (workday) plan.push({ scheduleId: 'sch_forklift_2', assetId: 'ast_forklift_2', template: t.forklift, day, hour: 7 });
    if (weekday === 1 && k >= 3) plan.push({ scheduleId: 'sch_hvac', assetId: 'ast_hvac', template: t.hvac, day, hour: 8 });
    if (day.getDate() === 1 && k >= 4) {
      plan.push({ scheduleId: 'sch_fire', assetId: 'ast_ext_2', template: t.fireSafety, day, hour: 9 });
      plan.push({ scheduleId: 'sch_fire_hq', assetId: 'ast_ext_1', template: t.fireSafety, day, hour: 10 });
    }
  }

  const kept = plan.filter(() => rand() > 0.06);
  let inspectionNo = db.counters.inspection - db.inspections.length - kept.length;
  const failures: { inspectionId: string; response: InspectionResponse; assetId: string; submittedAt: Date }[] = [];

  const history: Inspection[] = kept.map((p, i) => {
    const id = `hist_insp_${i}`;
    const dueAt = new Date(p.day.getTime() + p.hour * HOUR);
    const submittedAt = new Date(dueAt.getTime() + (10 + Math.floor(rand() * 80)) * 60_000);
    const responses = p.template.items.map((item, j): InspectionResponse => {
      const roll = rand();
      const result = roll < 0.045 ? 'FAIL' : roll < 0.07 ? 'NA' : 'PASS';
      return {
        id: `${id}_r${j + 1}`,
        itemPrompt: item.prompt,
        result,
        notes: result === 'FAIL' ? 'Found during routine check; reported to maintenance.' : '',
        severity: item.defaultSeverity,
      };
    });
    for (const response of responses) {
      if (response.result === 'FAIL') failures.push({ inspectionId: id, response, assetId: p.assetId, submittedAt });
    }
    return {
      id,
      number: ++inspectionNo,
      scheduleId: p.scheduleId,
      templateName: p.template.name,
      assetId: p.assetId,
      assigneeId: DEMO_USERS.inspector,
      dueAt: dueAt.toISOString(),
      status: 'SUBMITTED',
      submittedAt: submittedAt.toISOString(),
      responses,
    };
  });

  let issueNo = db.counters.issue - db.issues.length - failures.length;
  let workOrderNo = db.counters.workOrder - db.workOrders.length - failures.length;
  const technicians = [DEMO_USERS.technician, DEMO_USERS.technician2];

  failures.forEach((f, i) => {
    const issueId = `hist_iss_${i}`;
    db.issues.unshift({
      id: issueId,
      number: ++issueNo,
      inspectionId: f.inspectionId,
      responseId: f.response.id,
      assetId: f.assetId,
      title: f.response.itemPrompt,
      notes: f.response.notes,
      severity: f.response.severity,
      status: 'RESOLVED',
      createdAt: f.submittedAt.toISOString(),
    });
    db.workOrders.unshift({
      id: `hist_wo_${i}`,
      number: ++workOrderNo,
      issueId,
      assigneeId: technicians[i % 2],
      status: 'VERIFIED',
      dueAt: new Date(f.submittedAt.getTime() + 3 * DAY).toISOString(),
      createdAt: new Date(f.submittedAt.getTime() + 2 * HOUR).toISOString(),
    });
  });

  db.inspections.unshift(...history);
}
