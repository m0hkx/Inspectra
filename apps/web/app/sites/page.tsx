'use client';

import { useState, type FormEvent } from 'react';
import { RequireRole } from '@/components/app-shell';
import { Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader, Select, Table, Td, attempt } from '@/components/ui';
import { useStore, type SiteInput } from '@/lib/store';

const EMPTY: SiteInput = { name: '', address: '', timezone: 'UTC' };

export default function SitesPage() {
  const { db } = useStore();
  const [editing, setEditing] = useState<{ id?: string; input: SiteInput } | null>(null);

  return (
    <RequireRole roles={['ADMIN']}>
      <PageHeader crumb="Setup"
        title="Sites"
        description="The places your equipment lives. Inspections are scheduled in each site's local time."
        actions={!editing && <Button onClick={() => setEditing({ input: EMPTY })}>New site</Button>}
      />

      {editing && (
        <SiteForm
          key={editing.id ?? 'new'}
          id={editing.id}
          initial={editing.input}
          onDone={() => setEditing(null)}
        />
      )}

      <Card>
        <Table head={['Name', 'Address', 'Timezone', 'Assets', '']}>
          {db.sites.map((site) => (
            <tr key={site.id} className="hover:bg-slate-50">
              <Td className="font-medium">{site.name}</Td>
              <Td className="text-slate-600">{site.address}</Td>
              <Td className="text-slate-600">{site.timezone}</Td>
              <Td>{db.assets.filter((a) => a.siteId === site.id).length}</Td>
              <Td className="text-right">
                <Button
                  variant="ghost"
                  onClick={() =>
                    setEditing({
                      id: site.id,
                      input: { name: site.name, address: site.address, timezone: site.timezone },
                    })
                  }
                >
                  Edit
                </Button>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </RequireRole>
  );
}

function SiteForm({ id, initial, onDone }: { id?: string; initial: SiteInput; onDone: () => void }) {
  const { actions } = useStore();
  const [input, setInput] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [timezones] = useState(() => Intl.supportedValuesOf('timeZone'));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await attempt(() => actions.saveSite(input, id), setError)) onDone();
  };

  return (
    <Card className="mb-6">
      <CardHeader title={id ? 'Edit site' : 'New site'} />
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Name">
          <Input required value={input.name} onChange={(e) => setInput({ ...input, name: e.target.value })} />
        </Field>
        <Field label="Address">
          <Input value={input.address} onChange={(e) => setInput({ ...input, address: e.target.value })} />
        </Field>
        <Field label="Timezone">
          <Select value={input.timezone} onChange={(e) => setInput({ ...input, timezone: e.target.value })}>
            {['UTC', ...timezones.filter((tz) => tz !== 'UTC')].map((tz) => (
              <option key={tz}>{tz}</option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2 sm:col-span-3">
          <Button type="submit">Save site</Button>
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
