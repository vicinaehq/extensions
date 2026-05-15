import { showToast, Toast } from '@vicinae/api';
import * as bw from './bw-executor';
import { showFailureToast } from './toast';
import { deleteSession } from './session-store';
import { clearCachedSends, clearCachedVault, clearSendKeys, clearTotpSecrets } from './vault-cache';

export default async function Logout() {
  try {
    await bw.logout();
    await deleteSession();
    await clearCachedVault();
    await clearCachedSends();
    await clearTotpSecrets();
    await clearSendKeys();
    await showToast({
      style: Toast.Style.Success,
      title: 'Logged out',
      message: 'Your Bitwarden session has been cleared',
    });
  } catch (err) {
    await showFailureToast(err, 'Logout failed');
  }
}
