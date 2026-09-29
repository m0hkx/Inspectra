'use client';

import { useState, type FormEvent } from 'react';
import { Logo } from './logo';
import { Button, Card, ErrorNote, Field, Input, attempt } from './ui';

/** Signed in with Clerk, but no organization has added this person yet. */
export function Onboarding({
  email,
  onCreate,
  onSignOut,
}: {
  email: string | null;
  onCreate: (name: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    await attempt(() => onCreate(name), setError);
    setPending(false);
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <Card className="w-full max-w-md p-8">
        <Logo href="/" />
        <h1 className="mt-6 text-xl font-light">Set up your organization</h1>
        <p className="mt-2 text-sm text-slate-600">
          {email ? (
            <>
              You&apos;re signed in as <span className="font-semibold text-slate-900">{email}</span>
              , but no organization has added you yet.
            </>
          ) : (
            <>No organization has added you yet.</>
          )}{' '}
          Start one and you&apos;ll be its admin. If your team already uses Inspectra, ask an admin
          to invite this email instead.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Organization name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Northwind Facilities"
              maxLength={120}
              required
              autoFocus
            />
          </Field>
          <ErrorNote message={error} />
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={onSignOut}>
              Sign out
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? 'Creating…' : 'Create organization'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
