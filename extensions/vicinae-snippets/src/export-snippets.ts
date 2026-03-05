import { Clipboard, Toast, environment, showHUD, showInFileBrowser, showToast } from "@vicinae/api";
import fs from "node:fs/promises";
import path from "node:path";

import { exportStoreToJson } from "./lib/import-export";
import { loadStore } from "./lib/snippet-store";

export default async function ExportSnippetsCommand() {
  try {
    const store = await loadStore();
    const json = exportStoreToJson(store);

    try {
      await fs.mkdir(environment.supportPath, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const filePath = path.join(environment.supportPath, `snippets-export-${ts}.json`);
      await fs.writeFile(filePath, json, "utf8");
      await Clipboard.copy(json);
      await showHUD("Exported (and copied to clipboard)");
      await showInFileBrowser(filePath);
    } catch (err) {
      await Clipboard.copy(json);
      await showToast({
        style: Toast.Style.Success,
        title: "Export JSON copied to clipboard",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Export failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
