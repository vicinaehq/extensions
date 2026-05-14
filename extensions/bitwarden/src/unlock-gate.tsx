import { Action, ActionPanel, Form, showToast, Toast } from '@vicinae/api';
import { useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { BwNotInstalled, SecretToolNotInstalled } from './bw-not-installed';
import { VaultError } from './vault-error';
import * as bw from './bw-executor';
import { getErrorMessage } from './bw-executor';
import { checkSecretToolInstalled } from './secret-store';

export type GateUIState =
  | { kind: 'checking-bw' }
  | { kind: 'bw-not-installed' }
  | { kind: 'secret-tool-not-installed' }
  | { kind: 'logging-in' }
  | { kind: 'login-failed'; error: string }
  | { kind: 'needs-unlock'; error?: string }
  | { kind: 'unlocking' };

export type GateResult =
  | { kind: 'bw-not-installed' }
  | { kind: 'secret-tool-not-installed' }
  | { kind: 'logging-in' }
  | { kind: 'needs-unlock' }
  | { kind: 'ready' }
  | { kind: 'error'; title: string; message: string };

export async function checkBwGate(session: string | null): Promise<GateResult> {
  const [installed, stInstalled, statusResult] = await Promise.allSettled([
    bw.checkInstalled(),
    checkSecretToolInstalled(),
    bw.status(),
  ]);

  if (installed.status === 'rejected' || !installed.value) {
    return { kind: 'bw-not-installed' };
  }

  if (stInstalled.status === 'rejected' || !stInstalled.value) {
    return { kind: 'secret-tool-not-installed' };
  }

  if (statusResult.status === 'rejected') {
    return {
      kind: 'error',
      title: 'Bitwarden CLI failed to start',
      message: getErrorMessage(statusResult.reason),
    };
  }

  if (statusResult.value.status === 'unauthenticated') {
    return { kind: 'logging-in' };
  }

  if (session) return { kind: 'ready' };
  return { kind: 'needs-unlock' };
}

type GateSetState = (
  next:
    | { kind: 'unlocking' }
    | { kind: 'needs-unlock'; error?: string }
    | { kind: 'login-failed'; error: string },
) => void;

export function createUnlockCallbacks(
  setState: GateSetState,
  onUnlockReady: () => void,
): Pick<
  UnlockGateDeps,
  'onUnlockStart' | 'onUnlockReady' | 'onUnlockError' | 'onLoginReady' | 'onLoginError'
> {
  return {
    onUnlockStart: () => setState({ kind: 'unlocking' }),
    onUnlockReady,
    onUnlockError: (error) => setState({ kind: 'needs-unlock', error }),
    onLoginReady: () => setState({ kind: 'needs-unlock' }),
    onLoginError: (error) => setState({ kind: 'login-failed', error }),
  };
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

interface GateState {
  kind: string;
  error?: string;
  title?: string;
  message?: string;
  retry?: () => void;
}

export function renderGate(
  state: GateState,
  handleUnlock: (values: Form.Values) => Promise<void>,
  handleLogin?: () => void,
): React.ReactElement | null {
  if (state.kind === 'error') {
    return (
      <VaultError
        title={state.title ?? 'Something went wrong'}
        message={state.message ?? ''}
        retry={state.retry}
      />
    );
  }
  const gateError =
    state.kind === 'needs-unlock' || state.kind === 'login-failed' ? state.error : undefined;
  return renderUnlockGate(state.kind, gateError, handleUnlock, handleLogin);
}

/**
 * Render the gate UI for a form-based command, or the loading placeholder
 * while gate state is resolving. Returns null when the form itself should render.
 */
export function renderFormGate(
  state: GateState,
  handleUnlock: (values: Form.Values) => Promise<void>,
  handleLogin?: () => void,
): React.ReactElement | null {
  const gate = renderGate(state, handleUnlock, handleLogin);
  if (gate) return gate;
  if (state.kind === 'checking-bw' || state.kind === 'logging-in') {
    return (
      <Form>
        <Form.Description text="Loading..." />
      </Form>
    );
  }
  return null;
}

export function renderUnlockGate(
  kind: string,
  error: string | undefined,
  onUnlock: (values: Form.Values) => Promise<void>,
  onRetryLogin?: () => void,
) {
  if (kind === 'bw-not-installed') return <BwNotInstalled />;

  if (kind === 'secret-tool-not-installed') return <SecretToolNotInstalled />;

  if (kind === 'login-failed') {
    return (
      <VaultError
        title="Login failed"
        message={error ?? 'Check your API key in extension preferences'}
        retry={onRetryLogin}
      />
    );
  }

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

interface GateSetterPayload {
  kind: string;
  error?: string;
  title?: string;
  message?: string;
  retry?: () => void;
}

interface UseGateEffectsParams {
  session: string | null;
  state: { kind: string };
  loginIfNeeded: () => Promise<void>;
  loginError: string | null;
  unlock: (password: string) => Promise<string>;
  setState: (value: GateSetterPayload) => void;
  readyKind: string;
}

export function castGateSetter<T extends { kind: string }>(
  setState: Dispatch<SetStateAction<T>>,
): (value: GateSetterPayload) => void {
  return (value) => setState(value as T);
}

export function useGateEffects(params: UseGateEffectsParams) {
  const { session, state, loginIfNeeded, loginError, unlock, setState, readyKind } = params;

  const { handleLogin, handleUnlock } = useUnlockGate({
    loginIfNeeded,
    loginError,
    unlock,
    ...createUnlockCallbacks(setState, () => setState({ kind: readyKind })),
  });

  useEffect(() => {
    void (async () => {
      const gate = await checkBwGate(session);
      switch (gate.kind) {
        case 'bw-not-installed':
        case 'secret-tool-not-installed':
        case 'logging-in':
        case 'needs-unlock':
          setState({ kind: gate.kind });
          return;
        case 'ready':
          setState({ kind: readyKind });
          return;
        case 'error':
          setState({ kind: 'error', title: gate.title, message: gate.message });
          return;
      }
    })();
  }, []);

  useEffect(() => {
    if (!session) return;
    if (state.kind !== 'needs-unlock') return;
    setState({ kind: readyKind });
  }, [session, state.kind]);

  useEffect(() => {
    if (state.kind !== 'logging-in') return;
    void handleLogin();
  }, [state.kind]);

  return { handleLogin, handleUnlock };
}
