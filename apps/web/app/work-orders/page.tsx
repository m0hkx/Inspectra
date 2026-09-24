'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { WorkOrderStatusBadge, workOrderLabel, workOrderTone } from '@/components/badges';
import { Card, PageHeader, RecordCode, Sub, Swatch, Table, Td, TextLink, cx } from '@/components/ui';
import { WorkOrderTag } from '@/components/work-order-tag';
import { code, formatDate } from '@/lib/format';
import { can } from '@inspectra/shared';
import { useLookup, useStore } from '@/lib/store';
import { workOrderStatusSchema, type WorkOrderStatus } from '@inspectra/shared';

const BOARD: WorkOrderStatus[] = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'];
const CLOSED_PREVIEW = 8;

export default function WorkOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: rawStatus } = use(searchParams);
  const parsed = workOrderStatusSchema.safeParse(rawStatus);
  const focus: WorkOrderStatus | null = parsed.success ? parsed.data : null;
  const { db, me, role } = useStore();
  const lookup = useLookup();

  const [showAllClosed, setShowAllClosed] = useState(false);
  const seeAll = can(role, 'view:all_work_orders');
  const visible = db.workOrders
    .filter((w) => seeAll || w.assigneeId === me.id)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const columns = focus ? BOARD.filter((s) => s === focus) : BOARD;
  const closed = visible
    .filter((w) => w.status === 'VERIFIED' || w.status === 'CANCELLED')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader crumb="Operations"
        title={seeAll ? 'Work orders' : 'Your work orders'}
        description={
          seeAll
            ? 'Every fix in progress, hung by status. Admins create work orders from issues.'
            : 'Work assigned to you. Open one to start, pause or complete it.'
        }
        actions={
          focus && (
            <Link href="/work-orders" className="text-sm font-semibold underline underline-offset-2">
              Show the whole board
            </Link>
          )
        }
      />

      <div
        className={cx(
          'grid gap-x-5 gap-y-8',
          focus ? 'max-w-sm' : 'sm:grid-cols-2 xl:grid-cols-4',
        )}
      >
        {columns.map((status) => {
          const cards = visible.filter((w) => w.status === status);
          return (
            <section key={status} aria-label={workOrderLabel[status]} className="rounded-2xl bg-slate-200/50 p-3">
              <div className="flex items-center justify-between px-1 pb-1">
                <h2 className="eyebrow flex items-center gap-2">
                  <Swatch tone={workOrderTone[status]} className="size-3" />
                  {workOrderLabel[status]}
                </h2>
                <span className="text-xs font-semibold text-slate-500 tabular">{cards.length}</span>
              </div>
              <div className="flex flex-col gap-3 pt-3">
                {cards.length === 0 ? (
                  <p className="rounded-xl bg-white/60 px-4 py-6 text-center text-xs text-slate-500">
                    No work orders
                  </p>
                ) : (
                  cards.map((wo) => <WorkOrderTag key={wo.id} workOrder={wo} />)
                )}
              </div>
            </section>
          );
        })}
      </div>

      {!focus && closed.length > 0 && (
        <section className="mt-12">
          <h2 className="eyebrow">Closed</h2>
          <p className="mt-1 text-sm text-slate-500">Verified by an inspector, or cancelled by an admin.</p>
          <Card className="mt-4">
            <Table head={['Work order', 'Asset', 'Assignee', 'Due', 'Outcome']}>
              {(showAllClosed ? closed : closed.slice(0, CLOSED_PREVIEW)).map((wo) => {
                const issue = lookup.issue(wo.issueId)!;
                return (
                  <tr key={wo.id}>
                    <Td>
                      <TextLink href={`/work-orders/${wo.id}`}>
                        <RecordCode>{code.workOrder(wo.number)}</RecordCode>
                      </TextLink>
                      <Sub>{issue.title}</Sub>
                    </Td>
                    <Td>{lookup.asset(issue.assetId)?.name}</Td>
                    <Td>{lookup.user(wo.assigneeId)?.name}</Td>
                    <Td className="whitespace-nowrap">{formatDate(wo.dueAt)}</Td>
                    <Td>
                      <WorkOrderStatusBadge status={wo.status} />
                    </Td>
                  </tr>
                );
              })}
            </Table>
            {closed.length > CLOSED_PREVIEW && (
              <div className="border-t border-slate-100 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setShowAllClosed((v) => !v)}
                  className="cursor-pointer text-sm font-semibold text-slate-900 hover:underline hover:underline-offset-4"
                >
                  {showAllClosed ? 'Show fewer' : `Show all ${closed.length} closed work orders`}
                </button>
              </div>
            )}
          </Card>
        </section>
      )}
    </>
  );
}
