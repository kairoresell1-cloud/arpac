// Next receives an internal URL behind Railway's HTTPS proxy.
export function publicOrigin(req: Request) {
  // Railway's public domain must win over an old local APP_URL left in the
  // service variables. Otherwise browser requests arrive from Railway while
  // CSRF checks still compare them with http://localhost:3000.
  const configuredAppUrl = process.env.APP_URL?.trim();
  const isLocalAppUrl = configuredAppUrl
    ? /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\/?\s*$/i.test(configuredAppUrl)
    : false;
  if (process.env.RAILWAY_PUBLIC_DOMAIN && (!configuredAppUrl || isLocalAppUrl))
    return new URL('https://' + process.env.RAILWAY_PUBLIC_DOMAIN).origin;
  if (configuredAppUrl) return new URL(configuredAppUrl).origin;
  const url = new URL(req.url);
  // Standalone Next may use its listening address (0.0.0.0) in req.url.
  // Host is the origin actually requested by the browser.
  const host = req.headers.get('host');
  if (host) url.host = host;
  return url.origin;
}

export function requireSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  // Se l'Origin manca (richiesta same-origin navigate o browser meno recente)
  // la protezione CSRF è già garantita dal cookie SameSite=lax — lasciamo passare.
  // Se l'Origin c'è ed è diverso dall'origine pubblica attesa, blocchiamo.
  if (origin && origin !== publicOrigin(req)) throw new Error('Origine non autorizzata.');
}
