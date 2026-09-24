'use client';

import Link from 'next/link';
import { use } from 'react';
import { RequireRole } from '@/components/app-shell';
import { InspectionStatusBadge } from '@/components/badges';
import { Card, EmptyState, PageHeader, RecordCode, Sub, Table, Td, TextLink, cx } from '@/components/ui';
import { code, formatDateTime, isOverdue, relativeTime } from '@/lib/format';
import { useLookup, useStore } from '@/lib/store';

const TABS = [
  { key: 'due', label: 'Due' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'submitted', label: 'Submitted' },
] as const;

type Tab = (typeof TABS)[number]['key'];

const EMPTY: Record<Tab, string> = {
  due: 'No inspections are coming up. New ones appear when the schedules generate them.',
  overdue: 'Nothing is overdue.',
  submitted: 'No inspections have been submitted yet.',
};

export default function InspectionsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = use(searchParams);
  const tab: Tab = TABS.some((t) => t.key === rawTab) ? (rawTab as Tab) : 'due';
  const { db, me, role } = useStore();
  const lookup = useLookup();

  const mine = role === 'INSPECTOR' ? db.inspections.filter((i) => i.assigneeId === me.id) : db.inspections;
  const byTab: Record<Tab, typeof mine> = {
    due: mine.filter((i) => i.status === 'PENDING' && !isOverdue(i)),
    overdue: mine.filter((i) => isOverdue(i)),
    submitted: mine.filter((i) => i.status === 'SUBMITTED'),
  };
  const rows = [...byTab[tab]].sort((a, b) =>
    tab === 'submitted' ? b.dueAt.localeCompare(a.dueAt) : a.dueAt.localeCompare(b.dueAt),
  );

  return (
    <RequireRole roles={['ADMIN', 'INSPECTOR']}>
      <PageHeader crumb="Operations"
        title={role === 'INSPECTOR' ? 'Your inspections' : 'Inspections'}
        description="Checklists created from your schedules. An inspection becomes overdue as soon as its due time passes."
      />

      <nav className="mb-5 flex gap-6 text-sm" aria-label="Inspection status">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/inspections?tab=${t.key}`}
            aria-current={tab === t.key ? 'page' : undefined}
            className={cx(
              'border-b pb-1',
              tab === t.key ? 'border-slate-900 font-semibold text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}{' '}
            <span className={cx('tabular', t.key === 'overdue' && byTab.overdue.length > 0 ? 'font-semibold text-danger' : 'text-slate-500')}>
              {byTab[t.key].length}
            </span>
          </Link>
        ))}
      </nav>

      <Card>
        {rows.length === 0 ? (
          <EmptyState>{EMPTY[tab]}</EmptyState>
        ) : (
          <Table head={['Inspection', 'Asset', 'Inspector', 'Due (site time)', 'Status']}>
            {rows.map((inspection) => {
              const asset = lookup.asset(inspection.assetId);
              const site = asset && lookup.site(asset.siteId);
              return (
                <tr key={inspection.id} className="hover:bg-slate-50">
                  <Td>
                    <TextLink href={`/inspections/${inspection.id}`}>
                      <RecordCode>{code.inspection(inspection.number)}</RecordCode>
                    </TextLink>
                    <Sub>{inspection.templateName}</Sub>
                  </Td>
                  <Td>
                    {asset?.name}
                    <Sub>{site?.name}</Sub>
                  </Td>
                  <Td>{lookup.user(inspection.assigneeId)?.name}</Td>
                  <Td className="whitespace-nowrap tabular">
                    {formatDateTime(inspection.dueAt, site?.timezone)}
                    <Sub>{relativeTime(inspection.dueAt)}</Sub>
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
    </RequireRole>
  );
}
