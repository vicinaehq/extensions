import { Form, ActionPanel, Action, Clipboard, LocalStorage, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { RbwCli } from "./api/rbw";
import { Vault } from "./api/vault";
import { getPrefs, resolveCliPath } from "./utils/prefs";

type Mode = "chars" | "diceware";

interface Settings {
  mode: Mode;
  length: string;
  symbols: boolean;
  onlyNumbers: boolean;
  nonconfusables: boolean;
  words: string;
  separator: string;
  capitalize: boolean;
  includeNumber: boolean;
}

const DEFAULTS: Settings = {
  mode: "chars",
  length: "20",
  symbols: true,
  onlyNumbers: false,
  nonconfusables: false,
  words: "5",
  separator: "-",
  capitalize: false,
  includeNumber: false,
};

const KEY_SETTINGS = "bw.generate-password.settings";

async function loadSettings(): Promise<Settings> {
  const raw = await LocalStorage.getItem<string>(KEY_SETTINGS);
  if (!raw) return DEFAULTS;
  try { return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }; }
  catch { return DEFAULTS; }
}

async function saveSettings(s: Settings): Promise<void> {
  await LocalStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
}

export default function GeneratePassword() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);
  const [pwd, setPwd] = useState("");

  useEffect(() => {
    void (async () => {
      setSettings(await loadSettings());
      setHydrated(true);
    })();
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => {
      const next = { ...s, [key]: value };
      void saveSettings(next);
      return next;
    });
  };

  const generate = async () => {
    const prefs = getPrefs();
    const cli = new RbwCli({ cliPath: resolveCliPath(prefs), serverCertsPath: prefs.serverCertsPath || undefined });
    const vault = new Vault(cli);
    const out = await vault.generatePassword(
      settings.mode === "diceware"
        ? {
            mode: "diceware",
            words: Math.max(1, Number(settings.words)),
            separator: settings.separator,
            capitalize: settings.capitalize,
            includeNumber: settings.includeNumber,
          }
        : {
            mode: "chars",
            length: Math.max(4, Number(settings.length)),
            symbols: settings.symbols,
            onlyNumbers: settings.onlyNumbers,
            nonconfusables: settings.nonconfusables,
          },
    );
    setPwd(out);
    await Clipboard.copy(out, { concealed: true });
    await showToast({ style: Toast.Style.Success, title: "Password copied", message: out });
  };

  if (!hydrated) return <Form isLoading />;

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Generate"
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onSubmit={async () => {
              try { await generate(); }
              catch (e) { await showToast({ style: Toast.Style.Failure, title: "Generate failed", message: String(e) }); }
            }}
          />
          {pwd && (
            <Action
              title="Copy Again"
              onAction={async () => { await Clipboard.copy(pwd, { concealed: true }); await showToast({ style: Toast.Style.Success, title: "Copied" }); }}
            />
          )}
          {pwd && <Action title="Paste" onAction={() => Clipboard.paste(pwd)} />}
        </ActionPanel>
      }
    >
      <Form.Description text={pwd ? `Generated: ${pwd}` : "Submit (⌘+↵) to generate."} />
      <Form.Dropdown id="mode" title="Mode" value={settings.mode} onChange={(v) => update("mode", v as Mode)}>
        <Form.Dropdown.Item value="chars" title="Characters" />
        <Form.Dropdown.Item value="diceware" title="Passphrase" />
      </Form.Dropdown>
      {settings.mode === "chars" ? (
        <>
          <Form.TextField id="length" title="Length" value={settings.length} onChange={(v) => update("length", v)} />
          <Form.Checkbox id="symbols" label="Include symbols" value={settings.symbols} onChange={(v) => update("symbols", v)} />
          <Form.Checkbox id="onlyNumbers" label="Numbers only" value={settings.onlyNumbers} onChange={(v) => update("onlyNumbers", v)} />
          <Form.Checkbox id="nonconfusables" label="Avoid look-alikes" value={settings.nonconfusables} onChange={(v) => update("nonconfusables", v)} />
        </>
      ) : (
        <>
          <Form.TextField id="words" title="Words" value={settings.words} onChange={(v) => update("words", v)} />
          <Form.TextField id="separator" title="Separator" value={settings.separator} onChange={(v) => update("separator", v)} />
          <Form.Checkbox id="capitalize" label="Capitalize each word" value={settings.capitalize} onChange={(v) => update("capitalize", v)} />
          <Form.Checkbox id="includeNumber" label="Append a digit" value={settings.includeNumber} onChange={(v) => update("includeNumber", v)} />
        </>
      )}
    </Form>
  );
}
