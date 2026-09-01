/** HTML fallback when an external OAuth redirect must not be intercepted by the app router. */
export function oauthRedirectHtmlPage(targetUrl: string, serviceLabel: string): string {
  const safeUrl = JSON.stringify(targetUrl);
  const href = targetUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Redirecting to ${serviceLabel}</title>
  <meta http-equiv="refresh" content="0;url=${href}"/>
  <script>location.replace(${safeUrl});</script>
</head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.5">
  <p>Redirecting to <strong>${serviceLabel}</strong>…</p>
  <p><a href="${href}">Continue</a> if nothing happens.</p>
</body>
</html>`;
}
