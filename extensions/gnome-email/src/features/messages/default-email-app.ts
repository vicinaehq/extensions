import { showToast, Toast } from "@vicinae/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { errorMessage } from "../../lib/errors";
import type { EmailMessage } from "../../types";

const execFileAsync = promisify(execFile);

function messageIdUri(messageId: string): string {
  const encoded = encodeURIComponent(messageId)
    .replace(/%40/gi, "@")
    .replace(/%24/gi, "$")
    .replace(/%26/gi, "&")
    .replace(/%2B/gi, "+")
    .replace(/%2C/gi, ",")
    .replace(/%3B/gi, ";")
    .replace(/%3D/gi, "=");
  return `mid:${encoded}`;
}

async function queryDefaultMailHandler(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("xdg-mime", ["query", "default", "x-scheme-handler/mailto"]);
    return stdout.trim();
  } catch {
    return "";
  }
}

export type EmailAppTarget = "evolution" | "thunderbird" | "default";

async function executableExists(name: "evolution" | "thunderbird"): Promise<boolean> {
  try {
    await execFileAsync("which", [name]);
    return true;
  } catch {
    return false;
  }
}

export async function detectEmailAppTarget(): Promise<EmailAppTarget> {
  const defaultMailHandler = await queryDefaultMailHandler();
  if (/(^|[.-])evolution([.-]|$)/i.test(defaultMailHandler) && await executableExists("evolution")) return "evolution";
  if (/(^|[.-])thunderbird([.-]|$)/i.test(defaultMailHandler) && await executableExists("thunderbird")) return "thunderbird";
  return "default";
}

export function emailAppActionTitle(target: EmailAppTarget): string {
  if (target === "evolution") return "Open in Evolution";
  if (target === "thunderbird") return "Open in Thunderbird";
  return "Open the default email app";
}

export async function openInDefaultEmailApp(message: EmailMessage, target: EmailAppTarget = "default"): Promise<void> {
  if (!message.messageId) {
    await showToast({ style: Toast.Style.Failure, title: "Cannot open message", message: "The server did not provide a Message-ID." });
    return;
  }

  const messageId = message.messageId.trim().replace(/^<|>$/g, "");
  if (!messageId) {
    await showToast({ style: Toast.Style.Failure, title: "Cannot open message", message: "The message has an empty Message-ID." });
    return;
  }
  const uri = messageIdUri(messageId);

  try {
    if (target === "evolution") {
      await execFileAsync("evolution", [uri]);
      return;
    }
    if (target === "thunderbird") {
      await execFileAsync("thunderbird", ["-url", uri]);
      return;
    }

    const desktopId = await queryDefaultMailHandler();
    if (!desktopId || !/^[a-z\d._-]+\.desktop$/i.test(desktopId)) {
      throw new Error("No application is configured to open email message links");
    }

    await execFileAsync("gtk-launch", [desktopId, uri]);
  } catch (cause) {
    await showToast({ style: Toast.Style.Failure, title: "Could not open default email app", message: errorMessage(cause) });
  }
}
