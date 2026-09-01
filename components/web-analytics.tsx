import Script from 'next/script';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

function gaMeasurementId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (!raw || raw === 'replace-me') return null;
  return raw;
}

/** Vercel Web Analytics + Speed Insights; optional GA4 when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set. */
export function WebAnalytics() {
  const gaId = gaMeasurementId();

  return (
    <>
      <Analytics />
      <SpeedInsights />
      {gaId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="dash-google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}', { anonymize_ip: true });
            `}
          </Script>
        </>
      ) : null}
    </>
  );
}
