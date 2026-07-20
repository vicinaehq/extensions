import { Clipboard, showToast, Toast } from '@vicinae/api';
import * as bw from './bw-executor';
import { showFailureToast } from './toast';
import { getPasswordPrefs, getPreferences } from './preferences';

export default async function GeneratePassword() {
  try {
    const prefs = getPreferences();
    const opts = getPasswordPrefs(prefs);
    const pwd = await bw.generatePassword(opts);
    await Clipboard.copy(pwd);
    await showToast({
      style: Toast.Style.Success,
      title: 'Password generated',
      message: 'Copied to clipboard',
    });
  } catch (err) {
    await showFailureToast(err, 'Generation failed');
  }
}
