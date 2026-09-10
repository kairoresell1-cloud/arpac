// Next receives an internal URL behind Railway's HTTPS proxy.
export function publicOrigin(req: Request) {
  if (process.env.APP_URL) return new URL(process.env.APP_URL).origin;
  if (process.env.RAILWAY_PUBLIC_DOMAIN)
    return new URL('https://' + process.env.RAILWAY_PUBLIC_DOMAIN).origin;
  const url = new URL(req.url);
  // Standalone Next may use its listening address (0.0.0.0) in req.url.
  // Host is the origin actually requested by the browser.
  const host = req.headers.get('host');
  if (host) url.host = host;
  return url.origin;
}

export function requireSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== publicOrigin(req)) throw new Error('Origine non autorizzata.');
}
