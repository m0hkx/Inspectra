'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react/dist/ssr';
import { code } from '@/lib/format';
import { can } from '@/lib/permissions';
import { useStore } from '@/lib/store';
import { cx } from './ui';

interface Result {
  key: string;
  kind: string;
  title: string;
  detail: string;
  href: string;
}

/** Top-bar search across the records the current role can see. Ctrl/Cmd+K focuses it. */
export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const { db, me, role } = useStore();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The shell renders a desktop and a mobile instance; only the visible one responds.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && inputRef.current?.offsetParent) {
        e.preventDefault();
        inputRef.current.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const meId = me.id;
  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const has = (...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));
    const assetName = (id: string) => db.assets.find((a) => a.id === id)?.name ?? '';
    const out: Result[] = [];

    const workOrders = can(role, 'view:all_work_orders') ? db.workOrders : db.workOrders.filter((w) => w.assigneeId === meId);
    for (const wo of workOrders) {
      const issue = db.issues.find((i) => i.id === wo.issueId)!;
      if (has(code.workOrder(wo.number), issue.title, assetName(issue.assetId))) {
        out.push({ key: wo.id, kind: 'Work order', title: `${code.workOrder(wo.number)} ${issue.title}`, detail: assetName(issue.assetId), href: `/work-orders/${wo.id}` });
      }
    }
    if (can(role, 'view:issues')) {
      for (const issue of db.issues.filter((i) => i.status !== 'RESOLVED')) {
        if (has(code.issue(issue.number), issue.title, assetName(issue.assetId))) {
          out.push({ key: issue.id, kind: 'Issue', title: `${code.issue(issue.number)} ${issue.title}`, detail: assetName(issue.assetId), href: '/issues' });
        }
      }
    }
    for (const asset of db.assets) {
      if (has(asset.name, asset.serial, asset.category, asset.location)) {
        out.push({ key: asset.id, kind: 'Asset', title: asset.name, detail: `${asset.category}, ${asset.location}`, href: `/assets/${asset.id}` });
      }
    }
    if (role !== 'TECHNICIAN') {
      const inspections = role === 'INSPECTOR' ? db.inspections.filter((i) => i.assigneeId === meId) : db.inspections;
      for (const inspection of inspections.filter((i) => i.status === 'PENDING')) {
        if (has(code.inspection(inspection.number), inspection.templateName, assetName(inspection.assetId))) {
          out.push({
            key: inspection.id,
            kind: 'Inspection',
            title: `${code.inspection(inspection.number)} ${inspection.templateName}`,
            detail: assetName(inspection.assetId),
            href: `/inspections/${inspection.id}`,
          });
        }
      }
    }
    return out.slice(0, 8);
  }, [query, db, meId, role]);

  const showResults = focused && query.trim().length > 0;

  const go = (href: string) => {
    router.push(href);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setQuery('');
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && results[active]) {
      go(results[active].href);
    }
  };

  return (
    <div className={cx('relative', className)}>
      <div className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition-colors focus-within:border-slate-900">
        <MagnifyingGlass size={16} aria-hidden className="shrink-0 text-slate-700" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listId}
          aria-activedescendant={showResults && results[active] ? `${listId}-${active}` : undefined}
          aria-label="Search work orders, issues, assets and inspections"
          placeholder="Search records"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-slate-400"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery('')}
            className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={14} aria-hidden />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-md border border-slate-200 px-1.5 text-[0.6875rem] text-slate-500 lg:block">Ctrl K</kbd>
        )}
      </div>

      {showResults && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute right-0 z-40 mt-2 max-h-96 w-full min-w-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 sm:w-[26rem]"
        >
          {results.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Nothing matches &ldquo;{query.trim()}&rdquo;.</li>}
          {results.map((r, i) => (
            <li
              key={`${r.kind}-${r.key}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(r.href)}
              onMouseEnter={() => setActive(i)}
              className={cx('flex cursor-pointer items-baseline gap-3 rounded-xl px-3 py-2', i === active && 'bg-slate-100')}
            >
              <span className="w-20 shrink-0 text-xs text-slate-500">{r.kind}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.title}</span>
                <span className="block truncate text-xs text-slate-500">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
