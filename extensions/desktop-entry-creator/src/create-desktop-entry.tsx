import React, { useState } from "react";
import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  Icon,
  Clipboard,
  open,
} from "@vicinae/api";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface FormValues {
  name: string;
  execText: string;
  execFile: string[];
  iconText: string;
  iconFile: string[];
  comment: string;
  categories: string;
  terminal: boolean;
  startupNotify: boolean;
  scope: "local" | "global";
}

function expandTilde(p: string): string {
  if (p.startsWith("~/") || p === "~") return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolvePath(text: string | null | undefined, files: string[] | null | undefined): string {
  const t = (text ?? "").trim();
  if (t) return expandTilde(t);
  return expandTilde((files?.[0] ?? "").trim());
}

function buildDesktopEntry(values: FormValues): string {
  const str = (v: string | null | undefined) => (v ?? "").trim();

  const execPath = resolvePath(values.execText, values.execFile);
  const iconPath = resolvePath(values.iconText, values.iconFile);

  const lines = [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    `Name=${str(values.name)}`,
    `Exec=${execPath}`,
  ];

  if (iconPath)             lines.push(`Icon=${iconPath}`);
  if (str(values.comment))  lines.push(`Comment=${str(values.comment)}`);
  if (str(values.categories)) lines.push(`Categories=${str(values.categories)}`);

  lines.push(`Terminal=${values.terminal}`);
  lines.push(`StartupNotify=${values.startupNotify}`);

  return lines.join("\n") + "\n";
}

function getOutputPath(name: string | null | undefined, scope: "local" | "global"): string {
  const safeName = (name ?? "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const filename = `${safeName}.desktop`;
  if (scope === "global") return `/usr/share/applications/${filename}`;
  return path.join(os.homedir(), ".local", "share", "applications", filename);
}

export default function CreateDesktopEntry() {
  const [nameError, setNameError] = useState<string | undefined>();
  const [execError, setExecError] = useState<string | undefined>();

  function validateName(value?: string) {
    if (!value?.trim()) { setNameError("App name is required"); return false; }
    setNameError(undefined);
    return true;
  }

  function validateExec(text?: string, files?: string[]) {
    if (!(text ?? "").trim() && !files?.[0]) {
      setExecError("Exec path is required — type it or pick a file");
      return false;
    }
    setExecError(undefined);
    return true;
  }

  async function handleSubmit(values: FormValues, mode: "create" | "copy" | "preview") {
    if (!validateName(values.name) || !validateExec(values.execText, values.execFile)) return;

    const content = buildDesktopEntry(values);

    if (mode === "preview") {
      await showToast({ style: Toast.Style.Success, title: "Preview", message: content });
      return;
    }

    if (mode === "copy") {
      await Clipboard.copy(content);
      await showToast({ style: Toast.Style.Success, title: "Copied to clipboard", message: ".desktop content is ready to paste" });
      return;
    }

    const outputPath = getOutputPath(values.name, values.scope);

    try {
      if (values.scope === "local") {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, content, { encoding: "utf-8" });
        await showToast({
          style: Toast.Style.Success,
          title: "Desktop entry created",
          message: outputPath,
          primaryAction: { title: "Open in Editor", onAction: () => open(outputPath) },
        });
      } else {
        const tmpPath = `/tmp/${path.basename(outputPath)}`;
        fs.writeFileSync(tmpPath, content, { encoding: "utf-8" });
        await showToast({
          style: Toast.Style.Success,
          title: "Entry written to /tmp",
          message: `Run: sudo mv ${tmpPath} ${outputPath}`,
          primaryAction: {
            title: "Copy sudo command",
            onAction: () => Clipboard.copy(`sudo mv ${tmpPath} ${outputPath} && sudo chmod 644 ${outputPath}`),
          },
        });
      }
    } catch (err) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to write file", message: String(err) });
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Document}
            title="Create .desktop File"
            onSubmit={(v: FormValues) => handleSubmit(v, "create")}
          />
          <Action.SubmitForm
            icon={Icon.Clipboard}
            title="Copy to Clipboard"
            shortcut={{ modifiers: ["cmd"], key: "c" }}
            onSubmit={(v: FormValues) => handleSubmit(v, "copy")}
          />
          <Action.SubmitForm
            icon={Icon.Eye}
            title="Preview Content"
            shortcut={{ modifiers: ["cmd"], key: "p" }}
            onSubmit={(v: FormValues) => handleSubmit(v, "preview")}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="App Name"
        placeholder="e.g. RetroArch"
        info="The display name shown in app launchers"
        error={nameError}
        onChange={validateName}
        onBlur={(e) => validateName(e.target.value)}
      />

      <Form.Separator />
      <Form.Description title="Exec" text="Type/paste a path, or pick a file below — text field takes priority." />

      <Form.TextField
        id="execText"
        title="Exec Path"
        placeholder="e.g. ~/retroarch/RetroArch-Linux-x86_64.AppImage"
        info="Supports ~ expansion. Use %u for URL, %f for file args."
        error={execError}
        onChange={(v) => validateExec(v, undefined)}
      />

      <Form.FilePicker
        id="execFile"
        title="— or pick binary"
        info="Opens file explorer to select the binary or AppImage"
        allowMultipleSelection={false}
      />

      <Form.Separator />
      <Form.Description title="Icon" text="Type/paste a path or theme name, or pick a file below — text field takes priority." />

      <Form.TextField
        id="iconText"
        title="Icon Path / Name"
        placeholder="e.g. retroarch or /path/to/icon.png"
        info="Theme icon name (e.g. firefox) or absolute/~ path to a png/svg"
      />

      <Form.FilePicker
        id="iconFile"
        title="— or pick icon"
        info="Opens file explorer to select an icon image"
        allowMultipleSelection={false}
        extensions={["png", "svg", "xpm", "jpg", "jpeg"]}
      />

      <Form.Separator />

      <Form.TextField
        id="comment"
        title="Comment"
        placeholder="e.g. A great application"
        info="Short description shown as a tooltip in launchers"
      />

      <Form.TextField
        id="categories"
        title="Categories"
        placeholder="e.g. Utility;Network;"
        info="Semicolon-separated XDG categories."
      />

      <Form.Checkbox id="terminal" label="Run in terminal" defaultValue={false} info="Launch inside a terminal emulator" />
      <Form.Checkbox id="startupNotify" label="Startup notify" defaultValue={true} info="Show loading indicator on launch" />

      <Form.Separator />

      <Form.Dropdown
        id="scope"
        title="Install location"
        defaultValue="local"
        info="Local: ~/.local/share/applications (no sudo). Global: /usr/share/applications (needs sudo)."
      >
        <Form.Dropdown.Item value="local" title="Local — ~/.local/share/applications" icon={Icon.Person} />
        <Form.Dropdown.Item value="global" title="Global — /usr/share/applications (needs sudo)" icon={Icon.Globe} />
      </Form.Dropdown>
    </Form>
  );
}