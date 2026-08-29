import Settings from "@/components/Settings";
import { WorkspaceProvider } from "@/hooks/useWorkspace";

export default function Command() {
  return (
    <WorkspaceProvider discover={false}>
      <Settings />
    </WorkspaceProvider>
  );
}
