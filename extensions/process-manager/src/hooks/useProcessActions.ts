import { useCallback } from 'react';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  confirmAlert,
  showToast,
  Toast,
  Action,
  clearSearchBar,
  closeMainWindow,
  getPreferenceValues,
} from '@vicinae/api';
import { getErrorMessage } from '../utils';
import type { Process } from './useProcesses';
import type { PreferenceValues } from '../types/preferences';

const execAsync = promisify(exec);

export function useProcessActions(refreshProcesses: () => void) {
  const preferences = getPreferenceValues<PreferenceValues>();

  const killProcess = useCallback(
    async (process: Process, force: boolean = false) => {
      if (
        !(await confirmAlert({
          title: `${force ? 'Force ' : ''}Kill ${process.name}?`,
          message: `PID: ${process.pid}`,
          primaryAction: {
            title: force ? 'Force Kill' : 'Kill',
            style: Action.Style.Destructive,
          },
        }))
      ) {
        return;
      }

      try {
        await execAsync(`kill ${force ? '-9' : '-15'} ${process.pid}`);
        showToast({
          title: `Killed ${process.name}`,
          style: Toast.Style.Success,
        });

        refreshProcesses();

        if (preferences['close-window-after-kill']) closeMainWindow();
        if (preferences['clear-search-after-kill']) clearSearchBar({ forceScrollToTop: true });
      } catch (error) {
        showToast({
          title: 'Failed to kill process',
          message: getErrorMessage(error),
          style: Toast.Style.Failure,
        });
      }
    },
    [refreshProcesses, preferences]
  );

  function buildSubtitle(process: Process): string {
    return [
      preferences['show-pid'] && `PID ${process.pid}`,
      process.user,
      preferences['show-path'] && process.command,
    ]
      .filter(Boolean)
      .join(' • ');
  }

  return {
    killProcess,
    buildSubtitle,
  };
}
