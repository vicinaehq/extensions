import { Action, ActionPanel, Detail } from '@vicinae/api';

const NOT_INSTALLED_MARKDOWN = `# Bitwarden CLI Not Found

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
      markdown={NOT_INSTALLED_MARKDOWN}
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
