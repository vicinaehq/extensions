import { Detail } from "@vicinae/api";

const INSTALL_DEEPLINK =
  'vicinae://launch/@FredrikMWold/npm/npm-install?arguments={\"path\":\"$(pwd)\"}"';
const UNINSTALL_DEEPLINK =
  'vicinae://launch/@FredrikMWold/npm/npm-uninstall?arguments={\"path\":\"$(pwd)\"}"';
const UPDATE_DEEPLINK =
  'vicinae://launch/@FredrikMWold/npm/npm-update?arguments={\"path\":\"$(pwd)\"}"';

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
    vicinae 'vicinae://launch/@FredrikMWold/npm/npm-install?arguments={"path":"'"$(pwd)"'"}'
}
npmr() {
    vicinae 'vicinae://launch/@FredrikMWold/npm/npm-uninstall?arguments={"path":"'"$(pwd)"'"}'
}
npmu() {
    vicinae 'vicinae://launch/@FredrikMWold/npm/npm-update?arguments={"path":"'"$(pwd)"'"}'
}
\`\`\``}
    />
  );
};
