// fallow-ignore-file unused-file
import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  popToRoot,
  showInFileBrowser,
  showToast,
  Toast,
} from '@vicinae/api';
import { useCallback, useEffect, useState } from 'react';
import { renameSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as bw from './bw-executor';
import { getErrorMessage } from './bw-executor';
import { getDownloadDir, getPreferences } from './preferences';
import { VaultError } from './vault-error';
import { logError } from './log';

type UIState =
  | { kind: 'working' }
  | { kind: 'password'; url: string; retry?: boolean }
  | { kind: 'error'; url: string; message: string }
  | { kind: 'done' };

function getDownloadDirectory(): string {
  try {
    return getDownloadDir(getPreferences());
  } catch {
    return `${process.env.HOME ?? '/tmp'}/Downloads`;
  }
}

function moveToDownloads(sourcePath: string, downloadDir: string): string {
  const fileName = basename(sourcePath);
  const destPath = join(downloadDir, fileName);
  try {
    renameSync(sourcePath, destPath);
    return destPath;
  } catch {
    return sourcePath;
  }
}

async function deliverResult(result: { kind: 'text' | 'file'; text?: string; path?: string }) {
  if (result.kind === 'file' && result.path) {
    const finalPath = moveToDownloads(result.path, getDownloadDirectory());
    await showToast({ style: Toast.Style.Success, title: 'File downloaded', message: finalPath });
    showInFileBrowser(finalPath).catch(() => {});
    return;
  }
  if (result.kind === 'text' && result.text) {
    await Clipboard.copy(result.text);
    await showToast({ style: Toast.Style.Success, title: 'Text copied' });
  }
}

function isPasswordError(err: unknown): boolean {
  const message = getErrorMessage(err).toLowerCase();
  return (
    message.includes('password') &&
    (message.includes('required') || message.includes('protected') || message.includes('incorrect'))
  );
}

function isIncorrectPassword(err: unknown): boolean {
  return getErrorMessage(err).toLowerCase().includes('incorrect');
}

function isEmailVerificationError(err: unknown): boolean {
  const message = getErrorMessage(err).toLowerCase();
  return message.includes('email') && message.includes('verify');
}

function isNotFoundError(err: unknown): boolean {
  return getErrorMessage(err).toLowerCase().includes('not found');
}

function isMaxAccessError(err: unknown): boolean {
  return getErrorMessage(err).toLowerCase().includes('max access count');
}

function isExpiredError(err: unknown): boolean {
  return getErrorMessage(err).toLowerCase().includes('expired');
}

async function handleKnownErrors(err: unknown): Promise<boolean> {
  if (isEmailVerificationError(err)) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Email verification required',
      message:
        'This Send requires email verification, which is a premium feature not supported here.',
    });
    return true;
  }
  if (isNotFoundError(err)) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Send not found',
      message: 'This Send no longer exists — it may have been deleted or the URL is incomplete.',
    });
    return true;
  }
  if (isMaxAccessError(err)) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Access limit reached',
      message: 'This Send has already been accessed the maximum number of times.',
    });
    return true;
  }
  if (isExpiredError(err)) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Send expired',
      message: 'This Send has expired and is no longer available.',
    });
    return true;
  }
  return false;
}

export default function ReceiveSend() {
  const [state, setState] = useState<UIState>({ kind: 'working' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const attempt = useCallback(async (url: string, password?: string) => {
    try {
      const result = await bw.receiveSend(url, password);
      await deliverResult(result);
      setState({ kind: 'done' });
      await popToRoot();
      return;
    } catch (err) {
      if (isPasswordError(err)) {
        setState({
          kind: 'password',
          url,
          retry: password !== undefined && isIncorrectPassword(err),
        });
        return;
      }
      if (await handleKnownErrors(err)) {
        setState({ kind: 'done' });
        await popToRoot();
        return;
      }
      setState({ kind: 'error', url, message: getErrorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void (async () => {
      let url = '';
      try {
        url = (await Clipboard.readText()).trim();
      } catch (err) {
        logError('receive-send.clipboard', err);
      }
      if (!url) {
        await showToast({ style: Toast.Style.Failure, title: 'No Send URL in clipboard' });
        await popToRoot();
        return;
      }
      await attempt(url);
    })();
  }, [attempt]);

  if (state.kind === 'error') {
    return (
      <VaultError
        title="Failed to receive send"
        message={state.message}
        retry={() => {
          setState({ kind: 'working' });
          void attempt(state.url);
        }}
      />
    );
  }

  if (state.kind !== 'password') {
    return <Form isLoading />;
  }

  const handleSubmit = async (values: Form.Values) => {
    const password = String(values.password ?? '');
    if (!password) return;
    setIsSubmitting(true);
    await attempt(state.url, password);
    setIsSubmitting(false);
  };

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Unlock Send" icon={Icon.Key} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Password Required"
        text={
          state.retry
            ? 'Incorrect password. Try again.'
            : 'This Send is password-protected. Enter the password to receive it.'
        }
      />
      <Form.PasswordField id="password" title="Password" autoFocus />
    </Form>
  );
}
