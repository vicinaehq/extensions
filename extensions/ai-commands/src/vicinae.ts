import {
  Clipboard,
  Icon,
  LocalStorage,
  PopToRootType,
  WindowManagement,
  closeMainWindow,
  environment,
  getPreferenceValues,
  getSelectedText,
  popToRoot,
  showToast,
  Toast,
} from "@vicinae/api";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Repository } from "./core/repository";
import {
  errorMessage,
  isApiHarness,
  type AICommand,
  type HarnessId,
  type HarnessConnection,
  type InputSnapshot,
} from "./core/types";
import { pasteResult } from "./core/paste";
import { resolveExecutable } from "./harnesses/process";
import { setClaudeSdkLocation } from "./harnesses/claude";
import {
  applicationsDirectory,
  legacyApplicationsDirectory,
  migrateDesktopEntry,
  withDesktopEntriesRemoved,
} from "./core/desktop-entry";
import { launcherEnabled } from "./core/launcher-paths";

setClaudeSdkLocation(
  pathToFileURL(join(environment.assetsPath, "claude-sdk.mjs")).href,
);

export const repository = new Repository(LocalStorage);

export interface Preferences {
  claudePath?: string;
  codexPath?: string;
  grokPath?: string;
  opencodePath?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  xaiApiKey?: string;
  saveHistory?: boolean;
}
export interface SourceContext {
  input: InputSnapshot;
  sourceWindow?: WindowManagement.Window;
  selectionError?: string;
  clipboardError?: string;
}

export async function connectionFor(
  harness: HarnessId,
): Promise<HarnessConnection> {
  const preferences = getPreferenceValues<Preferences>();
  if (isApiHarness(harness)) {
    const keyName = {
      "openai-api": "openaiApiKey",
      "anthropic-api": "anthropicApiKey",
      "xai-api": "xaiApiKey",
    } as const;
    return { executable: "", apiKey: preferences[keyName[harness]] };
  }
  return {
    executable: await resolveExecutable(harness, preferences[`${harness}Path`]),
  };
}

export async function captureSource(): Promise<SourceContext> {
  const [selection, clipboard, window] = await Promise.allSettled([
    getSelectedText(),
    Clipboard.readText(),
    WindowManagement.getActiveWindow(),
  ]);
  return {
    input: {
      ...(selection.status === "fulfilled"
        ? { selection: selection.value }
        : {}),
      ...(clipboard.status === "fulfilled"
        ? { clipboard: clipboard.value }
        : {}),
    },
    sourceWindow: window.status === "fulfilled" ? window.value : undefined,
    selectionError:
      selection.status === "rejected"
        ? errorMessage(selection.reason)
        : undefined,
    clipboardError:
      clipboard.status === "rejected"
        ? errorMessage(clipboard.reason)
        : undefined,
  };
}

export function quicklinkFor(command: AICommand) {
  const author = encodeURIComponent(environment.ownerOrAuthorName || "vdmkotai");
  const extension = encodeURIComponent(
    basename(environment.supportPath) || environment.extensionName,
  );
  const args = encodeURIComponent(JSON.stringify({ commandId: command.id }));
  return {
    name: command.name,
    link: `vicinae://launch/@${author}/${extension}/run-ai-command?arguments=${args}`,
    icon: Icon.Stars,
    ...(process.platform === "linux"
      ? { application: "vicinae-url-handler.desktop" }
      : {}),
  };
}

async function desktopOptions() {
  return {
    directory: applicationsDirectory(),
    entrypoint: `@${environment.ownerOrAuthorName || "vdmkotai"}/${basename(environment.supportPath) || environment.extensionName}:run-ai-command`,
    executable: await resolveExecutable("vicinae"),
    icon: join(environment.assetsPath, "icon.svg"),
  };
}

export async function publishCommand(command: AICommand): Promise<void> {
  if (process.platform !== "linux")
    throw new Error(
      "Automatic main-search entries currently require Linux. Use Add Quicklink in the actions menu on other platforms.",
    );
  if (!launcherEnabled())
    throw new Error(
      "Private launcher integration is not configured. Run npm run setup:launcher from the extension repository, then restart Vicinae.",
    );
  await migrateDesktopEntry(
    command,
    await desktopOptions(),
    legacyApplicationsDirectory(),
  );
}

export async function synchronizeMainSearch(
  commands: AICommand[],
): Promise<void> {
  if (process.platform !== "linux" || !launcherEnabled()) return;
  const failures: string[] = [];
  for (const command of commands) {
    try {
      await publishCommand(command);
    } catch (error) {
      failures.push(`${command.name}: ${errorMessage(error)}`);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
}

export async function deleteCommand(command: AICommand): Promise<void> {
  if (process.platform === "linux") {
    const options = await desktopOptions();
    await withDesktopEntriesRemoved(
      command.id,
      [options, { ...options, directory: legacyApplicationsDirectory() }],
      () => repository.deleteCommand(command.id),
    );
  } else await repository.deleteCommand(command.id);
}

let pasteInFlight = false;
export async function pasteToSource(
  text: string,
  context: SourceContext,
): Promise<void> {
  if (pasteInFlight) return;
  pasteInFlight = true;
  try {
    const window = context.sourceWindow;
    await pasteResult(text, window?.id, {
      sourceExists: async (id) =>
        (await WindowManagement.getWindows()).some(
          (candidate) => candidate.id === id,
        ),
      close: () =>
        closeMainWindow({
          clearRootSearch: true,
          popToRootType: PopToRootType.Suspended,
        }),
      focus: () => window!.focus(),
      activeWindowId: async () => {
        try {
          return (await WindowManagement.getWindows()).find(
            (window) => window.active,
          )?.id;
        } catch {
          return undefined;
        }
      },
      paste: (value) => Clipboard.paste({ text: value }),
    });
    await popToRoot({ clearSearchBar: true });
  } finally {
    pasteInFlight = false;
  }
}

export async function toastError(
  error: unknown,
  title = "AI Commands",
): Promise<void> {
  await showToast({
    style: Toast.Style.Failure,
    title,
    message: errorMessage(error).slice(0, 1500),
  });
}
