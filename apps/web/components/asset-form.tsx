'use client';

import { useState, type FormEvent } from 'react';
import { Button, Card, CardHeader, ErrorNote, Field, Input, Select, attempt } from './ui';
import { humanize } from '@/lib/format';
import { useStore, type AssetInput } from '@/lib/store';
import type { AssetStatus } from '@/lib/types';

export const ASSET_STATUSES: AssetStatus[] = ['ACTIVE', 'OUT_OF_SERVICE', 'RETIRED'];

export function AssetForm({ id, initial, onDone }: { id?: string; initial?: AssetInput; onDone: () => void }) {
  const { db, actions } = useStore();
  const [input, setInput] = useState<AssetInput>(
    initial ?? { siteId: db.sites[0]?.id ?? '', name: '', category: '', serial: '', location: '', status: 'ACTIVE' },
  );
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<AssetInput>) => setInput({ ...input, ...patch });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (attempt(() => actions.saveAsset(input, id), setError)) onDone();
  };

  return (
    <Card className="mb-6">
      <CardHeader title={id ? 'Edit asset' : 'New asset'} />
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Name">
          <Input required value={input.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Site">
          <Select required value={input.siteId} onChange={(e) => set({ siteId: e.target.value })}>
            {db.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Input required placeholder="e.g. Fire Safety" value={input.category} onChange={(e) => set({ category: e.target.value })} />
        </Field>
        <Field label="Serial number">
          <Input value={input.serial} onChange={(e) => set({ serial: e.target.value })} />
        </Field>
        <Field label="Location" hint="Free text, e.g. “Floor 2, Server Room”">
          <Input value={input.location} onChange={(e) => set({ location: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select value={input.status} onChange={(e) => set({ status: e.target.value as AssetStatus })}>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2 sm:col-span-3">
          <Button type="submit">Save asset</Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
        <div className="sm:col-span-3">
          <ErrorNote message={error} />
        </div>
      </form>
    </Card>
  );
}
