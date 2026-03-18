import { Detail } from "@vicinae/api";

const INSTALL_DEEPLINK =
  'vicinae://extensions/FredrikMWold/npm-manager/npm-install?arguments={\"pwd\":\"$(pwd)\"}"';
const UNINSTALL_DEEPLINK =
  'vicinae://extensions/FredrikMWold/npm-manager/npm-uninstall?arguments={\"pwd\":\"$(pwd)\"}"';
const UPDATE_DEEPLINK =
  'vicinae://extensions/FredrikMWold/npm-manager/npm-update?arguments={\"pwd\":\"$(pwd)\"}"';

export const NpmTerminalUsageDetails = () => {
  return (
    <Detail
      markdown={`# Run this from your terminal

This command needs a project directory and should be launched from the terminal context.




## Available deeplinks

- Install: \`${INSTALL_DEEPLINK}\`
- Uninstall: \`${UNINSTALL_DEEPLINK}\`
- Update: \`${UPDATE_DEEPLINK}\`

## Suggested aliases for ~/.bashrc

\`\`\`bash
npmi() {
    vicinae 'vicinae://extensions/FredrikMWold/npm-manager/npm-install?arguments={"pwd":"'"$(pwd)"'"}'
}
npmr() {
    vicinae 'vicinae://extensions/FredrikMWold/npm-manager/npm-uninstall?arguments={"pwd":"'"$(pwd)"'"}'
}
npmu() {
    vicinae 'vicinae://extensions/FredrikMWold/npm-manager/npm-update?arguments={"pwd":"'"$(pwd)"'"}'
}
\`\`\``}
    />
  );
};
