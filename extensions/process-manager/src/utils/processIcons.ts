import { Icon } from '@vicinae/api';
import freedesktopIcons from 'freedesktop-icons';
import Finder from 'xdg-apps';
import type { Process } from '../hooks/useProcesses';

const iconCache = new Map<string, string>();
const processNameToIcon = new Map<string, string>();
let desktopEntriesLoaded = false;

async function loadDesktopEntries() {
  if (desktopEntriesLoaded) return;

  try {
    const finder = new Finder('desktop');
    await finder.entries.refresh();
    const entries = await finder.entries.getEntries();

    for (const [_, data] of Object.entries(entries)) {
      const entry = data['Desktop Entry'];
      if (!entry?.Exec || !entry.Icon) continue;

      let exec = entry.Exec.replace(/%[fFuUdDnNickvm]/g, '').trim();

      // Flatpak: --command= and app ID
      if (exec.includes('flatpak run')) {
        const cmd = exec.match(/--command=([^\s]+)/);
        if (cmd) processNameToIcon.set(cmd[1].toLowerCase(), entry.Icon);

        const appId = exec.match(/flatpak\s+run\s+(?:--[^\s]+\s+)*([a-zA-Z0-9._-]+)/);
        if (appId) {
          const shortName = appId[1].split('.').pop();
          if (shortName) processNameToIcon.set(shortName.toLowerCase(), entry.Icon);
        }
      }

      // Extract base executable
      const baseName = exec.split(' ')[0].split('/').pop();
      if (baseName) processNameToIcon.set(baseName.toLowerCase(), entry.Icon);
    }
  } catch (err) {
    console.error('Failed to load desktop entries:', err);
  }

  desktopEntriesLoaded = true;
}

export async function getProcessIcon(process: Process): Promise<string> {
  if (iconCache.has(process.name)) return iconCache.get(process.name)!;

  await loadDesktopEntries();

  const iconName = processNameToIcon.get(process.name.toLowerCase());
  if (iconName) {
    try {
      const iconPath = await freedesktopIcons({ name: iconName, size: 128 });
      if (iconPath) {
        iconCache.set(process.name, iconPath);
        return iconPath;
      }
    } catch (err) {
      console.error(`Failed to load icon for ${process.name} (${iconName}):`, err);
    }
  }

  iconCache.set(process.name, Icon.Gear);
  return Icon.Gear;
}
