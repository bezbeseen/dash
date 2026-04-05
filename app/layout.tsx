import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.css';
import '@/styles/maxton/assets/plugins/perfect-scrollbar/css/perfect-scrollbar.css';
import '@/styles/maxton/assets/plugins/metismenu/metisMenu.min.css';
import '@/styles/maxton/assets/plugins/metismenu/mm-vertical.css';
import '@/styles/maxton/assets/css/bootstrap-extended.css';
import '@/styles/maxton/sass/main.css';
import '@/styles/maxton/sass/dark-theme.css';
import '@/styles/maxton/sass/blue-theme.css';
import '@/styles/maxton/sass/semi-dark.css';
import '@/styles/maxton/sass/bordered-theme.css';
import '@/styles/maxton/sass/responsive.css';
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
  icons: {
    icon: [{ url: '/maxton/logo-icon.png', type: 'image/png' }],
    apple: '/maxton/logo-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-bs-theme="light" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet" />
      </head>
      <body>
        <BootstrapClient />
        {children}
      </body>
    </html>
  );
}
