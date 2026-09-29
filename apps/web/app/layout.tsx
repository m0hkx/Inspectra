import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { ClerkAuthBridge } from '@/lib/auth';
import { clerkAppearance, clerkEnabled } from '@/lib/auth-config';
import { StoreProvider } from '@/lib/store';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'Inspectra',
  description:
    'Schedule equipment inspections, turn failed checks into work orders, and prove what was fixed.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const app = (
    <StoreProvider>
      <AppShell>{children}</AppShell>
    </StoreProvider>
  );
  return (
    <html lang="en" className={manrope.variable}>
      <body className="font-sans antialiased">
        {/* Without a publishable key there is no Clerk at all: demo logins only. */}
        {clerkEnabled ? (
          <ClerkProvider appearance={clerkAppearance}>
            <ClerkAuthBridge>{app}</ClerkAuthBridge>
          </ClerkProvider>
        ) : (
          app
        )}
      </body>
    </html>
  );
}
