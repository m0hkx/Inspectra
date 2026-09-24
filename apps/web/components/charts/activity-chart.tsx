'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import type { Inspection } from '@/lib/types';
import { Status, cx } from '../ui';

const DAY = 86_400_000;
const PLOT_HEIGHT = 220;

export interface DayBucket {
  key: string;
  date: Date;
  clean: number;
  withFailures: number;
  total: number;
  average: number;
}

const dayKey = (d: Date) => d.toLocaleDateString('en-CA');

/** Inspections submitted per local day, plus a trailing 7-day average in the same unit. */
export function bucketByDay(inspections: Inspection[], days: number, now = new Date()): DayBucket[] {
  const counts = new Map<string, { clean: number; withFailures: number }>();
  for (const i of inspections) {
    if (!i.submittedAt) continue;
    const key = dayKey(new Date(i.submittedAt));
    const entry = counts.get(key) ?? { clean: 0, withFailures: 0 };
    if (i.responses.some((r) => r.result === 'FAIL')) entry.withFailures++;
    else entry.clean++;
    counts.set(key, entry);
  }
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  const totalFor = (d: Date) => {
    const c = counts.get(dayKey(d));
    return c ? c.clean + c.withFailures : 0;
  };

  return Array.from({ length: days }, (_, idx) => {
    const date = new Date(start.getTime() - (days - 1 - idx) * DAY);
    const c = counts.get(dayKey(date)) ?? { clean: 0, withFailures: 0 };
    let sum = 0;
    for (let k = 0; k < 7; k++) sum += totalFor(new Date(date.getTime() - k * DAY));
    return { key: dayKey(date), date, ...c, total: c.clean + c.withFailures, average: sum / 7 };
  });
}

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / step) * step;
}

const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

export function ActivityChart({ buckets }: { buckets: DayBucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const summaryId = useId();
  const max = niceMax(Math.max(1, ...buckets.map((b) => Math.max(b.total, b.average))));
  const ticks = [max, (max * 3) / 4, max / 2, max / 4, 0];
  const dense = buckets.length > 14;
  // Thin marks with air between them; wider only when there are few days to show.
  const barWidth = buckets.length > 60 ? 7 : buckets.length > 14 ? 12 : 22;
  const monthStarts = buckets.flatMap((b, i) => (b.date.getDate() === 1 ? [i] : []));
  // Label the first day only when the first month boundary isn't right beside it.
  const labelled = new Set(dense ? [...(monthStarts[0] === undefined || monthStarts[0] > 6 ? [0] : []), ...monthStarts] : buckets.map((_, i) => i));

  const linePoints = buckets.map((b, i) => `${i + 0.5},${100 - (b.average / max) * 100}`).join(' ');

  const total = buckets.reduce((s, b) => s + b.total, 0);
  const failed = buckets.reduce((s, b) => s + b.withFailures, 0);
  const busiest = buckets.reduce((a, b) => (b.total > a.total ? b : a), buckets[0]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(buckets.length - 1, (h ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? buckets.length) - 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };

  const active = hover !== null ? buckets[hover] : null;
  const leftPct = hover !== null ? ((hover + 0.5) / buckets.length) * 100 : 0;

  return (
    <div className="flex gap-3">
      <div className="relative w-7 shrink-0 text-right text-[0.6875rem] text-slate-400 tabular" style={{ height: PLOT_HEIGHT }} aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / max) * 100}%` }}>
            {Number.isInteger(t) ? t : t.toFixed(1)}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <p id={summaryId} className="sr-only">
          {total} inspections completed in the last {buckets.length} days, {failed} of them with failed items.
          The busiest day was {longDate.format(busiest.date)} with {busiest.total}. Use the left and right arrow keys to read each day.
        </p>
        <div
          role="group"
          tabIndex={0}
          aria-label="Inspections completed per day"
          aria-describedby={summaryId}
          onKeyDown={onKeyDown}
          onMouseLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          className="relative rounded-lg"
          style={{ height: PLOT_HEIGHT }}
        >
          {ticks.map((t) => (
            <div key={t} aria-hidden className="absolute inset-x-0 border-t border-slate-100" style={{ top: `${100 - (t / max) * 100}%` }} />
          ))}

          <div className="absolute inset-0 flex items-end">
            {buckets.map((b, i) => {
              const dim = hover !== null && Math.abs(hover - i) > 3;
              return (
                <div
                  key={b.key}
                  onMouseEnter={() => setHover(i)}
                  className="flex h-full flex-1 cursor-crosshair flex-col items-center justify-end"
                >
                  <div
                    className={cx('flex w-full flex-col-reverse gap-[2px] transition-opacity duration-150', dim && 'opacity-35')}
                    style={{ maxWidth: barWidth }}
                  >
                    {b.total === 0 && <div aria-hidden className="h-[2px] w-full rounded-full bg-slate-200" />}
                    {b.clean > 0 && (
                      <div
                        className={cx('w-full', b.withFailures === 0 && 'rounded-t-[4px]', hover === i ? 'bg-slate-700' : 'bg-slate-300')}
                        style={{ height: (b.clean / max) * PLOT_HEIGHT - (b.withFailures ? 1 : 0) }}
                      />
                    )}
                    {b.withFailures > 0 && (
                      <div
                        className="w-full rounded-t-[4px] bg-danger"
                        style={{ height: (b.withFailures / max) * PLOT_HEIGHT - (b.clean ? 1 : 0) }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${buckets.length} 100`} preserveAspectRatio="none">
            <polyline
              points={linePoints}
              fill="none"
              stroke="var(--color-slate-900)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {active && (
            <div
              role="status"
              className="pointer-events-none absolute bottom-3 z-10 w-48 -translate-x-1/2 rounded-xl bg-white/95 p-3 shadow-xl shadow-slate-900/10 ring-1 ring-slate-200 backdrop-blur"
              style={{ left: `clamp(6rem, ${leftPct}%, calc(100% - 6rem))` }}
            >
              <p className="flex items-center gap-2">
                <span className="text-lg font-semibold">{active.total}</span>
                {active.total > 0 && active.withFailures === 0 && <Status tone="safe">All passed</Status>}
              </p>
              <p className="text-xs text-slate-500">
                {active.total === 1 ? 'inspection' : 'inspections'} on {longDate.format(active.date)}
              </p>
              {active.withFailures > 0 && (
                <p className="mt-1.5 text-xs text-slate-700">
                  {active.withFailures} with failed items
                </p>
              )}
              <p className="mt-1.5 text-xs text-slate-500">7-day average {active.average.toFixed(1)}</p>
            </div>
          )}
        </div>

        <div className="relative mt-2 h-4 text-[0.6875rem] text-slate-400" aria-hidden>
          {buckets.map((b, i) => {
            if (!labelled.has(i)) return null;
            return (
              <span key={b.key} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 0.5) / buckets.length) * 100}%` }}>
                {dense ? monthFmt.format(b.date) : weekdayFmt.format(b.date)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ActivityTable({ buckets }: { buckets: DayBucket[] }) {
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Inspections completed per day</caption>
        <thead className="sticky top-0 bg-white text-xs text-slate-500">
          <tr>
            <th className="py-2 font-medium">Day</th>
            <th className="py-2 text-right font-medium">Completed</th>
            <th className="py-2 text-right font-medium">With failures</th>
            <th className="py-2 text-right font-medium">7-day average</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular">
          {[...buckets].reverse().map((b) => (
            <tr key={b.key}>
              <td className="py-2">{longDate.format(b.date)}</td>
              <td className="py-2 text-right">{b.total}</td>
              <td className="py-2 text-right">{b.withFailures}</td>
              <td className="py-2 text-right">{b.average.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
