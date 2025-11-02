import { showToast, Toast, LaunchProps } from '@vicinae/api';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface Arguments {
  processName: string;
}

export default async function Kill(props: LaunchProps<{ arguments: Arguments }>) {
  const { processName } = props.arguments;

  if (!processName?.trim()) {
    showToast({
      style: Toast.Style.Failure,
      title: 'Process name required',
    });
    return;
  }

  showToast({
    style: Toast.Style.Animated,
    title: `Killing ${processName}...`,
  });

  try {
    const { stdout } = await execAsync(`pgrep -f "${processName}"`);
    const pids = stdout.trim().split('\n').filter(Boolean);

    if (pids.length === 0) {
      showToast({
        style: Toast.Style.Failure,
        title: 'Process not found',
      });
      return;
    }

    // Kill all PIDs, ignore individual failures
    await Promise.all(pids.map(pid => execAsync(`kill -9 ${pid}`).catch(() => {})));

    showToast({
      style: Toast.Style.Success,
      title: `Killed ${pids.length} process(es)`,
      message: `PIDs: ${pids.join(', ')}`,
    });
  } catch (error) {
    showToast({
      style: Toast.Style.Failure,
      title: 'Process not found',
    });
  }
}
