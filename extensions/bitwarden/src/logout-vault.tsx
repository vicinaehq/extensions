import { showToast, Toast, confirmAlert, Alert } from "@vicinae/api";
import { RbwCli } from "./api/rbw";
import { Vault } from "./api/vault";
import { getPrefs, resolveCliPath } from "./utils/prefs";
import { clearCache, clearAllReprompt } from "./api/session-store";

export default async function () {
  const ok = await confirmAlert({
    title: "Log out of Bitwarden?",
    message: "You will need to re-enter your API keys and master password.",
    primaryAction: { title: "Log out", style: Alert.ActionStyle.Destructive },
  });
  if (!ok) return;

  const prefs = getPrefs();
  const cli = new RbwCli({ cliPath: resolveCliPath(prefs), serverCertsPath: prefs.serverCertsPath || undefined });
  const vault = new Vault(cli);
  try { await vault.logout(); } catch { /* best effort */ }
  await clearCache();
  await clearAllReprompt();
  await showToast({ style: Toast.Style.Success, title: "Logged out" });
}
