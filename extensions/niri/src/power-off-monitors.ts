import { showSuccess } from './lib/feedback';
import { runNiriAction } from './lib/niri';

export default async function PowerOffMonitors() {
  const success = await runNiriAction('power-off-monitors');
  if (success) {
    showSuccess('Power Off Monitors');
  }
}
