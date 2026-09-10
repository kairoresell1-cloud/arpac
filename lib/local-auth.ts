import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { localEncryptionKey } from './demo';

export const sessionCookie = 'arpac_local_session';
export const sessionMaxAge = 60 * 60 * 24 * 7;

function credentials() {
  return {
    email: (process.env.OWNER_EMAIL || 'owner@arpac.local').trim().toLowerCase(),
    password: process.env.OWNER_PASSWORD || 'arpac-local-setup',
  };
}

function equal(a: string, b: string) {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}

export function validCredentials(email: string, password: string) {
  const owner = credentials();
  return equal(email.trim().toLowerCase(), owner.email) && equal(password, owner.password);
}

async function signature(payload: string) {
  const owner = credentials();
  return createHmac('sha256', Buffer.from(await localEncryptionKey(), 'base64'))
    .update(JSON.stringify(['arpac-session-v1', owner.email, owner.password, payload]))
    .digest('base64url');
}

export async function createSession(now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'owner',
      exp: Math.floor(now / 1000) + sessionMaxAge,
      nonce: randomBytes(24).toString('base64url'),
    }),
  ).toString('base64url');
  return payload + '.' + (await signature(payload));
}

export async function validSession(token: string | undefined, now = Date.now()) {
  if (!token || token.length > 1024) return false;
  const parts = token.split('.');
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[1])
  )
    return false;
  if (!equal(parts[1], await signature(parts[0]))) return false;
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return p.sub === 'owner' && Number.isInteger(p.exp) && p.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}
