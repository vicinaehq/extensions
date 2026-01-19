import { runNiriAction, showSuccess } from './utils';

export default async function ClearDynamicCastTarget() {
  const success = await runNiriAction('clear-dynamic-cast-target');
  if (success) {
    showSuccess('Dynamic cast target cleared');
  }
}