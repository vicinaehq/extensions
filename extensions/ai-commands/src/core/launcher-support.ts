import { parse, modify, applyEdits, type ParseError } from "jsonc-parser/lib/esm/main.js";

export const OWNER = "# Vicinae AI Commands managed launcher v1";

export function supportedOriginalLauncher(text: string): boolean {
  const lines = text.trim().split("\n");
  return (
    lines.length === 2 &&
    /^#![^\n]*\b(?:ba|da|z)?sh\b/.test(lines[0]!) &&
    /^exec (?:"(?:\$HOME\/|\/)[^"$`\\\n]+"|\/[A-Za-z0-9_./+-]+) "\$@"$/.test(
      lines[1]!,
    )
  );
}

export function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function readSettings(text: string): Record<string, any> {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true });
  if (
    errors.length ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  )
    throw new Error(
      "Vicinae settings could not be parsed. No settings were changed.",
    );
  return value;
}

// Change only this property, retaining comments and unrelated preferences.
export function setSetting(
  text: string,
  path: string[],
  value: unknown,
): string {
  let current = readSettings(text);
  if (!path.length) throw new Error("A setting path is required.");
  for (const key of path.slice(0, -1)) {
    if (current[key] === undefined) break;
    current = current[key];
    if (!current || typeof current !== "object" || Array.isArray(current))
      throw new Error(`Expected an object at ${key}.`);
  }
  return applyEdits(text, modify(text, path, value, {}));
}

export function serverWrapper(original: string, privateData: string): string {
  return `#!/bin/sh
${OWNER}
if [ "\${1-}" = server ]; then
  ai_data=${shellQuote(privateData)}
  case ":\${XDG_DATA_DIRS-}:" in
    *":$ai_data:"*) ;;
    *) XDG_DATA_DIRS="$ai_data:\${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"; export XDG_DATA_DIRS ;;
  esac
fi
exec ${shellQuote(original)} "$@"
`;
}

export function appWrapper(privateData: string, prefix: string[]): string {
  return `#!/bin/sh
${OWNER}
ai_private=${shellQuote(privateData)}
if [ "\${XDG_DATA_DIRS+x}" = x ]; then
  ai_remaining=$XDG_DATA_DIRS
  ai_clean=
  while :; do
    case "$ai_remaining" in
      *:*) ai_item=\${ai_remaining%%:*}; ai_remaining=\${ai_remaining#*:}; ai_more=1 ;;
      *) ai_item=$ai_remaining; ai_more= ;;
    esac
    if [ -n "$ai_item" ] && [ "\${ai_item%/}" != "$ai_private" ]; then
      ai_clean="\${ai_clean:+$ai_clean:}$ai_item"
    fi
    [ -n "$ai_more" ] || break
  done
  XDG_DATA_DIRS=\${ai_clean:-/usr/local/share:/usr/share}
  export XDG_DATA_DIRS
fi
exec ${prefix.length ? prefix.map(shellQuote).join(" ") + " " : ""}"$@"
`;
}
