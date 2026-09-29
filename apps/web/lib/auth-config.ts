/*
 * Kept out of the 'use client' auth module so the server layout reads real values,
 * not client references.
 */

/**
 * Clerk is on when the web app is built with a publishable key (and the API runs
 * with AUTH_MODE=clerk). Without one, sign-in is the one-click demo only.
 * `NEXT_PUBLIC_*` is inlined at build time, so this is a constant everywhere.
 */
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/** Clerk's sign-in and account UI in the app's monochrome palette (context/COLORS.md). */
export const clerkAppearance = {
  variables: {
    colorPrimary: '#141414',
    colorPrimaryForeground: '#ffffff',
    colorForeground: '#141414',
    colorMutedForeground: '#6b6b6b',
    colorBackground: '#ffffff',
    colorInput: '#ffffff',
    colorInputForeground: '#141414',
    colorNeutral: '#141414',
    colorDanger: '#d93036',
    colorSuccess: '#1e8c48',
    colorWarning: '#d98a0b',
    borderRadius: '0.75rem',
    fontFamily: 'var(--font-manrope), ui-sans-serif, system-ui, sans-serif',
  },
};
