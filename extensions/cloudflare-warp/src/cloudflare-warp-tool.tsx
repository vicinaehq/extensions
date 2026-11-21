import { Action, ActionPanel, Icon, List, showToast, Toast } from "@vicinae/api";
import { exec } from "child_process";
import { promisify } from "util";
import { useEffect, useState } from "react";

const execAsync = promisify(exec);

async function checkWarpCli(): Promise<boolean> {
  try {
    await execAsync("which warp-cli");
    return true;
  } catch {
    return false;
  }
}

async function getStatus(): Promise<{ connected: boolean }> {
  const { stdout } = await execAsync("warp-cli status");
  const connected = !stdout.includes("Disconnected");
  return { connected };
}

export default function WarpHelper() {
  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    checkWarpCli().then(setCliAvailable);
  }, []);

  if (cliAvailable === null) {
    return <List isLoading />;
  }

  if (!cliAvailable) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="warp-cli not found"
          description={
            "This extension requires the Cloudflare Warp CLI.\n" +
            "Install it from: https://pkg.cloudflareclient.com"
          }
        />
      </List>
    );
  }

  return (
    <List searchBarPlaceholder="Search Warp commands...">
      <List.Section title="Warp CLI">
        <List.Item
          key="toggle"
          title="Toggle"
          subtitle="Connect or disconnect Warp"
          actions={
            <ActionPanel>
              <Action
                title="Toggle"
                onAction={async () => {
                  const toast = await showToast(Toast.Style.Animated, "Warp", "Checking status...");
                  try {
                    const { connected } = await getStatus();
                    if (connected) {
                      await execAsync("warp-cli disconnect");
                      toast.style = Toast.Style.Success;
                      toast.title = "Disconnected";
                      toast.message = "Warp disconnected";
                    } else {
                      await execAsync("warp-cli connect");
                      toast.style = Toast.Style.Success;
                      toast.title = "Connected";
                      toast.message = "Warp connected";
                    }
                  } catch (e) {
                    toast.style = Toast.Style.Failure;
                    toast.title = "Error";
                    toast.message = String(e);
                  }
                }}
              />
            </ActionPanel>
          }
        />
        <List.Item
          key="status"
          title="Status"
          subtitle="Check Warp connection status"
          actions={
            <ActionPanel>
              <Action
                title="Check Status"
                onAction={async () => {
                  const toast = await showToast(Toast.Style.Animated, "Warp", "Fetching status...");
                  try {
                    const { connected } = await getStatus();
                    toast.style = Toast.Style.Success;
                    toast.title = connected ? "Connected" : "Disconnected";
                    toast.message = connected ? "Warp is active" : "Warp is inactive";
                  } catch (e) {
                    toast.style = Toast.Style.Failure;
                    toast.title = "Error";
                    toast.message = String(e);
                  }
                }}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
