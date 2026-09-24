'use client';

import { useLookup } from '@/lib/store';
import type { AuditEvent, WorkOrderStatus } from '@/lib/types';
import { workOrderLabel } from './badges';
import { EmptyState } from './ui';

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

// Stored messages keep the machine status ("to IN_PROGRESS"); show people the label instead.
const readable = (message: string) =>
  message.replace(/\b(OPEN|IN_PROGRESS|ON_HOLD|COMPLETED|VERIFIED|CANCELLED)\b/g, (s) => workOrderLabel[s as WorkOrderStatus]);

/** A maintenance logbook: date and time in the margin, the entry beside it, newest first. */
export function ActivityTimeline({ events }: { events: AuditEvent[] }) {
  const lookup = useLookup();
  const sorted = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (sorted.length === 0) return <EmptyState>No activity recorded yet.</EmptyState>;

  return (
    <ol className="divide-y divide-slate-200/70">
      {sorted.map((event, index) => {
        const at = new Date(event.createdAt);
        const day = dayFmt.format(at);
        const sameDayAsPrevious = index > 0 && dayFmt.format(new Date(sorted[index - 1].createdAt)) === day;
        // Messages that start with a verb read as "<actor> <message>"; others stand alone.
        const actor = /^[a-z]/.test(event.message) ? lookup.user(event.actorId)?.name ?? 'System' : null;
        return (
          <li key={event.id} className="grid grid-cols-[4.25rem_3rem_1fr] gap-x-2 px-5 py-2.5 text-sm">
            <span className="font-semibold text-slate-700 tabular">{sameDayAsPrevious ? '' : day}</span>
            <span className="text-slate-500 tabular">{timeFmt.format(at)}</span>
            <p className="text-slate-800">
              {actor && <span className="font-semibold">{actor} </span>}
              {readable(event.message)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
