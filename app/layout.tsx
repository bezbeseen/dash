import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import React from 'react';
import { BootstrapClient } from '@/components/bootstrap-client';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Dash',
  description: 'QuickBooks-backed production board — estimates, invoices, and shop flow in one view.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BootstrapClient />
        {children}
      </body>
    </html>
  );
}
