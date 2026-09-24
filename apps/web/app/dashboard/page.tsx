'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, ChartBar, Table as TableIcon } from '@phosphor-icons/react/dist/ssr';
import { ActivityTimeline } from '@/components/activity';
import { InspectionStatusBadge, workOrderLabel } from '@/components/badges';
import { ActivityChart, ActivityTable, bucketByDay } from '@/components/charts/activity-chart';
import { BarList, DayStrip, type BarListRow, type DayTile } from '@/components/charts/bar-list';
import { Card, CardHeader, EmptyState, IconButton, PageHeader, PeriodTabs, Swatch, Tooltip, cx, iconBoxClass } from '@/components/ui';
import { WorkOrderTag } from '@/components/work-order-tag';
import { humanize, isDueToday, isOverdue } from '@/lib/format';
import { useLookup, useStore } from '@/lib/store';
import type { Severity, WorkOrderStatus } from '@/lib/types';

type Period = '7' | '30' | '90';
const PERIODS: { value: Period; label: string }[] = [
  { value: '7', label: 'Week' },
  { value: '30', label: 'Month' },
  { value: '90', label: 'Quarter' },
];

const DAY = 86_400_000;
const dueFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

export default function DashboardPage() {
  const { db, me, role } = useStore();
  const lookup = useLookup();
  const [period, setPeriod] = useState<Period>('90');
  const [asTable, setAsTable] = useState(false);
  const now = new Date();

  const visibleInspections = role === 'INSPECTOR' ? db.inspections.filter((i) => i.assigneeId === me.id) : db.inspections;
  const buckets = useMemo(() => bucketByDay(visibleInspections, Number(period)), [visibleInspections, period]);
  const completed = buckets.reduce((s, b) => s + b.total, 0);
  const clean = buckets.reduce((s, b) => s + b.clean, 0);

  const dueToday = visibleInspections.filter((i) => isDueToday(i)).length;
  const overdue = visibleInspections.filter((i) => isOverdue(i)).length;
  const openIssues = db.issues.filter((i) => i.status !== 'RESOLVED');
  const myWorkOrders = db.workOrders
    .filter((w) => w.assigneeId === me.id && w.status !== 'VERIFIED' && w.status !== 'CANCELLED')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const scopedWorkOrders = role === 'TECHNICIAN' ? myWorkOrders : db.workOrders;

  const week: DayTile[] = Array.from({ length: 7 }, (_, k) => {
    const day = new Date(now.getTime() + k * DAY);
    const count = visibleInspections.filter(
      (i) => i.status === 'PENDING' && new Date(i.dueAt).toDateString() === day.toDateString(),
    ).length;
    return { key: String(k), weekday: k === 0 ? 'Today' : weekdayFmt.format(day), day: day.getDate(), count, today: k === 0 };
  });

  const severities: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const worstOpen = severities.find((s) => openIssues.some((i) => i.severity === s));
  const issuesBySeverity: BarListRow[] = severities.map((s) => ({
    key: s,
    label: humanize(s),
    value: openIssues.filter((i) => i.severity === s).length,
    highlight: s === worstOpen,
  }));

  const statuses: WorkOrderStatus[] = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'];
  const workOrdersByStatus: BarListRow[] = statuses.map((s) => ({
    key: s,
    label: s === 'COMPLETED' ? 'Awaiting check' : workOrderLabel[s],
    value: scopedWorkOrders.filter((w) => w.status === s).length,
    highlight: s === 'COMPLETED',
  }));

  const upcoming = visibleInspections
    .filter((i) => i.status === 'PENDING')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 6);
  const nextForMe = role === 'INSPECTOR' ? upcoming[0] : undefined;

  const periodStart = now.getTime() - Number(period) * DAY;
  const failedItems = visibleInspections
    .filter((i) => i.submittedAt && Date.parse(i.submittedAt) >= periodStart)
    .reduce((s, i) => s + i.responses.filter((r) => r.result === 'FAIL').length, 0);

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const attention: { text: string; href: string }[] = (
    role === 'TECHNICIAN'
      ? [
          { n: myWorkOrders.filter((w) => w.status === 'OPEN').length, one: 'work order not started', many: 'work orders not started', href: '/work-orders' },
          { n: myWorkOrders.filter((w) => new Date(w.dueAt) < now).length, one: 'work order past due', many: 'work orders past due', href: '/work-orders' },
        ]
      : [
          { n: overdue, one: 'overdue inspection', many: 'overdue inspections', href: '/inspections?tab=overdue' },
          { n: db.issues.filter((i) => i.status === 'OPEN').length, one: 'issue without a work order', many: 'issues without a work order', href: '/issues' },
          { n: workOrdersByStatus[3].value, one: 'fix awaiting verification', many: 'fixes awaiting verification', href: '/work-orders?status=COMPLETED' },
        ]
  )
    .filter((a) => a.n > 0)
    .map((a) => ({ text: plural(a.n, a.one, a.many), href: a.href }));

  const primary =
    role === 'ADMIN'
      ? { label: 'Review open issues', href: '/issues' }
      : role === 'INSPECTOR'
        ? nextForMe && { label: 'Start next inspection', href: `/inspections/${nextForMe.id}` }
        : { label: 'Open my work orders', href: '/work-orders' };

  return (
    <>
      <PageHeader
        title="Overview"
        crumb="Operations"
        description={<AttentionLine items={attention} />}
        actions={
          primary && (
            <Link href={primary.href} className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700">
              {primary.label}
            </Link>
          )
        }
      />

      {role !== 'TECHNICIAN' && (
        <Card className="px-5 pt-4 pb-5 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="eyebrow">Inspection activity</h2>
            <IconButton label={asTable ? 'Show chart' : 'Show as table'} onClick={() => setAsTable((v) => !v)} className="size-8 rounded-lg">
              {asTable ? <ChartBar size={16} aria-hidden /> : <TableIcon size={16} aria-hidden />}
            </IconButton>
          </div>

          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
            <div>
              <p className="text-5xl leading-none font-medium tracking-tight sm:text-6xl">{completed.toLocaleString('en-GB')}</p>
              <p className="mt-2 text-sm text-slate-500">Inspections completed in the last {Number(period)} days</p>
            </div>
            <dl className="grid grid-cols-3 gap-x-8 gap-y-1">
              <HeroStat label="Passed first time" value={completed ? `${Math.round((clean / completed) * 100)}%` : 'None yet'} />
              <HeroStat label="Failed items caught" value={failedItems.toLocaleString('en-GB')} />
              <HeroStat label="Completed per day" value={(completed / Number(period)).toFixed(1)} />
            </dl>
          </div>

          <div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-3">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legend">
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full bg-slate-300" /> All items passed
              </li>
              <li className="flex items-center gap-1.5">
                <Swatch tone="danger" /> With failed items
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-3 rounded-full bg-slate-900" /> 7-day average
              </li>
            </ul>
            <PeriodTabs label="Time period" options={PERIODS} value={period} onChange={setPeriod} />
          </div>

          {asTable ? <ActivityTable buckets={buckets} /> : <ActivityChart buckets={buckets} />}
        </Card>
      )}

      <div className={cx('grid gap-4 md:grid-cols-2 lg:grid-cols-3', role !== 'TECHNICIAN' && 'mt-4')}>
        {role !== 'TECHNICIAN' && (
          <Widget title="Inspections due" href="/inspections" linkLabel="Open inspections">
            <Figure value={dueToday} label="Due later today" aside={<OverdueNote count={overdue} />} />
            <DayStrip days={week} />
          </Widget>
        )}
        {role !== 'TECHNICIAN' && (
          <Widget title="Open issues" href="/issues" linkLabel="Open issues">
            <Figure value={openIssues.length} label="Not yet resolved" />
            <BarList rows={issuesBySeverity} label="Open issues by severity" />
          </Widget>
        )}
        <Widget title={role === 'TECHNICIAN' ? 'Your work orders' : 'Work orders'} href="/work-orders" linkLabel="Open work orders">
          {role === 'TECHNICIAN' ? (
            <Figure value={myWorkOrders.length} label="Assigned to you and still open" />
          ) : (
            <Figure value={workOrdersByStatus[3].value} label="Awaiting verification" />
          )}
          <BarList rows={workOrdersByStatus} label="Work orders by status" />
        </Widget>
      </div>

      {role === 'TECHNICIAN' && (
        <section className="mt-8">
          <h2 className="eyebrow">Assigned to you</h2>
          {myWorkOrders.length === 0 ? (
            <Card className="mt-3">
              <EmptyState>Nothing is assigned to you. New work orders appear here as soon as an admin assigns them.</EmptyState>
            </Card>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {myWorkOrders.map((wo) => (
                <WorkOrderTag key={wo.id} workOrder={wo} />
              ))}
            </div>
          )}
        </section>
      )}

      {role !== 'TECHNICIAN' && (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title={role === 'INSPECTOR' ? 'Your next inspections' : 'Next inspections'}
              actions={<WidgetLink href="/inspections" label="Open inspections" />}
            />
            {upcoming.length === 0 ? (
              <EmptyState>Nothing is scheduled. New inspections appear here when schedules create them.</EmptyState>
            ) : (
              <ul className="px-2 pb-2">
                {upcoming.map((inspection) => {
                  const due = new Date(inspection.dueAt);
                  const today = due.toDateString() === now.toDateString();
                  return (
                    <li key={inspection.id}>
                      <Link
                        href={`/inspections/${inspection.id}`}
                        className="grid grid-cols-[5.75rem_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50"
                      >
                        <span className="leading-tight">
                          <span className="block text-sm font-semibold">{today ? 'Today' : dueFmt.format(due)}</span>
                          <span className="text-xs text-slate-500 tabular">{timeFmt.format(due)}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{inspection.templateName}</span>
                          <span className="block truncate text-xs text-slate-500">{lookup.asset(inspection.assetId)?.name}</span>
                        </span>
                        <InspectionStatusBadge inspection={inspection} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {role === 'ADMIN' ? (
            <Card>
              <CardHeader title="Logbook" />
              <ActivityTimeline events={db.auditEvents.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8)} />
            </Card>
          ) : (
            <Card>
              <CardHeader title="Waiting for your verification" actions={<WidgetLink href="/work-orders?status=COMPLETED" label="Open work orders" />} />
              {db.workOrders.filter((w) => w.status === 'COMPLETED').length === 0 ? (
                <EmptyState>No completed work is waiting to be checked.</EmptyState>
              ) : (
                <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
                  {db.workOrders
                    .filter((w) => w.status === 'COMPLETED')
                    .map((wo) => (
                      <WorkOrderTag key={wo.id} workOrder={wo} />
                    ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function AttentionLine({ items }: { items: { text: string; href: string }[] }) {
  if (items.length === 0) return <p>Nothing needs attention right now.</p>;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="mr-1">Needs attention</span>
      {items.map((item) => (
        <Link
          key={item.href + item.text}
          href={item.href}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-900 transition-colors hover:border-slate-900"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-danger" />
          {item.text}
        </Link>
      ))}
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-xl font-medium tracking-tight">{value}</dd>
    </div>
  );
}

function Widget({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col px-5 pt-4 pb-5">
      <div className="flex items-center justify-between">
        <h2 className="eyebrow">{title}</h2>
        <WidgetLink href={href} label={linkLabel} />
      </div>
      {children}
    </Card>
  );
}

function WidgetLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} className={cx('group relative size-8 rounded-lg', iconBoxClass())}>
      <ArrowUpRight size={14} aria-hidden />
      <Tooltip>{label}</Tooltip>
    </Link>
  );
}

function Figure({ value, label, aside }: { value: number; label: string; aside?: ReactNode }) {
  return (
    <div className="mt-3 flex items-end justify-between gap-3">
      <div>
        <p className="text-3xl font-medium tracking-tight">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      {aside}
    </div>
  );
}

function OverdueNote({ count }: { count: number }) {
  if (count === 0) return <p className="text-xs text-slate-500">Nothing overdue</p>;
  return (
    <Link href="/inspections?tab=overdue" className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 hover:underline">
      <Swatch tone="danger" />
      {count} overdue
    </Link>
  );
}
