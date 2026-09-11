export type Role = 'owner' | 'admin' | 'membro' | 'viewer';
export type Item = {
  id: string;
  kind: string;
  title: string;
  body: string;
  project_id: string | null;
  conversation_id: string | null;
  owner_id: string | null;
  status: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
export type Profile = {
  id: string;
  name: string;
  avatar: string;
  skills: string;
  bio: string;
  availability: string;
  onboarded: boolean;
};
export type Snapshot = {
  items: Item[];
  profiles: Profile[];
  user: Profile;
  role: Role;
  demo: boolean;
  storage: 'demo' | 'local' | 'supabase';
  ai: { configured: boolean; last4: string; model: string };
  tavily?: { configured: boolean; last4: string };
  semanticCount?: number;
};
// Server-side storage only. Use snapshotFor before returning data to a client.
export type LocalWorkspace = Snapshot & {
  accounts?: { id: string; email: string; passwordHash: string; role: Exclude<Role, 'owner'> }[];
  projectMembers?: Record<string, string[]>;
  schedulerLastRun?: string;
};
export const taskStates = [
  'proposto',
  'approvato',
  'in corso',
  'in revisione',
  'completato',
  'bloccato',
  'annullato',
] as const;
