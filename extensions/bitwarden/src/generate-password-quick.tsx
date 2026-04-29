import { Clipboard, showToast, Toast } from "@vicinae/api";
import { RbwCli } from "./api/rbw";
import { Vault } from "./api/vault";
import { getPrefs, resolveCliPath } from "./utils/prefs";

export default async function () {
  const prefs = getPrefs();
  const cli = new RbwCli({ cliPath: resolveCliPath(prefs), serverCertsPath: prefs.serverCertsPath || undefined });
  const vault = new Vault(cli);
  try {
    const pwd = await vault.generatePassword({ mode: "chars", length: 24, symbols: true });
    await Clipboard.copy(pwd, { concealed: true });
    await showToast({ style: Toast.Style.Success, title: "Password copied", message: pwd });
  } catch (e) {
    await showToast({ style: Toast.Style.Failure, title: "Generate failed", message: String(e) });
  }
}
