import Script from 'next/script';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

function gaMeasurementId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (!raw || raw === 'replace-me') return null;
  return raw;
}

function clarityProjectId(): string | null {
  const raw = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim();
  if (!raw || raw === 'replace-me') return null;
  return raw;
}

/**
 * Vercel Web Analytics + Speed Insights, plus optional GA4
 * (`NEXT_PUBLIC_GA_MEASUREMENT_ID`) and Microsoft Clarity (`NEXT_PUBLIC_CLARITY_PROJECT_ID`).
 */
export function WebAnalytics() {
  const gaId = gaMeasurementId();
  const clarityId = clarityProjectId();

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
      {clarityId ? (
        <Script id="dash-microsoft-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${clarityId}");
          `}
        </Script>
      ) : null}
    </>
  );
}
