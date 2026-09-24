'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useState, type FormEvent } from 'react';
import { RequireRole } from '@/components/app-shell';
import { IssueStatusBadge, SeverityBadge } from '@/components/badges';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  RecordCode,
  Select,
  Sub,
  Table,
  Td,
  TextLink,
  attempt,
} from '@/components/ui';
import { code, humanize, relativeTime } from '@/lib/format';
import { can } from '@inspectra/shared';
import { useLookup, useStore } from '@/lib/store';
import type { IssueStatus, Severity } from '@/lib/types';

const STATUSES: IssueStatus[] = ['OPEN', 'IN_WORK', 'RESOLVED'];
type IssueFilter = IssueStatus | 'UNRESOLVED' | '';
const SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function inDays(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export default function IssuesPage() {
  const { db, role } = useStore();
  const lookup = useLookup();
  const [status, setStatus] = useState<IssueFilter>('UNRESOLVED');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const rows = db.issues
    .filter((i) => (status === '' || (status === 'UNRESOLVED' ? i.status !== 'RESOLVED' : i.status === status)) && (!severity || i.severity === severity))
    .sort(
      (a, b) =>
        STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.createdAt.localeCompare(a.createdAt),
    );

  return (
    <RequireRole roles={['ADMIN', 'INSPECTOR']}>
      <PageHeader crumb="Operations"
        title="Issues"
        description="Every failed checklist item opens an issue. Turn open issues into work orders to get them fixed."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as IssueFilter)}>
          <option value="UNRESOLVED">Not resolved</option>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Select className="w-auto" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | '')}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState>No issues match these filters.</EmptyState>
        ) : (
          <Table head={['Issue', 'Asset', 'Severity', 'Status', 'Work order', '']}>
            {rows.map((issue) => {
              const workOrder = db.workOrders
                .filter((w) => w.issueId === issue.id)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
              const inspection = db.inspections.find((i) => i.id === issue.inspectionId);
              return (
                <Fragment key={issue.id}>
                  <tr className="hover:bg-slate-50">
                    <Td className="max-w-md">
                      <p className="font-medium">
                        <RecordCode className="mr-1.5">{code.issue(issue.number)}</RecordCode>
                        {issue.title}
                      </p>
                      {issue.notes && <p className="mt-0.5 text-slate-600">{issue.notes}</p>}
                      <Sub>
                        Found in{' '}
                        <Link href={`/inspections/${issue.inspectionId}`} className="underline underline-offset-2">
                          {inspection && code.inspection(inspection.number)}
                        </Link>{' '}
                        {relativeTime(issue.createdAt)}
                      </Sub>
                    </Td>
                    <Td>
                      <Link href={`/assets/${issue.assetId}`} className="hover:underline">
                        {lookup.asset(issue.assetId)?.name}
                      </Link>
                    </Td>
                    <Td>
                      <SeverityBadge severity={issue.severity} />
                    </Td>
                    <Td>
                      <IssueStatusBadge status={issue.status} />
                    </Td>
                    <Td>
                      {workOrder ? (
                        <TextLink href={`/work-orders/${workOrder.id}`}>
                          <RecordCode>{code.workOrder(workOrder.number)}</RecordCode>
                        </TextLink>
                      ) : (
                        <span className="text-xs text-slate-500">None yet</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      {issue.status === 'OPEN' && can(role, 'assign:work_orders') && assigningId !== issue.id && (
                        <Button variant="secondary" onClick={() => setAssigningId(issue.id)}>
                          Create work order
                        </Button>
                      )}
                    </Td>
                  </tr>
                  {assigningId === issue.id && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50 px-5 py-4 shadow-[inset_4px_0_0_var(--color-info)]">
                        <CreateWorkOrderForm issueId={issue.id} onCancel={() => setAssigningId(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </Table>
        )}
      </Card>
    </RequireRole>
  );
}

function CreateWorkOrderForm({ issueId, onCancel }: { issueId: string; onCancel: () => void }) {
  const { actions } = useStore();
  const lookup = useLookup();
  const router = useRouter();
  const technicians = lookup.usersWithRole('TECHNICIAN');
  const [assigneeId, setAssigneeId] = useState(technicians[0]?.id ?? '');
  const [dueDate, setDueDate] = useState(inDays(3));
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    let id = '';
    const ok = await attempt(async () => {
      id = await actions.createWorkOrder(issueId, assigneeId, new Date(`${dueDate}T17:00:00`).toISOString());
    }, setError);
    if (ok) router.push(`/work-orders/${id}`);
  };

  if (technicians.length === 0) {
    return <p className="text-sm text-slate-600">Invite a technician first (Members page).</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <Field label="Assign to">
        <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Due date">
        <Input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <Button type="submit">Create & assign</Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <div className="w-full">
        <ErrorNote message={error} />
      </div>
    </form>
  );
}
