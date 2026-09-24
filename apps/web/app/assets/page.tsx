'use client';

import { useState } from 'react';
import { ASSET_STATUSES, AssetForm } from '@/components/asset-form';
import { AssetStatusBadge } from '@/components/badges';
import { Button, Card, EmptyState, PageHeader, Select, Sub, Table, Td, TextLink } from '@/components/ui';
import { humanize } from '@/lib/format';
import { can } from '@inspectra/shared';
import { useLookup, useStore } from '@/lib/store';
import type { AssetStatus } from '@/lib/types';

export default function AssetsPage() {
  const { db, role } = useStore();
  const lookup = useLookup();
  const [siteId, setSiteId] = useState('');
  const [status, setStatus] = useState<AssetStatus | ''>('');
  const [creating, setCreating] = useState(false);

  const rows = db.assets.filter((a) => (!siteId || a.siteId === siteId) && (!status || a.status === status));

  return (
    <>
      <PageHeader crumb="Setup"
        title="Assets"
        description="The equipment your team inspects, and where each piece lives."
        actions={
          can(role, 'manage:assets') &&
          !creating && <Button onClick={() => setCreating(true)}>New asset</Button>
        }
      />

      {creating && <AssetForm onDone={() => setCreating(false)} />}

      <div className="mb-4 flex flex-wrap gap-3">
        <Select className="w-auto" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">All sites</option>
          {db.sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as AssetStatus | '')}>
          <option value="">All statuses</option>
          {ASSET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState>No assets match these filters.</EmptyState>
        ) : (
          <Table head={['Asset', 'Category', 'Site', 'Location', 'Open issues', 'Status']}>
            {rows.map((asset) => {
              const openIssues = db.issues.filter((i) => i.assetId === asset.id && i.status !== 'RESOLVED').length;
              return (
              <tr key={asset.id} className="hover:bg-slate-50">
                <Td>
                  <TextLink href={`/assets/${asset.id}`}>{asset.name}</TextLink>
                  <Sub>Serial {asset.serial || 'not recorded'}</Sub>
                </Td>
                <Td>{asset.category}</Td>
                <Td>{lookup.site(asset.siteId)?.name}</Td>
                <Td className="text-slate-600">{asset.location}</Td>
                <Td className="text-base font-semibold tabular">
                  <span className={openIssues > 0 ? 'text-danger' : 'text-slate-400'}>{openIssues}</span>
                </Td>
                <Td>
                  <AssetStatusBadge status={asset.status} />
                </Td>
              </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
