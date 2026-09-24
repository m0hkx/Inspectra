'use client';

import { useState, type FormEvent } from 'react';
import { RequireRole } from '@/components/app-shell';
import { Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader, Select, Table, Td, attempt } from '@/components/ui';
import { humanize } from '@/lib/format';
import { useStore } from '@/lib/store';
import { roleSchema, type Role } from '@inspectra/shared';

const ROLE_HELP: Record<Role, string> = {
  ADMIN: 'Manages setup, assigns work orders, can verify',
  INSPECTOR: 'Performs inspections, verifies or rejects work',
  TECHNICIAN: 'Works on work orders assigned to them',
};

export default function MembersPage() {
  const { db, me, actions } = useStore();
  const [error, setError] = useState<string | null>(null);

  return (
    <RequireRole roles={['ADMIN']}>
      <PageHeader crumb="Setup" title="Members" description={`People in ${db.organization.name} and what they can do.`} />

      <InviteForm />

      <ErrorNote message={error} />
      <Card className="mt-2">
        <Table head={['Name', 'Email', 'Role']}>
          {db.users.map((user) => {
            const role = db.memberships.find((m) => m.userId === user.id)!.role;
            return (
              <tr key={user.id}>
                <Td className="font-medium">
                  {user.name}
                  {user.id === me.id && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}
                </Td>
                <Td className="text-slate-600">{user.email}</Td>
                <Td>
                  <Select
                    className="w-auto"
                    value={role}
                    onChange={(e) => attempt(() => actions.changeRole(user.id, e.target.value as Role), setError)}
                  >
                    {roleSchema.options.map((r) => (
                      <option key={r} value={r}>
                        {humanize(r)}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-slate-400">{ROLE_HELP[role]}</p>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </RequireRole>
  );
}

function InviteForm() {
  const { actions } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('TECHNICIAN');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (attempt(() => actions.inviteMember(name.trim(), email.trim(), role), setError)) {
      setName('');
      setEmail('');
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader title="Invite a member" />
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-end">
        <Field label="Name">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roleSchema.options.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit">Invite</Button>
        <div className="sm:col-span-4">
          <ErrorNote message={error} />
        </div>
      </form>
    </Card>
  );
}
