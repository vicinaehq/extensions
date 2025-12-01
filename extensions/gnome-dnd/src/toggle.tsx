import { showToast, Toast } from '@vicinae/api';
import { toggleDND, isDNDEnabled } from './utils/dnd';

export default async function Command() {
  try {
    await toggleDND();
    const status = await isDNDEnabled();
    await showToast({
      style: Toast.Style.Success,
      title: `DND ${status ? 'Enabled' : 'Disabled'}`,
    });
  } catch (error) {
    console.error('Error toggling Do Not Disturb mode:', error);
    await showToast({
      style: Toast.Style.Failure,
      title: 'Failed to Toggle Do Not Disturb',
      message: String(error),
    });
  }
}
