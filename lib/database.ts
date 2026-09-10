import type { Item, Profile, Role } from './types';
type Table<Row, Insert = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: [];
};
export type Database = {
  public: {
    Tables: {
      records: Table<Item, Partial<Item> & Pick<Item, 'kind' | 'title'>>;
      profiles: Table<Profile, Partial<Profile> & Pick<Profile, 'id'>>;
      team_memberships: Table<{ user_id: string; role: Role }>;
      project_members: Table<{ project_id: string; user_id: string }>;
      ai_provider_settings: Table<{
        id: number;
        ciphertext: string;
        last4: string;
        model: string;
        updated_at: string;
      }>;
      ai_jobs: Table<{
        id: string;
        kind: string;
        payload: Record<string, unknown>;
        status: string;
        attempts: number;
        available_at: string;
        locked_at: string | null;
        created_at: string;
        dedup_key: string;
      }>;
      embeddings: Table<{
        record_id: string;
        project_id: string | null;
        owner_id: string | null;
        conversation_id: string | null;
        content: string;
        embedding: number[];
      }>;
      scheduler_state: Table<{ id: number; last_run: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      claim_job: {
        Args: Record<string, never>;
        Returns: Database['public']['Tables']['ai_jobs']['Row'][];
      };
      consume_rate: { Args: { p_actor: string }; Returns: boolean };
      approve_record: {
        Args: { p_id: string; p_actor: string; p_approve: boolean };
        Returns: undefined;
      };
      match_memories: {
        Args: {
          query_embedding: number[];
          p_project: string | null;
          p_owner: string | null;
          p_conversation: string;
        };
        Returns: { record_id: string; content: string; similarity: number }[];
      };
      set_project_members: {
        Args: { p_project: string; p_users: string[]; p_actor: string };
        Returns: undefined;
      };
      commit_ai_reply: { Args: { p_job: string; p_records: Item[] }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
