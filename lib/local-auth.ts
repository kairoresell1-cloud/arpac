import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { localEncryptionKey, readStandalone } from './demo';
import { verifyPassword } from './local-team';

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

export async function authenticateLocal(email: string, password: string): Promise<string | null> {
  if (validCredentials(email, password)) return 'owner';
  const account = (await readStandalone()).accounts?.find(
    (a) => a.email === email.trim().toLowerCase(),
  );
  return account && (await verifyPassword(password, account.passwordHash)) ? account.id : null;
}

async function signature(payload: string, id = 'owner') {
  const owner = credentials();
  const account =
    id === 'owner' ? null : (await readStandalone()).accounts?.find((a) => a.id === id);
  if (id !== 'owner' && !account) return null;
  return createHmac('sha256', Buffer.from(await localEncryptionKey(), 'base64'))
    .update(
      JSON.stringify(
        account
          ? ['arpac-member-session-v1', account.id, account.passwordHash, payload]
          : ['arpac-session-v1', owner.email, owner.password, payload],
      ),
    )
    .digest('base64url');
}

export async function createSession(now = Date.now(), userId = 'owner') {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(now / 1000) + sessionMaxAge,
      nonce: randomBytes(24).toString('base64url'),
    }),
  ).toString('base64url');
  const sig = await signature(payload, userId);
  if (!sig) throw new Error('Account non disponibile.');
  return payload + '.' + sig;
}

export async function sessionUserId(
  token: string | undefined,
  now = Date.now(),
): Promise<string | null> {
  if (!token || token.length > 1024) return null;
  const parts = token.split('.');
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[1])
  )
    return null;
  let id: string;
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (
      typeof p.sub !== 'string' ||
      p.sub.length > 100 ||
      !Number.isInteger(p.exp) ||
      p.exp <= Math.floor(now / 1000)
    )
      return null;
    id = p.sub;
  } catch {
    return null;
  }
  const sig = await signature(parts[0], id);
  return sig && equal(parts[1], sig) ? id : null;
}

export async function validSession(token: string | undefined, now = Date.now()) {
  return !!(await sessionUserId(token, now));
}
