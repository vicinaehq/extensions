import { environment, Icon } from "@vicinae/api";
import { RUN_COMMAND } from "./constants";
import type { LlmShortcut } from "./types";

/** Desktop entry that opens vicinae:// links. Linux only — no equivalent elsewhere. */
const LINUX_URL_HANDLER = "vicinae-url-handler.desktop";

/**
 * Builds the Quicklink that launches a prompt from root search.
 */
export function buildPromptQuicklink(shortcut: LlmShortcut) {
  return {
    name: shortcut.name,
    link: buildShortcutDeeplink(shortcut),
    icon: Icon.Stars,
    // Naming a .desktop entry on macOS would prefill a handler that cannot
    // exist, so let Vicinae resolve the vicinae:// scheme itself there.
    ...(process.platform === "linux" ? { application: LINUX_URL_HANDLER } : {}),
  };
}

/**
 * Builds the Vicinae deeplink used by prompt Quicklinks. Author and extension
 * name come from the runtime environment so they track the manifest.
 */
export function buildShortcutDeeplink(shortcut: LlmShortcut): string {
  const author = environment.ownerOrAuthorName || "tadassuksteris";
  const extension = environment.extensionName || "prompt-deck";
  const args = encodeURIComponent(JSON.stringify({ shortcutId: shortcut.id }));
  return `vicinae://launch/@${author}/${extension}/${RUN_COMMAND}?arguments=${args}`;
}
