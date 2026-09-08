import ts from "typescript";

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
  const parsed = ts.parseConfigFileTextToJson("settings.json", text);
  if (
    parsed.error ||
    !parsed.config ||
    typeof parsed.config !== "object" ||
    Array.isArray(parsed.config)
  )
    throw new Error(
      "Vicinae settings could not be parsed. No settings were changed.",
    );
  return parsed.config;
}

// Edit only the requested property. Preserve comments and unrelated user settings.
export function setSetting(
  text: string,
  path: string[],
  value: unknown,
): string {
  readSettings(text);
  const source = ts.parseJsonText("settings.json", text);
  let object = (source.statements[0] as ts.ExpressionStatement).expression;
  for (let index = 0; index < path.length; index++) {
    if (!ts.isObjectLiteralExpression(object))
      throw new Error(
        `Expected an object at ${path.slice(0, index).join(".")}.`,
      );
    const key = path[index]!;
    const property = object.properties.find(
      (p) =>
        ts.isPropertyAssignment(p) &&
        p.name &&
        (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name)) &&
        p.name.text === key,
    ) as ts.PropertyAssignment | undefined;
    if (property) {
      if (index === path.length - 1) {
        return (
          text.slice(0, property.initializer.getStart(source)) +
          JSON.stringify(value) +
          text.slice(property.initializer.end)
        );
      }
      object = property.initializer;
      continue;
    }
    let nested = value;
    for (let j = path.length - 1; j > index; j--)
      nested = { [path[j]!]: nested };
    const position = object.getStart(source) + 1;
    const inserted = `\n  ${JSON.stringify(key)}: ${JSON.stringify(nested)}${object.properties.length ? "," : ""}\n`;
    return text.slice(0, position) + inserted + text.slice(position);
  }
  throw new Error("A setting path is required.");
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
