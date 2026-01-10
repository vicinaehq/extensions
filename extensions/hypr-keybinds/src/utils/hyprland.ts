import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, existsSync } from "node:fs";

const execAsync = promisify(exec);
const HEADER_PATH = "/usr/include/linux/input-event-codes.h";

function loadEvdevKeycodes(): Record<number, string> {
  const keycodes: Record<number, string> = {};

  if (!existsSync(HEADER_PATH)) {
    console.warn(`Linux input headers not found at ${HEADER_PATH}`);
    return keycodes;
  }

  try {
    const header = readFileSync(HEADER_PATH, "utf8");

    for (const line of header.split("\n")) {
      const match = line.match(/^#define\s+KEY_([A-Z0-9_]+)\s+(\d+)/);
      if (match) {
        const [, name, code] = match;
        keycodes[Number(code)] = name;
      }
    }
  } catch (err) {
    console.warn(`Failed to read ${HEADER_PATH}:`, err);
  }

  return keycodes;
}

const XKB_EVDEV_OFFSET = 8;
function keycodeToKey(keycode: number): string {
  const keycodes = loadEvdevKeycodes();
  const evdevCode = keycode - XKB_EVDEV_OFFSET;
  return keycodes[evdevCode] || `code:${keycode}`;
}

export type HyprBind = {
  key: string;
  modifiers: string;
  dispatcher: string;
  arg: string;
  description: string;
  locked: boolean;
  mouse: boolean;
  release: boolean;
  repeat: boolean;
  longPress: boolean;
  nonConsuming: boolean;
  submap: string;
};

interface HyprctlBind {
  locked: boolean;
  mouse: boolean;
  release: boolean;
  repeat: boolean;
  longPress: boolean;
  non_consuming: boolean;
  has_description: boolean;
  modmask: number;
  submap: string;
  key: string;
  keycode: number;
  catch_all: boolean;
  description: string;
  dispatcher: string;
  arg: string;
}

function modmaskToString(modmask: number): string {
  const mods: string[] = [];
  if (modmask & 1) mods.push("SHIFT");
  if (modmask & 4) mods.push("CTRL");
  if (modmask & 8) mods.push("ALT");
  if (modmask & 64) mods.push("SUPER");
  return mods.join(" + ");
}

function mapMouseKey(key: string): string {
  const low = key.replace(/\s+/g, "").toLowerCase();
  if (low === "mouse:272") return "left click";
  if (low === "mouse:273") return "right click";
  if (low === "mouse:274") return "middle click";
  if (low === "mouse:wheelup") return "wheelup";
  if (low === "mouse:wheeldown") return "wheeldown";
  if (low === "mouse:wheelleft") return "wheelleft";
  if (low === "mouse:wheelright") return "wheelright";
  return key;
}

export async function getHyprlandKeybinds(): Promise<HyprBind[]> {
  const { stdout } = await execAsync("hyprctl -j binds", {
    timeout: 10000,
  });

  const rawBinds: HyprctlBind[] = JSON.parse(stdout);

  return rawBinds.map((bind) => {
    let key = bind.key;
    if (!key && bind.keycode) key = keycodeToKey(bind.keycode);
    if (bind.mouse) key = mapMouseKey(key);
    const modifiers = modmaskToString(bind.modmask);

    return {
      key: key,
      modifiers,
      dispatcher: bind.dispatcher,
      arg: bind.arg,
      description: bind.description || "",
      locked: bind.locked,
      mouse: bind.mouse,
      release: bind.release,
      repeat: bind.repeat,
      longPress: bind.longPress,
      nonConsuming: bind.non_consuming,
      submap: bind.submap,
    };
  });
}
