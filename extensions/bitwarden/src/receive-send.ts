// fallow-ignore-file unused-file
import { Clipboard, showHUD, showInFileBrowser, showToast, Toast } from '@vicinae/api';
import { renameSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as bw from './bw-executor';
import { getErrorMessage } from './bw-executor';
import { getDownloadDir, getPreferences } from './preferences';

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

    if (result.kind === 'file' && result.path) {
      const finalPath = moveToDownloads(result.path, getDownloadDirectory());
      await showToast({
        style: Toast.Style.Success,
        title: 'File downloaded',
        message: finalPath,
      });
      showInFileBrowser(finalPath).catch(() => {});
      return;
    }

    if (result.kind === 'text' && result.text) {
      await Clipboard.copy(result.text);
      await showToast({
        style: Toast.Style.Success,
        title: 'Text copied',
      });
      return;
    }
  } catch (err) {
    if (await handleReceiveError(err)) return;
    const message = getErrorMessage(err);
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

function isNotFoundError(err: unknown): boolean {
  return getErrorMessage(err).toLowerCase().includes('not found');
}

function isMaxAccessError(err: unknown): boolean {
  return getErrorMessage(err).toLowerCase().includes('max access count');
}

function isExpiredError(err: unknown): boolean {
  return getErrorMessage(err).toLowerCase().includes('expired');
}
