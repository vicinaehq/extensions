import { Action, ActionPanel, Form, showToast, Toast } from '@vicinae/api';
import { useCallback, useEffect, useRef } from 'react';
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
  const {
    loginIfNeeded,
    loginError,
    unlock,
    onUnlockStart,
    onUnlockReady,
    onUnlockError,
    onLoginReady,
    onLoginError,
  } = deps;

  const handleLogin = useCallback(async () => {
    try {
      await loginIfNeeded();
      onLoginReady();
    } catch {
      const message = loginError ?? 'Login failed — check preferences';
      onLoginError(message);
      showToast({
        style: Toast.Style.Failure,
        title: 'Login failed',
        message: loginError ?? 'Check your API key in preferences',
      });
    }
  }, [loginIfNeeded, loginError, onLoginReady, onLoginError]);

  const handleUnlock = useCallback(
    async (values: Form.Values) => {
      onUnlockStart();
      const password = String(values.password ?? '');
      try {
        await unlock(password);
        onUnlockReady();
      } catch (err) {
        const message = getErrorMessage(err);
        if (message.toLowerCase().includes('not logged in')) {
          try {
            await loginIfNeeded();
            await unlock(password);
            onUnlockReady();
            return;
          } catch (retryErr) {
            onUnlockError(getErrorMessage(retryErr));
            return;
          }
        }
        onUnlockError(message);
      }
    },
    [unlock, loginIfNeeded, onUnlockStart, onUnlockReady, onUnlockError],
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
  onClearError?: () => void,
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
  return renderUnlockGate(state.kind, gateError, handleUnlock, handleLogin, onClearError);
}

/**
 * Render the gate UI for a form-based command, or the loading placeholder
 * while gate state is resolving. Returns null when the form itself should render.
 */
export function renderFormGate(
  state: GateState,
  handleUnlock: (values: Form.Values) => Promise<void>,
  handleLogin?: () => void,
  onClearError?: () => void,
): React.ReactElement | null {
  const gate = renderGate(state, handleUnlock, handleLogin, onClearError);
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
  onClearError?: () => void,
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
          onChange={
            kind === 'needs-unlock' && error && onClearError ? () => onClearError() : undefined
          }
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
  const optimisticRef = useRef(false);

  const { handleLogin, handleUnlock } = useUnlockGate({
    loginIfNeeded,
    loginError,
    unlock,
    ...createUnlockCallbacks(setState, () => setState({ kind: readyKind })),
  });

  const clearGateError = useCallback(() => {
    setState({ kind: 'needs-unlock' });
  }, [setState]);

  useEffect(() => {
    void (async () => {
      if (!session) {
        optimisticRef.current = true;
        setState({ kind: 'needs-unlock' });
      }

      const gate = await checkBwGate(session);
      switch (gate.kind) {
        case 'bw-not-installed':
        case 'secret-tool-not-installed':
          setState({ kind: gate.kind });
          return;
        case 'logging-in':
          if (optimisticRef.current) {
            void loginIfNeeded().catch(() => {
              setState({
                kind: 'login-failed',
                error: loginError ?? 'Login failed — check preferences',
              });
            });
          } else {
            setState({ kind: gate.kind });
          }
          return;
        case 'needs-unlock':
          if (!optimisticRef.current) setState({ kind: gate.kind });
          return;
        case 'ready':
          setState({ kind: readyKind });
          return;
        case 'error':
          setState({ kind: 'error', title: gate.title, message: gate.message });
          return;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session) return;
    if (state.kind !== 'needs-unlock') return;
    setState({ kind: readyKind });
  }, [session, state.kind, readyKind, setState]);

  useEffect(() => {
    if (state.kind !== 'logging-in') return;
    void handleLogin();
  }, [state.kind, handleLogin]);

  return { handleLogin, handleUnlock, clearGateError };
}
