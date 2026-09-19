import { showSuccess } from './lib/feedback';
import { runNiriAction } from './lib/niri';

export default async function ClearDynamicCastTarget() {
  const success = await runNiriAction('clear-dynamic-cast-target');
  if (success) {
    showSuccess('Dynamic cast target cleared');
  }
}
