function normalizeUrl(raw: string): string {
  // Aggiunge https:// se manca il protocollo
  if (/^https?:\/\//i.test(raw)) return raw;
  return 'https://' + raw;
}

export function publicOrigin(req: Request) {
  const configuredAppUrl = process.env.APP_URL?.trim();
  const isLocalAppUrl = configuredAppUrl
    ? /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\/?$/i.test(configuredAppUrl)
    : false;

  if (process.env.RAILWAY_PUBLIC_DOMAIN && (!configuredAppUrl || isLocalAppUrl))
    return new URL(normalizeUrl(process.env.RAILWAY_PUBLIC_DOMAIN)).origin;

  if (configuredAppUrl && !isLocalAppUrl)
    return new URL(normalizeUrl(configuredAppUrl)).origin;

  // Fallback: ricava l'origine dall'host header della richiesta
  const host = req.headers.get('host');
  if (host) {
    const proto = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    return `${proto}://${host}`;
  }

  const url = new URL(req.url);
  return url.origin;
}

export function requireSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  // Se Origin manca (same-origin navigate) lascia passare — SameSite=lax copre già questo caso.
  // Se Origin è presente e diverso dall'atteso, blocca.
  if (origin && origin !== publicOrigin(req)) throw new Error('Origine non autorizzata.');
}
