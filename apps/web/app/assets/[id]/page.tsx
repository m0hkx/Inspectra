'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AssetForm } from '@/components/asset-form';
import { AssetStatusBadge, InspectionStatusBadge, IssueStatusBadge, SeverityBadge } from '@/components/badges';
import { BackLink, Button, Card, CardHeader, EmptyState, RecordCode, Sub, Table, Td, TextLink } from '@/components/ui';
import { code, formatDateTime, humanize } from '@/lib/format';
import { can } from '@inspectra/shared';
import { useLookup, useStore } from '@/lib/store';

export default function AssetPage() {
  const { id } = useParams<{ id: string }>();
  const { db, role } = useStore();
  const lookup = useLookup();
  const [editing, setEditing] = useState(false);
  const asset = db.assets.find((a) => a.id === id);

  if (!asset) {
    return (
      <Card className="p-8">
        <p className="text-xl font-light">This asset doesn&apos;t exist.</p>
        <p className="mt-1 text-sm text-slate-500">
          <BackLink href="/assets">Back to all assets</BackLink>
        </p>
      </Card>
    );
  }

  const site = lookup.site(asset.siteId);
  const inspections = db.inspections
    .filter((i) => i.assetId === asset.id)
    .sort((a, b) => b.dueAt.localeCompare(a.dueAt));
  const openIssues = db.issues.filter((i) => i.assetId === asset.id && i.status !== 'RESOLVED');
  const schedules = db.schedules.filter((s) => s.assetId === asset.id);
  const { id: assetId, ...input } = asset;

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/assets">All assets</BackLink>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[2.125rem] leading-tight font-light tracking-tight">{asset.name}</h1>
            <div className="mt-2">
              <AssetStatusBadge status={asset.status} />
            </div>
          </div>
          {can(role, 'manage:assets') && !editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit asset
            </Button>
          )}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 text-sm sm:grid-cols-4">
          {[
            ['Category', asset.category],
            ['Serial number', asset.serial || 'Not recorded'],
            ['Location', asset.location || 'Not recorded'],
            ['Site', site ? `${site.name} (${site.timezone})` : 'Unknown'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold text-slate-500">{label}</dt>
              <dd className="mt-0.5 tabular">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {editing && <AssetForm id={assetId} initial={input} onDone={() => setEditing(false)} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Open issues (${openIssues.length})`} />
          {openIssues.length === 0 ? (
            <EmptyState>Nothing is wrong with this asset right now.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-200/70">
              {openIssues.map((issue) => (
                <li key={issue.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0">
                    <RecordCode className="mr-1.5">{code.issue(issue.number)}</RecordCode>
                    {issue.title}
                  </span>
                  <span className="flex shrink-0 flex-col items-start gap-1">
                    <SeverityBadge severity={issue.severity} />
                    <IssueStatusBadge status={issue.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Schedules" />
          {schedules.length === 0 ? (
            <EmptyState>This asset isn&apos;t on any inspection schedule yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-200/70">
              {schedules.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-3 px-5 py-3 text-sm">
                  <span>{lookup.template(s.templateId)?.name}</span>
                  <span className="text-slate-500 tabular">
                    {s.active ? `${humanize(s.frequency)} at ${s.timeOfDay}` : 'Paused'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Inspection history" />
        {inspections.length === 0 ? (
          <EmptyState>No inspections yet.</EmptyState>
        ) : (
          <Table head={['Inspection', 'Due', 'Result', 'Status']}>
            {inspections.map((inspection) => {
              const failed = inspection.responses.filter((r) => r.result === 'FAIL').length;
              return (
                <tr key={inspection.id} className="hover:bg-slate-50">
                  <Td>
                    <TextLink href={`/inspections/${inspection.id}`}>
                      <RecordCode>{code.inspection(inspection.number)}</RecordCode>
                    </TextLink>
                    <Sub>{inspection.templateName}</Sub>
                  </Td>
                  <Td className="tabular">{formatDateTime(inspection.dueAt, site?.timezone)}</Td>
                  <Td>
                    {inspection.status === 'SUBMITTED' ? (
                      failed > 0 ? (
                        <span className="font-semibold text-danger">{failed} failed</span>
                      ) : (
                        <span className="text-safe">All passed</span>
                      )
                    ) : (
                      <span className="text-slate-500">Not done yet</span>
                    )}
                  </Td>
                  <Td>
                    <InspectionStatusBadge inspection={inspection} />
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
