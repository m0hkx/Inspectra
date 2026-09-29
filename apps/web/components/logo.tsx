import Link from 'next/link';

export function Logo({ href = '/dashboard' }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-[0.9375rem] font-bold tracking-tight"
    >
      <span className="grid size-8 place-items-center rounded-xl bg-slate-900">
        <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden>
          <path
            d="M4 1h6l3 3v13H1V4z"
            fill="none"
            stroke="white"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="7" cy="4.5" r="1.3" fill="white" />
          <path
            d="M4.2 10.5l1.9 1.9 3.7-4"
            fill="none"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      Inspectra
    </Link>
  );
}
