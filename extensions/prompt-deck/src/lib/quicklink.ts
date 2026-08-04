import { environment, Icon } from "@vicinae/api";
import { basename } from "node:path";
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
 * Resolves the extension id Vicinae routes deeplinks by.
 *
 * `environment.extensionName` is the manifest `name` ("prompt-deck"), but the
 * launcher keys entrypoints on the *install* id, which the store namespaces to
 * "store.vicinae.prompt-deck". The support directory is `<data>/support/<id>`,
 * so its name recovers the id for store and development installs alike. The
 * manifest name is a last resort that keeps the link well-formed.
 */
function resolveExtensionId(): string {
  const fromSupport = environment.supportPath && basename(environment.supportPath);
  if (fromSupport) return fromSupport;

  return environment.extensionName || "prompt-deck";
}

/**
 * Builds the Vicinae deeplink used by prompt Quicklinks. Author and extension
 * id come from the runtime environment so they track the actual install.
 */
export function buildShortcutDeeplink(shortcut: LlmShortcut): string {
  const author = environment.ownerOrAuthorName || "tadassuksteris";
  const extension = resolveExtensionId();
  const args = encodeURIComponent(JSON.stringify({ shortcutId: shortcut.id }));
  return `vicinae://launch/@${author}/${extension}/${RUN_COMMAND}?arguments=${args}`;
}
