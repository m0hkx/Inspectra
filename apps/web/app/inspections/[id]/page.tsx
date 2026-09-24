'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { InspectionStatusBadge, IssueStatusBadge, SeverityBadge } from '@/components/badges';
import { BackLink, Button, Card, ErrorNote, RecordCode, Select, Textarea, attempt, cx } from '@/components/ui';
import { code, formatDateTime, humanize } from '@/lib/format';
import { useLookup, useStore, type ResponseInput } from '@/lib/store';
import type { ResponseResult, Severity } from '@/lib/types';

const RESULTS: { value: ResponseResult; label: string; selected: string }[] = [
  { value: 'PASS', label: 'Pass', selected: 'bg-safe text-white' },
  { value: 'FAIL', label: 'Fail', selected: 'bg-danger text-white' },
  { value: 'NA', label: 'N/A', selected: 'bg-slate-600 text-white' },
];

const SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function InspectionPage() {
  const { id } = useParams<{ id: string }>();
  const { db, me, role, actions } = useStore();
  const lookup = useLookup();
  const inspection = db.inspections.find((i) => i.id === id);

  const [draft, setDraft] = useState<ResponseInput[]>(() =>
    (inspection?.responses ?? []).map(({ id, result, notes, severity }) => ({ id, result, notes, severity })),
  );
  const [error, setError] = useState<string | null>(null);

  if (!inspection) {
    return (
      <Card className="p-8">
        <p className="text-xl font-light">This inspection doesn&apos;t exist.</p>
        <p className="mt-1 text-sm text-slate-500">
          Go back to <Link href="/inspections" className="underline">inspections</Link>.
        </p>
      </Card>
    );
  }

  const asset = lookup.asset(inspection.assetId);
  const site = asset && lookup.site(asset.siteId);
  const assignee = lookup.user(inspection.assigneeId);
  const canPerform = role === 'INSPECTOR' && inspection.assigneeId === me.id && inspection.status === 'PENDING';
  const answered = draft.filter((r) => r.result !== null).length;
  const failures = draft.filter((r) => r.result === 'FAIL').length;
  const issues = db.issues.filter((i) => i.inspectionId === inspection.id);

  const update = (responseId: string, patch: Partial<ResponseInput>) =>
    setDraft((rows) => rows.map((r) => (r.id === responseId ? { ...r, ...patch } : r)));

  const submit = () => {
    if (failures > 0 && !confirm(`Submit with ${failures} failed item${failures === 1 ? '' : 's'}? Each one opens an issue.`)) return;
    attempt(() => actions.submitInspection(inspection.id, draft), setError);
  };

  return (
    <div className="mx-auto max-w-2xl pb-32">
      <BackLink href="/inspections">All inspections</BackLink>

      <Card className="mt-4">
        <div className="px-5 pt-4 pb-5 sm:px-7">
          <div className="flex items-center gap-3">
            <RecordCode className="text-sm text-slate-500">{code.inspection(inspection.number)}</RecordCode>
            <InspectionStatusBadge inspection={inspection} />
          </div>
          <h1 className="mt-1 text-[2rem] leading-tight font-light tracking-tight">{inspection.templateName}</h1>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-100 pt-4 text-sm">
            <div>
              <dt className="text-xs font-semibold text-slate-500">Asset</dt>
              <dd className="mt-0.5">
                {asset?.name}
                <span className="block text-xs text-slate-500">{asset?.location}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Due</dt>
              <dd className="mt-0.5 tabular">
                {formatDateTime(inspection.dueAt, site?.timezone)}
                <span className="block text-xs text-slate-500">
                  {site?.name}, {site?.timezone} time
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </Card>

      {!canPerform && inspection.status === 'PENDING' && (
        <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-700">
          You&apos;re viewing this checklist. Only {assignee?.name} can fill it in.
        </p>
      )}

      <ol className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
        {inspection.responses.map((response, index) => {
          const current = draft.find((r) => r.id === response.id)!;
          const shown = canPerform ? current : response;
          const failed = shown.result === 'FAIL';
          return (
            <li
              key={response.id}
              className={cx('px-4 py-4 sm:px-5', failed && 'shadow-[inset_4px_0_0_var(--color-danger)] bg-danger-soft/40')}
            >
              <p className="flex gap-3 text-base leading-snug font-medium">
                <span className="w-5 shrink-0 text-lg leading-tight font-semibold text-slate-400 tabular">
                  {index + 1}
                </span>
                {response.itemPrompt}
              </p>

              <div
                role="radiogroup"
                aria-label={`Result for item ${index + 1}`}
                className="mt-3 ml-8 grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200"
              >
                {RESULTS.map((option, i) => {
                  const selected = shown.result === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!canPerform}
                      onClick={() => update(response.id, { result: option.value })}
                      className={cx(
                        'py-3 text-sm font-semibold transition-colors',
                        i > 0 && 'border-l border-slate-200',
                        selected
                          ? option.selected
                          : 'bg-white text-slate-700 enabled:hover:bg-slate-50 disabled:text-slate-400',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {failed &&
                (canPerform ? (
                  <div className="mt-3 ml-8 space-y-2">
                    <Textarea
                      rows={2}
                      aria-label={`What's wrong with item ${index + 1}`}
                      placeholder="What's wrong? The technician will read this."
                      value={current.notes}
                      onChange={(e) => update(response.id, { notes: e.target.value })}
                    />
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      How serious is it?
                      <Select
                        className="w-auto"
                        value={current.severity}
                        onChange={(e) => update(response.id, { severity: e.target.value as Severity })}
                      >
                        {SEVERITIES.map((s) => (
                          <option key={s} value={s}>
                            {humanize(s)}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                ) : (
                  <div className="mt-3 ml-8 space-y-1 text-sm">
                    <SeverityBadge severity={response.severity} />
                    <p className="text-slate-700">{response.notes || 'No notes were added.'}</p>
                  </div>
                ))}
            </li>
          );
        })}
      </ol>

      {issues.length > 0 && (
        <section className="mt-8">
          <h2 className="eyebrow">Issues opened from this inspection</h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white">
            {issues.map((issue) => {
              const workOrder = db.workOrders.find((w) => w.issueId === issue.id);
              return (
                <li key={issue.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <RecordCode>{code.issue(issue.number)}</RecordCode> {issue.title}
                    {workOrder && (
                      <Link href={`/work-orders/${workOrder.id}`} className="mt-0.5 block text-xs underline underline-offset-2">
                        Being fixed under {code.workOrder(workOrder.number)}
                      </Link>
                    )}
                  </span>
                  <IssueStatusBadge status={issue.status} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {inspection.submittedAt && (
        <p className="mt-6 text-sm text-slate-500">
          Submitted by {assignee?.name} on {formatDateTime(inspection.submittedAt)}.
        </p>
      )}

      {canPerform && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-2xl space-y-2">
            <ErrorNote message={error} />
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <p className="text-lg leading-none font-semibold tabular">
                  {answered} of {draft.length} checked
                </p>
                {failures > 0 && <p className="mt-1 text-danger">{failures} failed, each opens an issue</p>}
              </div>
              <Button onClick={submit} disabled={answered < draft.length} className="px-6 py-3">
                Submit inspection
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
