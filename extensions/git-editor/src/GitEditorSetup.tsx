import { Action, ActionPanel, Detail } from "@vicinae/api";
import { useSetup } from "./hooks/useScriptsInstalled";

export const GitEditorSetup = ({
  gitFile,
  isConfigured,
}: GitEditorSetupProps) => {
  const {
    allInstalled,
    editorPath,
    sequenceEditorPath,
    handleInstallScripts,
    handleInstallBoth,
    handleConfigureGit,
  } = useSetup();

  if (!gitFile) {
    const scriptsStatusText = allInstalled
      ? "✅ Editor scripts are installed."
      : `❌ Editor scripts are **not installed**.${
          editorPath ? "" : "\n  - `git-vicinae-editor` missing"
        }${sequenceEditorPath ? "" : "\n  - `git-vicinae-sequence-editor` missing"}`;

    const configStatus = isConfigured
      ? "✅ Git editor is already configured."
      : "❌ Git editor is **not configured**.";

    const allReady = allInstalled && isConfigured;

    return (
      <Detail
        markdown={`# No Git File Provided

This command should be run through the git CLI, not directly.

## Setup Status

${scriptsStatusText}

${configStatus}

${allReady ? "Run \`git commit\` or \`git rebase -i\` from your terminal to use this extension." : ""}`}
        actions={
          !allReady ? (
            <ActionPanel>
              {!allInstalled && !isConfigured && (
                <Action
                  title="Install Scripts & Configure Git"
                  onAction={handleInstallBoth}
                />
              )}
              {!allInstalled && (
                <Action
                  title="Install Editor Scripts"
                  shortcut={{ key: "i", modifiers: ["ctrl"] }}
                  onAction={handleInstallScripts}
                />
              )}
              {!isConfigured && (
                <Action
                  title="Configure Git Editor"
                  shortcut={{ key: "g", modifiers: ["ctrl"] }}
                  onAction={handleConfigureGit}
                />
              )}
            </ActionPanel>
          ) : undefined
        }
      />
    );
  }

  if (!allInstalled || !isConfigured) {
    const issues: string[] = [];
    if (!allInstalled) {
      issues.push("Editor scripts are not installed in your PATH");
    }
    if (!isConfigured) {
      issues.push("Git is not configured to use vicinae");
    }

    return (
      <Detail
        markdown={`# Git Editor Setup Required

The following issues need to be resolved:

${issues.map((i) => `- ${i}`).join("\n")}

Press **⌃ + ↵** (Ctrl + Enter) to automatically set up everything.

This will:
${!allInstalled ? `- Install \`git-vicinae-editor\` and \`git-vicinae-sequence-editor\` scripts to \`~/.local/bin\`\n` : ""}${
          !isConfigured
            ? `- Run:
\`\`\`bash
git config --global core.editor "git-vicinae-editor"
git config --global sequence.editor "git-vicinae-sequence-editor"
\`\`\``
            : ""
        }`}
        actions={
          <ActionPanel>
            <Action title="Complete Setup" onAction={handleInstallBoth} />
            {!allInstalled && (
              <Action
                title="Install Editor Scripts Only"
                shortcut={{ key: "i", modifiers: ["ctrl"] }}
                onAction={handleInstallScripts}
              />
            )}
            {!isConfigured && (
              <Action
                title="Configure Git Only"
                shortcut={{ key: "g", modifiers: ["ctrl"] }}
                onAction={handleConfigureGit}
              />
            )}
          </ActionPanel>
        }
      />
    );
  }

  return null;
};

type GitEditorSetupProps = {
  gitFile?: string;
  isConfigured: boolean;
};
