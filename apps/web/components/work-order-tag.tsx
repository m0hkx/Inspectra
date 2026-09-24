'use client';

import Link from 'next/link';
import { code, formatDate, relativeTime } from '@/lib/format';
import { useLookup } from '@/lib/store';
import type { WorkOrder } from '@/lib/types';
import { SeverityBadge, WorkOrderStatusBadge, workOrderTone } from './badges';
import { RecordCode, toneColor } from './ui';

export function WorkOrderTag({ workOrder }: { workOrder: WorkOrder }) {
  const lookup = useLookup();
  const issue = lookup.issue(workOrder.issueId)!;
  const asset = lookup.asset(issue.assetId);
  const open = workOrder.status !== 'VERIFIED' && workOrder.status !== 'CANCELLED';
  const late = open && new Date(workOrder.dueAt) < new Date();

  return (
    <Link
      href={`/work-orders/${workOrder.id}`}
      className="relative block rounded-2xl border border-t-[3px] border-slate-200/80 bg-white px-4 pt-5 pb-4 transition-colors hover:border-x-slate-400 hover:border-b-slate-400"
      style={{ borderTopColor: toneColor[workOrderTone[workOrder.status]] }}
    >
      {/* The punched eyelet of a maintenance tag. */}
      <span aria-hidden className="absolute top-2 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-slate-100 ring-1 ring-slate-300" />
      <div className="flex items-center justify-between gap-2">
        <RecordCode className="text-sm">{code.workOrder(workOrder.number)}</RecordCode>
        <WorkOrderStatusBadge status={workOrder.status} />
      </div>
      <p className="mt-2 text-[0.9375rem] leading-snug font-semibold">{issue.title}</p>
      <p className="mt-1 text-xs text-slate-500">{asset?.name}</p>
      <div className="mt-4 flex items-center justify-between gap-2 text-xs">
        <SeverityBadge severity={issue.severity} />
        <span className={late ? 'font-semibold text-danger' : 'text-slate-500'}>
          {open ? `Due ${relativeTime(workOrder.dueAt)}` : formatDate(workOrder.dueAt)}
        </span>
      </div>
      <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">{lookup.user(workOrder.assigneeId)?.name}</p>
    </Link>
  );
}
