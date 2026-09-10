import type { Item, Role } from './types';
export function canRead(item: Item, userId: string, projectIds: string[]) {
  return (
    (!item.project_id || projectIds.includes(item.project_id)) &&
    (!item.owner_id || item.owner_id === userId)
  );
}
export function requireOwner(role: Role) {
  if (role !== 'owner') throw new Error('Solo l’owner può approvare questa operazione.');
}
export function canTransition(from: string, to: string, role: Role, assigned: boolean) {
  if (role === 'viewer') return false;
  if (from === 'proposto') return role === 'owner' && ['approvato', 'annullato'].includes(to);
  if (to === 'approvato') return false;
  if (!assigned && role !== 'owner' && role !== 'admin') return false;
  const map: Record<string, string[]> = {
    approvato: ['in corso', 'bloccato', 'annullato'],
    'in corso': ['in revisione', 'bloccato'],
    'in revisione': ['completato', 'in corso', 'bloccato'],
    bloccato: ['in corso', 'annullato'],
    completato: [],
    annullato: [],
  };
  return (
    (map[from] || []).includes(to) && (to !== 'completato' || role === 'owner' || role === 'admin')
  );
}
export function canEditMemory(role: Role) {
  return role === 'owner' || role === 'admin';
}
