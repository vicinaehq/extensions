import { Action, ActionPanel, Detail } from '@vicinae/api';

const BW_NOT_INSTALLED_MARKDOWN = `# Bitwarden CLI Not Found

The \`bw\` binary is not installed or not on your \`PATH\`.

## Install

Download the Bitwarden CLI from [bitwarden.com/download](https://bitwarden.com/download/).  
Available as AppImage, Snap, or npm:

\`\`\`
npm install -g @bitwarden/cli
\`\`\`

After installing, restart Vicinae or reopen this command.`;

export function BwNotInstalled() {
  return (
    <Detail
      markdown={BW_NOT_INSTALLED_MARKDOWN}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Download Bitwarden CLI"
            url="https://bitwarden.com/download/"
          />
        </ActionPanel>
      }
    />
  );
}

const SECRET_TOOL_NOT_INSTALLED_MARKDOWN = `# libsecret-tools Not Found

The \`secret-tool\` binary is not installed. It is required to store your vault session securely in the system keyring.

## Install

On Debian/Ubuntu:
\`\`\`
sudo apt install libsecret-tools
\`\`\`

On Fedora:
\`\`\`
sudo dnf install libsecret
\`\`\`

On Arch:
\`\`\`
sudo pacman -S libsecret
\`\`\`

After installing, reopen this command.`;

export function SecretToolNotInstalled() {
  return <Detail markdown={SECRET_TOOL_NOT_INSTALLED_MARKDOWN} />;
}
