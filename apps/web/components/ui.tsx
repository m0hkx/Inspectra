'use client';

import Link from 'next/link';
import { CaretRight, SquaresFour } from '@phosphor-icons/react/dist/ssr';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useStore } from '@/lib/store';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function PageHeader({
  title,
  crumb,
  description,
  actions,
}: {
  title: string;
  crumb?: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const { db } = useStore();
  return (
    <div className="mb-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500">
        <SquaresFour size={14} aria-hidden />
        <span>{db.organization.name}</span>
        <CaretRight size={10} aria-hidden className="text-slate-400" />
        <span>{crumb ?? title}</span>
      </nav>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-[2.125rem] leading-tight font-light tracking-tight">{title}</h1>
          {description && <div className="mt-1 text-sm text-slate-500">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-slate-200/80 bg-white', className)}>{children}</div>;
}

export function CardHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-5 pt-4 pb-2">
      <h2 className="eyebrow">{title}</h2>
      {actions}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300 disabled:text-slate-500',
  secondary: 'border border-slate-200 bg-white text-slate-900 hover:border-slate-400 disabled:text-slate-400',
  danger: 'border border-slate-200 bg-white text-danger hover:border-danger/50 hover:bg-danger-soft',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
    />
  );
}

/** Square icon control. `label` is both the accessible name and the hover/focus tooltip. */
export function IconButton({
  label,
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      {...props}
      className={cx('group relative', iconBoxClass(active), className)}
    >
      {children}
      <Tooltip>{label}</Tooltip>
    </button>
  );
}

export function iconBoxClass(active?: boolean): string {
  return cx(
    'inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition-colors',
    active
      ? 'border-slate-900 bg-slate-900 text-white'
      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900',
  );
}

export function Tooltip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-full left-1/2 z-30 mt-2 -translate-x-1/2 rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

/** Week / Month / Quarter style text toggle, active option underlined. */
export function PeriodTabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-4 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'cursor-pointer border-b pb-0.5 transition-colors',
            value === o.value ? 'border-slate-900 font-semibold text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type Tone = 'neutral' | 'info' | 'caution' | 'danger' | 'critical' | 'safe' | 'pending';

export const toneColor: Record<Tone, string> = {
  neutral: 'var(--color-slate-400)',
  info: 'var(--color-slate-900)',
  caution: 'var(--color-caution)',
  danger: 'var(--color-danger)',
  critical: 'var(--color-danger)',
  safe: 'var(--color-safe)',
  pending: 'var(--color-slate-900)',
};

export function Status({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  if (tone === 'critical') {
    return (
      <span className="inline-flex items-center rounded-full bg-danger px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-white">
        {children}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-slate-700">
      <Swatch tone={tone} />
      {children}
    </span>
  );
}

export function Swatch({ tone, className }: { tone: Tone; className?: string }) {
  // Waiting for sign-off reads as an empty ring: done, but not yet checked.
  const hollow = tone === 'pending';
  return (
    <span
      aria-hidden
      className={cx('inline-block size-2 shrink-0 rounded-full', className)}
      style={hollow ? { boxShadow: `inset 0 0 0 1.5px ${toneColor[tone]}` } : { background: toneColor[tone] }}
    />
  );
}

export function RecordCode({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-semibold tabular', className)}>{children}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  'min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-slate-900';

/** Full width unless the caller sets its own width (w-auto, w-32...), which must win. */
function fieldClass(className?: string, extra?: string): string {
  return cx(inputClass, !/(^|\s)w-/.test(className ?? '') && 'w-full', extra, className);
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={fieldClass(props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={fieldClass(props.className, 'cursor-pointer pr-8')} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={fieldClass(props.className)} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-500">{children}</p>;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-slate-900">
      {message}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-xl bg-safe-soft px-3 py-2 text-sm text-slate-900">
      {children}
    </p>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={`${h}-${i}`} className="px-5 pt-4 pb-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx('px-5 py-3.5 align-top', className)}>{children}</td>;
}

export function Sub({ children }: { children: ReactNode }) {
  return <span className="mt-0.5 block text-xs text-slate-500">{children}</span>;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-slate-900 hover:underline hover:underline-offset-4">
      {children}
    </Link>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm text-slate-500 hover:text-slate-900 hover:underline hover:underline-offset-4">
      {children}
    </Link>
  );
}

/** Runs an action and turns a thrown error into a message for <ErrorNote>. Resolves to whether it succeeded. */
export async function attempt(fn: () => unknown, setError: (message: string | null) => void): Promise<boolean> {
  try {
    await fn();
    setError(null);
    return true;
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Something went wrong.');
    return false;
  }
}
