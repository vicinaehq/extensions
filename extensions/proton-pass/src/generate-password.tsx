import { Action, ActionPanel, Clipboard, getPreferenceValues, Icon, List, showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { generatePassword, PasswordOptions } from "./pass-cli";

type PasswordType = "random" | "passphrase";
type Separator = "hyphens" | "spaces" | "periods" | "commas" | "underscores" | "numbers" | "numbers-and-symbols";

type Preferences = {
  defaultPasswordLength?: string;
  defaultPasswordType?: string;
};

type GeneratorSettings = {
  type: PasswordType;
  length: number;
  words: number;
  includeNumbers: boolean;
  includeUppercase: boolean;
  includeSymbols: boolean;
  separator: Separator;
  capitalize: boolean;
};

const separators: Separator[] = [
  "hyphens",
  "spaces",
  "periods",
  "commas",
  "underscores",
  "numbers",
  "numbers-and-symbols",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function defaultSettings(): GeneratorSettings {
  const preferences = getPreferenceValues<Preferences>();
  const parsedLength = Number.parseInt(preferences.defaultPasswordLength ?? "20", 10);
  return {
    type: preferences.defaultPasswordType === "passphrase" ? "passphrase" : "random",
    length: Number.isFinite(parsedLength) ? clamp(parsedLength, 8, 128) : 20,
    words: 4,
    includeNumbers: true,
    includeUppercase: true,
    includeSymbols: true,
    separator: "hyphens",
    capitalize: true,
  };
}

function separatorLabel(separator: Separator): string {
  return separator.replace(/-/g, " ");
}

function summary(settings: GeneratorSettings): string {
  if (settings.type === "random") {
    return `${settings.length} characters · ${settings.includeUppercase ? "A-Z" : "no uppercase"} · ${settings.includeNumbers ? "0-9" : "no numbers"} · ${settings.includeSymbols ? "symbols" : "no symbols"}`;
  }
  return `${settings.words} words · ${settings.capitalize ? "capitalised" : "lowercase"} · ${settings.includeNumbers ? "with numbers" : "no numbers"} · ${separatorLabel(settings.separator)}`;
}

function optionsFor(settings: GeneratorSettings): PasswordOptions {
  return settings.type === "random"
    ? {
        type: "random",
        length: settings.length,
        includeNumbers: settings.includeNumbers,
        includeUppercase: settings.includeUppercase,
        includeSymbols: settings.includeSymbols,
      }
    : {
        type: "passphrase",
        words: settings.words,
        includeNumbers: settings.includeNumbers,
        separator: settings.separator,
        capitalize: settings.capitalize,
      };
}

export default function Command() {
  const initial = useRef(defaultSettings()).current;
  const [settings, setSettings] = useState(initial);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const generate = useCallback(async (next: GeneratorSettings) => {
    setLoading(true);
    setError(undefined);
    try {
      const value = await generatePassword(optionsFor(next));
      setPassword(value);
    } catch (reason: unknown) {
      setPassword("");
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void generate(initial);
  }, [generate, initial]);

  function update(next: GeneratorSettings): void {
    setSettings(next);
    void generate(next);
  }

  function updateSettings(change: (current: GeneratorSettings) => GeneratorSettings): void {
    update(change(settings));
  }

  async function copy(): Promise<void> {
    if (!password) return;
    await Clipboard.copy(password, { concealed: true });
    await showToast({ style: Toast.Style.Success, title: "Password copied" });
  }

  async function copyAndGenerate(): Promise<void> {
    await copy();
    await generate(settings);
  }

  const actions = (
    <ActionPanel>
      <Action title="Copy Password" icon={Icon.CopyClipboard} onAction={() => void copy()} />
      <Action title="Copy and Generate Next" icon={Icon.ArrowClockwise} onAction={() => void copyAndGenerate()} />
      <Action title="Generate New Password" icon={Icon.Shuffle} onAction={() => void generate(settings)} />
      <Action
        title={settings.type === "random" ? "Switch to Passphrase" : "Switch to Random Password"}
        icon={Icon.Switch}
        onAction={() => updateSettings((current) => ({ ...current, type: current.type === "random" ? "passphrase" : "random" }))}
      />
      {settings.type === "random" ? (
        <ActionPanel.Section title="Random Password Settings">
          <Action
            title={`Increase Length (${settings.length})`}
            icon={Icon.Plus}
            onAction={() => updateSettings((current) => ({ ...current, length: clamp(current.length + 1, 8, 128) }))}
          />
          <Action
            title={`Decrease Length (${settings.length})`}
            icon={Icon.Minus}
            onAction={() => updateSettings((current) => ({ ...current, length: clamp(current.length - 1, 8, 128) }))}
          />
          <Action
            title={settings.includeNumbers ? "Disable Numbers" : "Enable Numbers"}
            icon={Icon.Hashtag}
            onAction={() => updateSettings((current) => ({ ...current, includeNumbers: !current.includeNumbers }))}
          />
          <Action
            title={settings.includeUppercase ? "Disable Uppercase Letters" : "Enable Uppercase Letters"}
            icon={Icon.Text}
            onAction={() => updateSettings((current) => ({ ...current, includeUppercase: !current.includeUppercase }))}
          />
          <Action
            title={settings.includeSymbols ? "Disable Symbols" : "Enable Symbols"}
            icon={Icon.Key}
            onAction={() => updateSettings((current) => ({ ...current, includeSymbols: !current.includeSymbols }))}
          />
        </ActionPanel.Section>
      ) : (
        <ActionPanel.Section title="Passphrase Settings">
          <Action
            title={`Increase Word Count (${settings.words})`}
            icon={Icon.Plus}
            onAction={() => updateSettings((current) => ({ ...current, words: clamp(current.words + 1, 3, 10) }))}
          />
          <Action
            title={`Decrease Word Count (${settings.words})`}
            icon={Icon.Minus}
            onAction={() => updateSettings((current) => ({ ...current, words: clamp(current.words - 1, 3, 10) }))}
          />
          <Action
            title={settings.capitalize ? "Use Lowercase Words" : "Capitalise Words"}
            icon={Icon.Text}
            onAction={() => updateSettings((current) => ({ ...current, capitalize: !current.capitalize }))}
          />
          <Action
            title={settings.includeNumbers ? "Disable Numbers" : "Enable Numbers"}
            icon={Icon.Hashtag}
            onAction={() => updateSettings((current) => ({ ...current, includeNumbers: !current.includeNumbers }))}
          />
          <Action
            title={`Change Separator (${separatorLabel(settings.separator)})`}
            icon={Icon.Switch}
            onAction={() => {
              const index = separators.indexOf(settings.separator);
              updateSettings((current) => ({ ...current, separator: separators[(index + 1) % separators.length] }));
            }}
          />
        </ActionPanel.Section>
      )}
    </ActionPanel>
  );

  return (
    <List isLoading={loading} searchBarPlaceholder="Generate a secure password">
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Password generation failed"
          description={`${error} Try again or check the pass-cli version.`}
          actions={<ActionPanel><Action title="Retry" icon={Icon.ArrowClockwise} onAction={() => void generate(settings)} /></ActionPanel>}
        />
      ) : (
        <List.Item
          title={password || "Generating password…"}
          subtitle={summary(settings)}
          icon={Icon.Key}
          actions={actions}
        />
      )}
    </List>
  );
}
