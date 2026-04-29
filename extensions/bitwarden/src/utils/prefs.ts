import { getPreferenceValues } from "@vicinae/api";
import { mkdirSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Preferences } from "../types/prefs";

export function getPrefs(): Preferences {
  return getPreferenceValues<Preferences>();
}

export function resolveCliPath(prefs: Preferences): string {
  return prefs.cliPath?.trim() || "rbw";
}

export function repromptGraceMs(prefs: Preferences): number | "never" {
  if (prefs.repromptIgnoreDuration === "never") return "never";
  const n = Number(prefs.repromptIgnoreDuration);
  return Number.isFinite(n) ? n : 0;
}

const PINENTRY_SHIM = `#!/bin/sh
# pinentry-vicinae — Assuan-protocol shim for rbw.
# Emits a percent-encoded form of $RBW_PINENTRY_VALUE on GETPIN, per Assuan rules.
encode() {
  awk -v s="$1" 'BEGIN {
    gsub(/%/, "%25", s);
    gsub(/\\r/, "%0D", s);
    gsub(/\\n/, "%0A", s);
    printf "%s", s;
  }'
}
printf 'OK Pleased to meet you\\n'
while IFS= read -r line; do
  case "$line" in
    GETPIN*)  printf 'D %s\\n' "$(encode "$RBW_PINENTRY_VALUE")"; printf 'OK\\n' ;;
    BYE*)     printf 'OK closing connection\\n'; exit 0 ;;
    *)        printf 'OK\\n' ;;
  esac
done
`;

const EDITOR_SHIM = `#!/bin/sh
# editor-vicinae — $EDITOR replacement for rbw add/edit.
# Writes $RBW_EDITOR_PAYLOAD to argv[1]. No prompts.
printf '%s' "$RBW_EDITOR_PAYLOAD" > "$1"
`;

function writeShim(name: string, source: string): string {
  const dir = join(homedir(), ".cache", "vicinae-bw", "shims");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  // Always rewrite to keep the shim in sync with the embedded source
  // across extension upgrades; cheap (a few hundred bytes).
  writeFileSync(path, source);
  chmodSync(path, 0o755);
  console.log(`[rbw-ext] shim ${name} -> ${path}`);
  return path;
}

export function resolvePinentryShim(): string {
  return writeShim("pinentry-vicinae", PINENTRY_SHIM);
}

export function resolveEditorShim(): string {
  return writeShim("editor-vicinae", EDITOR_SHIM);
}
