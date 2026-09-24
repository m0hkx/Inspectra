'use client';

import { useState } from 'react';
import { RequireRole } from '@/components/app-shell';
import { Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader, Select, Textarea, attempt, cx } from '@/components/ui';
import { humanize } from '@/lib/format';
import { useStore, type TemplateInput } from '@/lib/store';
import type { Severity } from '@/lib/types';

const SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const newItem = () => ({ id: `item_${crypto.randomUUID().slice(0, 8)}`, prompt: '', defaultSeverity: 'MEDIUM' as Severity });

export default function TemplatesPage() {
  const { db } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(db.templates[0]?.id ?? null);
  const selected = db.templates.find((t) => t.id === selectedId);

  return (
    <RequireRole roles={['ADMIN']}>
      <PageHeader crumb="Setup"
        title="Inspection templates"
        description="The checklists inspectors fill in. Changes apply to future inspections only; past ones keep the questions that were asked."
        actions={<Button onClick={() => setSelectedId(null)}>New template</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <nav aria-label="Templates" className="flex flex-col gap-0.5 self-start">
          {db.templates.map((t) => {
            const uses = db.schedules.filter((s) => s.templateId === t.id).length;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={selectedId === t.id ? 'true' : undefined}
                onClick={() => setSelectedId(t.id)}
                className={cx(
                  'cursor-pointer rounded-xl px-3 py-2 text-left',
                  selectedId === t.id ? 'bg-white ring-1 ring-slate-200' : 'hover:bg-white/60',
                )}
              >
                <span className="block text-sm font-semibold">{t.name}</span>
                <span className="block text-xs text-slate-500">
                  {t.items.length} items, on {uses} schedule{uses === 1 ? '' : 's'}
                </span>
              </button>
            );
          })}
        </nav>

        <TemplateEditor
          key={selected?.id ?? 'new'}
          initial={selected ?? { name: '', description: '', items: [newItem()] }}
          onSaved={setSelectedId}
        />
      </div>
    </RequireRole>
  );
}

function TemplateEditor({ initial, onSaved }: { initial: TemplateInput; onSaved: (id: string) => void }) {
  const { actions } = useStore();
  const [draft, setDraft] = useState<TemplateInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const change = (next: TemplateInput) => {
    setDraft(next);
    setSaved(false);
  };
  const setItem = (index: number, patch: Partial<TemplateInput['items'][number]>) =>
    change({ ...draft, items: draft.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const move = (index: number, delta: -1 | 1) => {
    const items = [...draft.items];
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    change({ ...draft, items });
  };

  const save = async () => {
    let id = '';
    if (await attempt(async () => (id = await actions.saveTemplate(draft)), setError)) {
      setSaved(true);
      onSaved(id);
    }
  };

  return (
    <Card>
      <CardHeader title={draft.id ? 'Edit template' : 'New template'} />
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={draft.name} onChange={(e) => change({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Description">
            <Input value={draft.description} onChange={(e) => change({ ...draft, description: e.target.value })} />
          </Field>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-600">
            Checklist items, in the order the inspector sees them. Severity is the default when an item fails.
          </p>
          <ol className="border-t border-slate-200">
            {draft.items.map((item, index) => (
              <li key={item.id} className="flex flex-wrap items-start gap-2 border-b border-slate-200 py-3 sm:flex-nowrap">
                <span className="mt-1.5 w-5 text-lg leading-tight font-semibold text-slate-400 tabular">
                  {index + 1}
                </span>
                <Textarea
                  rows={1}
                  className="min-w-0 flex-1"
                  placeholder="What should the inspector check?"
                  value={item.prompt}
                  onChange={(e) => setItem(index, { prompt: e.target.value })}
                />
                <Select
                  className="w-32"
                  aria-label="Default severity"
                  value={item.defaultSeverity}
                  onChange={(e) => setItem(index, { defaultSeverity: e.target.value as Severity })}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </Select>
                <div className="flex gap-1">
                  <Button variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label="Move down"
                    disabled={index === draft.items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label="Remove item"
                    onClick={() => change({ ...draft, items: draft.items.filter((_, i) => i !== index) })}
                  >
                    ✕
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <Button variant="secondary" className="mt-2" onClick={() => change({ ...draft, items: [...draft.items, newItem()] })}>
            Add item
          </Button>
        </div>

        <ErrorNote message={error} />
        <div className="flex items-center gap-3">
          <Button onClick={save}>Save template</Button>
          {saved && <span className="text-sm font-semibold text-safe">Template saved</span>}
        </div>
      </div>
    </Card>
  );
}
