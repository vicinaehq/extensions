import { showToast, Toast } from "@vicinae/api";
import { RbwCli } from "./api/rbw";
import { Vault } from "./api/vault";
import { getPrefs, resolveCliPath } from "./utils/prefs";
import { setLastSync, clearCache } from "./api/session-store";

export default async function () {
  const prefs = getPrefs();
  const cli = new RbwCli({ cliPath: resolveCliPath(prefs), serverCertsPath: prefs.serverCertsPath || undefined });
  const vault = new Vault(cli);
  const status = await vault.status();
  if (!status || status.status !== "unlocked") {
    await showToast({ style: Toast.Style.Failure, title: "Not unlocked", message: "Open Search Vault and unlock first." });
    return;
  }
  const toast = await showToast({ style: Toast.Style.Animated, title: "Syncing vault…" });
  try {
    await vault.sync();
    await setLastSync();
    await clearCache();
    toast.style = Toast.Style.Success;
    toast.title = "Vault synced";
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Sync failed";
    toast.message = String(e);
  }
}
