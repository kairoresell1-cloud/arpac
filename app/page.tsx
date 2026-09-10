import { snapshot } from '@/lib/store';
import Workspace from '@/components/workspace';
import Login from '@/components/login';
import { isStandalone } from '@/lib/demo';
import { AuthRequiredError, LocalStorageError } from '@/lib/errors';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let state;
  let error = '';
  try {
    state = await snapshot();
  } catch (e) {
    state = null;
    if (!(e instanceof AuthRequiredError))
      error =
        e instanceof LocalStorageError
          ? e.message
          : 'Impossibile aprire il workspace. Riprova tra poco.';
  }
  return state ? (
    <Workspace initial={state} />
  ) : (
    <Login
      configured={!!process.env.NEXT_PUBLIC_SUPABASE_URL}
      standalone={isStandalone()}
      initialError={error}
    />
  );
}
