import { cx } from '../ui';

export interface BarListRow {
  key: string;
  label: string;
  value: number;
  /** The one row the widget is about; everything else stays grey. */
  highlight?: boolean;
}

/** Labelled horizontal bars: readable at a glance, with the value printed on every row. */
export function BarList({ rows, label }: { rows: BarListRow[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={label} className="mt-5 space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-xs">
          <span className={cx('truncate', r.highlight ? 'font-semibold text-slate-900' : 'text-slate-600')}>{r.label}</span>
          <span aria-hidden className="h-2 overflow-hidden rounded-full bg-slate-100">
            <span
              className={cx('block h-full rounded-full', r.highlight ? 'bg-slate-900' : 'bg-slate-300')}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className={cx('text-right tabular', r.highlight ? 'font-semibold text-slate-900' : 'text-slate-600')}>{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export interface DayTile {
  key: string;
  weekday: string;
  day: number;
  count: number;
  today: boolean;
}

/** The coming week as seven tiles, today first, each showing how many inspections fall due. */
export function DayStrip({ days }: { days: DayTile[] }) {
  return (
    <ol aria-label="Inspections due this week" className="mt-5 grid grid-cols-7 gap-1.5">
      {days.map((d) => (
        <li
          key={d.key}
          aria-label={`${d.today ? 'Today' : `${d.weekday} ${d.day}`}: ${d.count} due`}
          className={cx(
            'flex flex-col items-center rounded-xl py-2 text-center',
            d.today ? 'bg-slate-900 text-white' : d.count > 0 ? 'bg-slate-100 text-slate-900' : 'text-slate-400',
          )}
        >
          <span className={cx('text-[0.6875rem]', d.today ? 'text-white/70' : 'text-slate-500')}>{d.weekday}</span>
          <span className="text-sm font-semibold tabular">{d.day}</span>
          <span aria-hidden className="mt-1 flex h-1.5 gap-0.5">
            {Array.from({ length: Math.min(d.count, 3) }, (_, i) => (
              <span key={i} className={cx('size-1.5 rounded-full', d.today ? 'bg-white' : 'bg-slate-900')} />
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}
