import { Action, ActionPanel, Form, showToast, Toast } from '@vicinae/api';
import { useCallback } from 'react';
import { BwNotInstalled } from './bw-not-installed';
import * as bw from './bw-executor';
import { getErrorMessage } from './bw-executor';

export async function checkBwGate(
  session: string | null,
): Promise<
  | { kind: 'bw-not-installed' }
  | { kind: 'logging-in' }
  | { kind: 'needs-unlock' }
  | { kind: 'ready' }
> {
  const installed = await bw.checkInstalled();
  if (!installed) return { kind: 'bw-not-installed' };

  try {
    const st = await bw.status();
    if (st.status === 'unauthenticated') return { kind: 'logging-in' };
  } catch {
    // If status fails, proceed — session check will handle it
  }

  if (session) return { kind: 'ready' };
  return { kind: 'needs-unlock' };
}

interface UnlockGateDeps {
  loginIfNeeded: () => Promise<void>;
  loginError: string | null;
  unlock: (password: string) => Promise<string>;
  onUnlockStart: () => void;
  onUnlockReady: () => void;
  onUnlockError: (error: string) => void;
  onLoginReady: () => void;
  onLoginError: (error: string) => void;
}

export function useUnlockGate(deps: UnlockGateDeps) {
  const handleLogin = useCallback(async () => {
    try {
      await deps.loginIfNeeded();
      deps.onLoginReady();
    } catch {
      const message = deps.loginError ?? 'Login failed — check preferences';
      deps.onLoginError(message);
      showToast({
        style: Toast.Style.Failure,
        title: 'Login failed',
        message: deps.loginError ?? 'Check your API key in preferences',
      });
    }
  }, [deps.loginIfNeeded, deps.loginError, deps.onLoginReady, deps.onLoginError]);

  const handleUnlock = useCallback(
    async (values: Form.Values) => {
      deps.onUnlockStart();
      try {
        const password = String(values.password ?? '');
        await deps.unlock(password);
        deps.onUnlockReady();
      } catch (err) {
        const message = getErrorMessage(err);
        deps.onUnlockError(message);
      }
    },
    [deps.unlock, deps.onUnlockStart, deps.onUnlockReady, deps.onUnlockError],
  );

  return { handleLogin, handleUnlock };
}

export function renderUnlockGate(
  kind: string,
  error: string | undefined,
  onUnlock: (values: Form.Values) => Promise<void>,
) {
  if (kind === 'bw-not-installed') return <BwNotInstalled />;

  if (kind === 'needs-unlock' || kind === 'unlocking') {
    return (
      <Form
        isLoading={kind === 'unlocking'}
        actions={
          <ActionPanel>
            <Action.SubmitForm title="Unlock" onSubmit={onUnlock} />
          </ActionPanel>
        }
      >
        <Form.PasswordField
          id="password"
          title="Master Password"
          error={kind === 'needs-unlock' ? error : undefined}
        />
      </Form>
    );
  }

  return null;
}
