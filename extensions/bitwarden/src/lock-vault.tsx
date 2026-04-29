import { showToast, Toast } from "@vicinae/api";
import { RbwCli } from "./api/rbw";
import { Vault } from "./api/vault";
import { getPrefs, resolveCliPath } from "./utils/prefs";
import { clearAllReprompt } from "./api/session-store";

export default async function () {
  const prefs = getPrefs();
  const cli = new RbwCli({ cliPath: resolveCliPath(prefs), serverCertsPath: prefs.serverCertsPath || undefined });
  const vault = new Vault(cli);
  try { await vault.lock(); } catch { /* best effort */ }
  await clearAllReprompt();
  await showToast({ style: Toast.Style.Success, title: "Vault locked" });
}
