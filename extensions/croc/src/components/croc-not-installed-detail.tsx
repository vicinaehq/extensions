import { Detail } from "@vicinae/api";

const installInstructions = `# croc is not installed

This command requires \`croc\` to be installed on your system.

## How to install

### Arch Linux
\`\`\`bash
sudo pacman -S croc
\`\`\`

### Fedora
\`\`\`bash
sudo dnf install croc
\`\`\`

### Alpine Linux
\`\`\`bash
apk add bash coreutils
wget -qO- https://getcroc.schollz.com | bash
\`\`\`

### Nix (nix-env)
\`\`\`bash
nix-env -i croc
\`\`\`

### Generic Linux installer
\`\`\`bash
curl https://getcroc.schollz.com | bash
\`\`\`

After installing, rerun this command.

Source: https://github.com/schollz/croc#readme
`;

export const CrocNotInstalledDetail = () => {
  return <Detail markdown={installInstructions} />;
};
