import { $ } from 'execa';

/**
 * Checks if Do Not Disturb mode is enabled.
 * @returns A promise that resolves to true if DND is enabled, false otherwise.
 */
export async function isDNDEnabled(): Promise<boolean> {
  const { stdout } = await $('gsettings', [
    'get',
    'org.gnome.desktop.notifications',
    'show-banners',
  ]);

  console.log('gsettings output:', stdout);

  return stdout.trim() === 'false';
}

/**
 * Toggles the Do Not Disturb mode.
 * @returns A promise that resolves when the operation is complete.
 */
export async function toggleDND(): Promise<void> {
  const currentlyEnabled = await isDNDEnabled();
  const newValue = currentlyEnabled ? 'true' : 'false';
  await $('gsettings', [
    'set',
    'org.gnome.desktop.notifications',
    'show-banners',
    newValue,
  ]);
}
