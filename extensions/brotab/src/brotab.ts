import { getPreferenceValues } from '@vicinae/api';
import { $ } from 'execa';
import { type Tab } from './types';

const preferences = getPreferenceValues<{ brotabPath: string }>();

const btCommand = preferences.brotabPath || 'bt';

// Check if 'bt' command-line tool is installed
export async function isBtInstalled(): Promise<boolean> {
  try {
    await $(btCommand, ['-h']);
  } catch (error) {
    console.error('Brotab check failed:', error);
    return false;
  }

  return true;
}

// List Brotab tabs.
// Brotab outputs tab in this format:
// a.1.77  💤 Amazon.com : beelink ser8    https://www.amazon.com/s?k=beelink%20ser8
export async function getTabs(): Promise<Tab[]> {
  const { stdout } = await $(btCommand, ['list']);

  const outputLines = stdout
    .split('\n')
    .filter((line: string) => line.trim() !== '');

  const tabsList: Tab[] = [];
  for (const line of outputLines) {
    const parts = line.split('\t');
    if (parts.length < 3) {
      continue;
    }

    if (!parts[0] || !parts[1] || !parts[2]) {
      continue;
    }
    const idAndIcon = parts[0].trim().split(' ');
    const id = idAndIcon[0] ?? '';
    const title = parts[1]?.trim() ?? '';
    const url = parts[2]?.trim() ?? '';

    tabsList.push({ id, title, url });
  }

  return tabsList;
}

/**
 * Close a tab by its ID.
 * @param tabId The ID of the tab to close.
 */
export async function closeTab(tabId: string): Promise<void> {
  await $(btCommand, ['close', tabId]);
}

/**
 * Activate (focus) a tab by its ID and bring its window to the foreground.
 * @param tabId The ID of the tab to activate.
 */
export async function activateTab(tabId: string): Promise<void> {
  await $(btCommand, ['activate', tabId, '--focused']);
}
