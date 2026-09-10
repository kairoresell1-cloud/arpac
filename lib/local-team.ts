import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { item, mutateStandalone } from './demo';
import type { LocalWorkspace, Role, Snapshot } from './types';
import { canRead } from './rules';

const derive = promisify(scrypt);
export const ownerEmail = () =>
  (process.env.OWNER_EMAIL || 'owner@arpac.local').trim().toLowerCase();

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await derive(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split(':');
  if (
    scheme !== 'scrypt' ||
    !/^[a-f0-9]{32}$/.test(salt || '') ||
    !/^[a-f0-9]{128}$/.test(hash || '')
  )
    return false;
  return timingSafeEqual((await derive(password, salt, 64)) as Buffer, Buffer.from(hash, 'hex'));
}

export function projectMembers(s: LocalWorkspace, id: string) {
  return s.projectMembers?.[id] || s.profiles.map((p) => p.id);
}

export function snapshotFor(s: LocalWorkspace, id: string): Snapshot {
  const user = s.profiles.find((p) => p.id === id);
  const role: Role | undefined =
    id === s.user.id ? 'owner' : s.accounts?.find((a) => a.id === id)?.role;
  if (!user || !role) throw new Error('Account non disponibile.');
  const projects = s.items
    .filter(
      (i) => i.kind === 'project' && (role === 'owner' || projectMembers(s, i.id).includes(id)),
    )
    .map((i) => i.id);
  const items = s.items.filter((i) => {
    if (i.kind === 'project') return projects.includes(i.id);
    if (['financial_entry', 'financial_proposal'].includes(i.kind))
      return !i.owner_id || i.owner_id === id;
    return canRead(i, id, projects);
  });
  // Explicit allowlist: account hashes and project access lists never leave the server.
  return { items, user, profiles: s.profiles, role, demo: false, storage: 'local', ai: s.ai };
}

export async function createLocalMember(input: {
  email: string;
  password: string;
  name: string;
  role: Exclude<Role, 'owner'>;
  project_ids: string[];
}) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  return mutateStandalone((s) => {
    if (email === ownerEmail() || s.accounts?.some((a) => a.email === email))
      throw new Error('Esiste già un account con questa email.');
    if (s.profiles.length >= 50) throw new Error('Il team ha raggiunto il limite di 50 membri.');
    for (const id of input.project_ids)
      if (!s.items.some((i) => i.kind === 'project' && i.id === id))
        throw new Error('Progetto non disponibile.');
    const id = randomUUID();
    s.accounts ??= [];
    s.projectMembers ??= {};
    // Freeze legacy access lists before adding the new profile.
    for (const project of s.items.filter((i) => i.kind === 'project'))
      s.projectMembers[project.id] ??= s.profiles.map((p) => p.id);
    s.accounts.push({ id, email, passwordHash, role: input.role });
    s.profiles.push({
      id,
      name: input.name,
      avatar: input.name.slice(0, 2).toUpperCase(),
      bio: '',
      skills: '',
      availability: '',
      onboarded: false,
    });
    for (const project of input.project_ids) s.projectMembers[project].push(id);
    s.items.push(
      item('invite', 'Account creato', email, { owner_id: s.user.id, data: { user_id: id } }),
    );
    return { id, email, name: input.name };
  });
}
