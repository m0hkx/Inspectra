'use client';

import { useState, type FormEvent } from 'react';
import { RequireRole } from '@/components/app-shell';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  Status,
  Sub,
  Table,
  Td,
  attempt,
} from '@/components/ui';
import { formatDateTime, humanize } from '@/lib/format';
import { nextDueAt, type Schedule } from '@inspectra/shared';
import { useLookup, useStore, type ScheduleInput } from '@/lib/store';
import type { Frequency } from '@/lib/types';

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly (Mondays)' },
  { value: 'MONTHLY', label: 'Monthly (on the 1st)' },
];

export default function SchedulesPage() {
  const { db, actions } = useStore();
  const lookup = useLookup();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runJob = async () => {
    let created = 0;
    if (await attempt(async () => (created = await actions.runGeneration()), setError)) {
      setMessage(
        created === 0
          ? 'No new inspections to create. Every active schedule already has its next inspection.'
          : `Created ${created} inspection${created === 1 ? '' : 's'}. They're on the Inspections page.`,
      );
    }
  };

  return (
    <RequireRole roles={['ADMIN']}>
      <PageHeader crumb="Setup"
        title="Schedules"
        description="Schedules create inspections automatically every hour, using each site's local time."
        actions={
          <>
            <Button variant="secondary" onClick={runJob}>
              Create due inspections now
            </Button>
            {!creating && <Button onClick={() => setCreating(true)}>New schedule</Button>}
          </>
        }
      />

      <div className="mb-4 space-y-2 empty:hidden">
        {message && <Notice>{message}</Notice>}
        <ErrorNote message={error} />
      </div>

      {creating && <ScheduleForm onDone={() => setCreating(false)} />}

      <Card>
        {db.schedules.length === 0 ? (
          <EmptyState>No schedules yet. Create one to start generating inspections for an asset.</EmptyState>
        ) : (
          <Table head={['Checklist', 'Asset', 'Repeats', 'Inspector', 'Next inspection', '']}>
            {db.schedules.map((s) => {
              const asset = lookup.asset(s.assetId);
              const site = asset && lookup.site(asset.siteId);
              const next = site && nextDueAt(s.frequency, s.timeOfDay, site.timezone, new Date()).toISOString();
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td className="font-medium">{lookup.template(s.templateId)?.name}</Td>
                  <Td>
                    {asset?.name}
                    <Sub>{site?.name}</Sub>
                  </Td>
                  <Td className="tabular">
                    {humanize(s.frequency)} at {s.timeOfDay}
                    <Sub>{site?.timezone}</Sub>
                  </Td>
                  <Td>{lookup.user(s.assigneeId)?.name}</Td>
                  <Td className="whitespace-nowrap tabular">
                    {s.active && next ? (
                      <>
                        {formatDateTime(next, site.timezone)}
                        <Sub>{new Date(next).toISOString().slice(0, 16).replace('T', ' ')} UTC</Sub>
                      </>
                    ) : (
                      <Status tone="neutral">Paused</Status>
                    )}
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => void attempt(() => actions.toggleSchedule(s.id), setError)}>
                        {s.active ? 'Pause' : 'Resume'}
                      </Button>
                      <Button variant="danger" onClick={() => setDeleting(s)}>
                        Delete
                      </Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {deleting && (
        <DeleteScheduleDialog
          schedule={deleting}
          onDeleted={(text) => {
            setError(null);
            setMessage(text);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </RequireRole>
  );
}

function DeleteScheduleDialog({
  schedule,
  onDeleted,
  onClose,
}: {
  schedule: Schedule;
  onDeleted: (message: string) => void;
  onClose: () => void;
}) {
  const { db, actions } = useStore();
  const lookup = useLookup();
  const template = lookup.template(schedule.templateId)?.name ?? 'Checklist';
  const asset = lookup.asset(schedule.assetId)?.name ?? 'an asset';
  const inspector = lookup.user(schedule.assigneeId)?.name ?? 'the inspector';
  const pending = db.inspections.filter((i) => i.scheduleId === schedule.id && i.status === 'PENDING').length;

  return (
    <ConfirmDialog
      title="Delete this schedule?"
      confirmLabel="Delete schedule"
      busyLabel="Deleting…"
      onConfirm={async () => {
        await actions.deleteSchedule(schedule.id);
        onDeleted(`Deleted the ${template} schedule for ${asset}. It won't create any more inspections.`);
      }}
      onClose={onClose}
    >
      <div className="rounded-xl border border-slate-200 px-4 py-3">
        <p className="font-medium text-slate-900">{template}</p>
        <Sub>
          {asset}, {humanize(schedule.frequency).toLowerCase()} at {schedule.timeOfDay}
        </Sub>
      </div>
      <p>
        It won&apos;t create any more inspections. The ones it already created stay in the records
        {pending > 0 && (
          <>
            , including {pending} still to do on {inspector}&apos;s list
          </>
        )}
        .
      </p>
      <p>This can&apos;t be undone. To stop it for a while instead, pause it.</p>
    </ConfirmDialog>
  );
}

function ScheduleForm({ onDone }: { onDone: () => void }) {
  const { db, actions } = useStore();
  const lookup = useLookup();
  const inspectors = lookup.usersWithRole('INSPECTOR');
  const [input, setInput] = useState<ScheduleInput>({
    templateId: db.templates[0]?.id ?? '',
    assetId: db.assets[0]?.id ?? '',
    frequency: 'WEEKLY',
    timeOfDay: '09:00',
    assigneeId: inspectors[0]?.id ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ScheduleInput>) => setInput({ ...input, ...patch });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await attempt(() => actions.createSchedule(input), setError)) onDone();
  };

  return (
    <Card className="mb-6">
      <CardHeader title="New schedule" />
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Template">
          <Select required value={input.templateId} onChange={(e) => set({ templateId: e.target.value })}>
            {db.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Asset">
          <Select required value={input.assetId} onChange={(e) => set({ assetId: e.target.value })}>
            {db.assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Frequency">
          <Select value={input.frequency} onChange={(e) => set({ frequency: e.target.value as Frequency })}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Time (site timezone)">
          <Input type="time" required value={input.timeOfDay} onChange={(e) => set({ timeOfDay: e.target.value })} />
        </Field>
        <Field label="Inspector">
          <Select required value={input.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
            {inspectors.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
          <Button type="submit">Create schedule</Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
        <div className="sm:col-span-2 lg:col-span-5">
          <ErrorNote message={error} />
        </div>
      </form>
    </Card>
  );
}
