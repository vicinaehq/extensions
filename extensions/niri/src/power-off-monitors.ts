import { runNiriAction, showSuccess } from './utils';

export default async function PowerOffMonitors() {
  const success = await runNiriAction('power-off-monitors');
  if (success) {
    showSuccess('Power Off Monitors');
  }
}
