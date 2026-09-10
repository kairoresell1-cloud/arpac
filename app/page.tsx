import { snapshot } from '@/lib/store';
import Workspace from '@/components/workspace';
import Login from '@/components/login';
import { isStandalone } from '@/lib/demo';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let state;
  try {
    state = await snapshot();
  } catch {
    state = null;
  }
  return state ? (
    <Workspace initial={state} />
  ) : (
    <Login configured={!!process.env.NEXT_PUBLIC_SUPABASE_URL} standalone={isStandalone()} />
  );
}
