// fallow-ignore-file unused-file
import { Clipboard, closeMainWindow, showHUD, showToast, Toast } from '@vicinae/api';
import * as bw from './bw-executor';
import { getErrorMessage } from './bw-executor';
import { getDownloadDir, getPreferences } from './preferences';

async function handleReceiveError(err: unknown): Promise<boolean> {
  if (isPasswordError(err)) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Send is password-protected',
      message: 'Use the CLI with --passwordenv: bw send receive <url> --passwordenv BW_PASSWORD',
    });
    return true;
  }
  if (isEmailVerificationError(err)) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Email verification required',
      message:
        'This Send requires email verification, which is a premium feature not supported here.',
    });
    return true;
  }
  return false;
}

function getDownloadDirectory(): string {
  try {
    return getDownloadDir(getPreferences());
  } catch {
    return `${process.env.HOME ?? '/tmp'}/Downloads`;
  }
}

export default async function ReceiveSend() {
  let url = '';
  try {
    url = (await Clipboard.readText()).trim();
  } catch {
    // clipboard read failed
  }

  if (!url) {
    await showHUD('No Send URL in clipboard');
    return;
  }

  try {
    const result = await bw.receiveSend(url);

    if (result.kind === 'text' && result.text) {
      await Clipboard.copy(result.text);
      const preview = result.text.length > 100 ? `${result.text.slice(0, 100)}…` : result.text;
      await closeMainWindow();
      await showHUD(`Send text copied: ${preview}`);
      return;
    }
  } catch (textErr) {
    if (await handleReceiveError(textErr)) return;
    // Text receive failed, try file receive
  }

  try {
    const downloadDir = getDownloadDirectory();
    const result = await bw.receiveSend(url, undefined, downloadDir);

    if (result.kind === 'file' && result.path) {
      await closeMainWindow();
      await showHUD(`File saved: ${result.path}`);
      return;
    }
  } catch (fileErr) {
    if (await handleReceiveError(fileErr)) return;
    const message = getErrorMessage(fileErr);
    await showToast({
      style: Toast.Style.Failure,
      title: 'Failed to receive send',
      message,
    });
  }
}

function isPasswordError(err: unknown): boolean {
  const message = getErrorMessage(err).toLowerCase();
  return (
    message.includes('password') &&
    (message.includes('required') || message.includes('protected') || message.includes('incorrect'))
  );
}

function isEmailVerificationError(err: unknown): boolean {
  const message = getErrorMessage(err).toLowerCase();
  return message.includes('email') && message.includes('verify');
}
