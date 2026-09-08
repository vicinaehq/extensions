import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { baseMenuItem, shellQuote, type MenuItem } from "./menu";

const execFileAsync = promisify(execFile);

export async function providerChildren(item: MenuItem): Promise<MenuItem[]> {
  if (item.provider === "fonts") return fontChildren(item);
  if (item.provider === "power-profiles") return powerProfileChildren(item);
  return nativeFallbackChildren(item);
}

// Provider rows are generated, not parsed from a menu file: they start
// from the shared base shape and only override what their provider supplies.
function generatedItem(item: MenuItem, index: number): MenuItem {
  return baseMenuItem(`${item.id}.provider-${index}`, item.id);
}

// Runs a shell pipeline that lists the provider's values, marks the
// currently active one, and maps each `<value>\t<0|1>` row to a generated
// child.
async function listedChildren(
  item: MenuItem,
  listCommand: string,
  currentCommand: string,
  toRow: (value: string, index: number, isChecked: boolean) => MenuItem,
): Promise<MenuItem[]> {
  const listScript =
    `set -o pipefail; current=$(${currentCommand} 2>/dev/null || true); ` +
    `${listCommand} | while IFS= read -r value; do [[ -n $value ]] && ` +
    `printf '%s\\t%s\\n' "$value" "$([[ $value == "$current" ]] && echo 1 || echo 0)"; done`;
  const { stdout } = await execFileAsync("/bin/bash", ["-lc", listScript], {
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
  });

  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      const [value, checked] = line.split("\t");
      return toRow(value, index, checked === "1");
    });
}

function fontChildren(item: MenuItem): Promise<MenuItem[]> {
  return listedChildren(
    item,
    "omarchy-font-list",
    "omarchy-font-current",
    (font, index, isChecked) => ({
      ...generatedItem(item, index),
      icon: "",
      label: font,
      action: `omarchy font set ${shellQuote(font)}`,
      isChecked,
      revalidatesOnRun: true,
    }),
  );
}

function powerProfileChildren(item: MenuItem): Promise<MenuItem[]> {
  return listedChildren(
    item,
    "omarchy-powerprofiles-list",
    "powerprofilesctl get",
    (profile, index, isChecked) => ({
      ...generatedItem(item, index),
      icon: "󰾆",
      label: profile,
      action: `omarchy powerprofiles set autodetect ${shellQuote(profile)}`,
      isChecked,
      revalidatesOnRun: true,
    }),
  );
}

// Providers implemented by Omarchy Shell (e.g. Apps) keep their native
// behavior: the row opens that submenu in the Omarchy menu instead.
function nativeFallbackChildren(item: MenuItem): MenuItem[] {
  return [
    {
      ...generatedItem(item, 0),
      icon: item.icon,
      iconFont: item.iconFont,
      label: "Open in Omarchy Menu",
      description: `The ${item.provider} provider is supplied by Omarchy Shell`,
      action: `omarchy menu summon ${shellQuote(item.id)}`,
    },
  ];
}
