'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { allowedTransitions, type WorkOrderTransition } from '@inspectra/shared';
import { ActivityTimeline } from '@/components/activity';
import { IssueStatusBadge, SeverityBadge, WorkOrderStatusBadge } from '@/components/badges';
import { BackLink, Button, Card, CardHeader, ErrorNote, RecordCode, Textarea, attempt } from '@/components/ui';
import { code, formatDate, relativeTime } from '@/lib/format';
import { can } from '@/lib/permissions';
import { useLookup, useStore } from '@/lib/store';

export default function WorkOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { db, me, role, actions } = useStore();
  const lookup = useLookup();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const wo = db.workOrders.find((w) => w.id === id);
  // Technicians only see their own work orders; anything else looks like it doesn't exist.
  if (!wo || (!can(role, 'view:all_work_orders') && wo.assigneeId !== me.id)) {
    return (
      <Card className="p-8">
        <p className="text-xl font-light">This work order doesn&apos;t exist or isn&apos;t assigned to you.</p>
        <p className="mt-1 text-sm text-slate-500">
          Go back to <Link href="/work-orders" className="underline">work orders</Link>.
        </p>
      </Card>
    );
  }

  const issue = lookup.issue(wo.issueId)!;
  const asset = lookup.asset(issue.assetId);
  const site = asset && lookup.site(asset.siteId);
  const inspection = db.inspections.find((i) => i.id === issue.inspectionId);
  const transitions = allowedTransitions(wo.status, { userId: me.id, role }, wo.assigneeId);
  const closed = wo.status === 'VERIFIED' || wo.status === 'CANCELLED';
  const events = db.auditEvents.filter(
    (e) =>
      (e.entityType === 'work_order' && e.entityId === wo.id) ||
      (e.entityType === 'issue' && e.entityId === issue.id),
  );

  const run = (t: WorkOrderTransition) => {
    if (t.requiresReason && !rejecting) {
      setRejecting(true);
      return;
    }
    const ok = attempt(() => actions.transitionWorkOrder(wo.id, t.to, reason), setError);
    if (ok) {
      setRejecting(false);
      setReason('');
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href="/work-orders">All work orders</BackLink>

      <Card className="mt-4">
        <div className="px-6 pt-5 pb-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <RecordCode className="text-sm text-slate-500">{code.workOrder(wo.number)}</RecordCode>
            <WorkOrderStatusBadge status={wo.status} />
          </div>
          <h1 className="mt-2 max-w-[40ch] text-[2rem] leading-tight font-light tracking-tight">{issue.title}</h1>

          {issue.notes && (
            <blockquote className="mt-4 max-w-[62ch] rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {issue.notes}
              <footer className="mt-1 text-xs text-slate-500">
                Noted by {inspection ? lookup.user(inspection.assigneeId)?.name : 'the inspector'} during{' '}
                {inspection ? (
                  <Link href={`/inspections/${inspection.id}`} className="underline underline-offset-2">
                    {code.inspection(inspection.number)}
                  </Link>
                ) : (
                  'an inspection'
                )}
              </footer>
            </blockquote>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-4">
            <Fact label="Assigned to">{lookup.user(wo.assigneeId)?.name}</Fact>
            <Fact label="Due">
              {formatDate(wo.dueAt)}
              {!closed && (
                <span className={`block text-xs ${new Date(wo.dueAt) < new Date() ? 'font-semibold text-danger' : 'text-slate-500'}`}>
                  {relativeTime(wo.dueAt)}
                </span>
              )}
            </Fact>
            <Fact label="Asset">
              {asset ? (
                <Link href={`/assets/${asset.id}`} className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900">
                  {asset.name}
                </Link>
              ) : (
                'Unknown asset'
              )}
              <span className="block text-xs text-slate-500">{asset?.location}</span>
              <span className="block text-xs text-slate-500">{site?.name}</span>
            </Fact>
            <Fact label={`Issue ${code.issue(issue.number)}`}>
              <span className="flex flex-col gap-1">
                <SeverityBadge severity={issue.severity} />
                <IssueStatusBadge status={issue.status} />
              </span>
            </Fact>
          </dl>
        </div>
      </Card>

      <div className="mt-8 grid gap-6 lg:grid-cols-[20rem_1fr]">
        <Card className="h-fit">
          <CardHeader title="What you can do" />
          <div className="space-y-3 p-5">
            {transitions.length === 0 ? (
              <p className="text-sm text-slate-600">
                {closed
                  ? 'This work order is closed. Nothing else can change.'
                  : wo.status === 'COMPLETED'
                    ? 'Waiting for an inspector or admin to verify the fix.'
                    : `Only ${lookup.user(wo.assigneeId)?.name} can move this work forward right now.`}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {transitions.map((t) => (
                  <Button
                    key={`${t.from}-${t.to}`}
                    variant={t.to === 'CANCELLED' || t.requiresReason ? 'danger' : t.to === 'ON_HOLD' ? 'secondary' : 'primary'}
                    onClick={() => run(t)}
                    className="w-full py-2.5"
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            )}

            {rejecting && (
              <div className="space-y-2 rounded-xl bg-danger-soft p-3">
                <label htmlFor="reject-reason" className="block text-xs font-semibold text-slate-700">
                  What still needs fixing? The technician sees this.
                </label>
                <Textarea id="reject-reason" rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="danger" onClick={() => run(transitions.find((t) => t.requiresReason)!)}>
                    Send back to technician
                  </Button>
                  <Button variant="ghost" onClick={() => setRejecting(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            )}
            <ErrorNote message={error} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Logbook" />
          <ActivityTimeline events={events} />
        </Card>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-900">{children}</dd>
    </div>
  );
}
