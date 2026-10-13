import { type ReactNode } from "react";
import { useOpenCodeCommand } from "./components/command-gate";
import { SessionListView } from "./components/session-list";

export default function SessionsCommand(): ReactNode {
  const command = useOpenCodeCommand();
  if (!command.ready) return command.view;
  return (
    <SessionListView endpoint={command.endpoint} config={command.config} navigationTitle="OpenCode Sessions" />
  );
}
