import {
  Action,
  ActionPanel,
  Icon,
  List,
  Color,
  showToast,
  Toast,
} from "@vicinae/api";
import {
  getStatus,
  connect,
  doDisconnect,
  type ConnectionStatus,
  ProtonVPNError,
} from "@/lib/protonvpn";
import { useState, useEffect } from "react";

export default function VPNStatus() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    getStatus()
      .then((s) => {
        setStatus(s);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof ProtonVPNError) {
          setError(err.message);
        } else {
          setError("Failed to get VPN status");
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    refresh();
  }, []);

  if (loading) {
    return <List isLoading />;
  }

  const isConnected = status?.connected ?? false;

  return (
    <List>
      {error && (
        <List.Section title="Error">
          <List.Item
            title={error}
            icon={{ source: Icon.Warning, tintColor: Color.Yellow }}
            actions={
              <ActionPanel>
                <Action
                  title="Retry"
                  icon={Icon.ArrowClockwise}
                  onAction={refresh}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      <List.Section title="Connection Status">
        <List.Item
          title={isConnected ? "Connected" : "Disconnected"}
          icon={{
            source: Icon.CircleFilled,
            tintColor: isConnected ? Color.Green : Color.Red,
          }}
          subtitle={
            isConnected && status?.server
              ? `Server: ${status.server}`
              : "No active connection"
          }
          actions={
            <ActionPanel>
              {isConnected ? (
                <>
                  <Action
                    title="Disconnect"
                    icon={Icon.Minus}
                    onAction={async () => {
                      try {
                        await doDisconnect();
                        await showToast({
                          style: Toast.Style.Success,
                          title: "Disconnected from ProtonVPN",
                        });
                        refresh();
                      } catch (err) {
                        await showToast({
                          style: Toast.Style.Failure,
                          title: "Disconnect failed",
                          message:
                            err instanceof Error
                              ? err.message
                              : "Unknown error",
                        });
                      }
                    }}
                  />
                  <Action.CopyToClipboard
                    title="Copy Server"
                    content={status?.server ?? ""}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                  <Action.CopyToClipboard
                    title="Copy IP"
                    content={status?.ip ?? ""}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  />
                </>
              ) : (
                <Action
                  title="Connect"
                  icon={Icon.Plug}
                  onAction={async () => {
                    await showToast({
                      style: Toast.Style.Animated,
                      title: "Connecting...",
                    });
                    try {
                      await connect({});
                      await showToast({
                        style: Toast.Style.Success,
                        title: "Connected to ProtonVPN",
                      });
                      refresh();
                    } catch (err) {
                      const msg =
                        err instanceof ProtonVPNError
                          ? err.message
                          : "Connection failed";
                      await showToast({
                        style: Toast.Style.Failure,
                        title: msg,
                      });
                    }
                  }}
                />
              )}
            </ActionPanel>
          }
        />
      </List.Section>

      {isConnected && status && (
        <List.Section title="Details">
          {status.country && (
            <List.Item
              title="Country"
              subtitle={status.country}
              icon={Icon.Globe01}
            />
          )}
          {status.city && (
            <List.Item title="City" subtitle={status.city} icon={Icon.Pin} />
          )}
          {status.ip && (
            <List.Item
              title="IP Address"
              subtitle={status.ip}
              icon={Icon.Desktop}
            />
          )}
          {status.protocol && (
            <List.Item
              title="Protocol"
              subtitle={status.protocol}
              icon={Icon.Lock}
            />
          )}
          {status.uptime && (
            <List.Item
              title="Uptime"
              subtitle={status.uptime}
              icon={Icon.Clock}
            />
          )}
          {status.load && (
            <List.Item
              title="Server Load"
              subtitle={status.load}
              icon={Icon.BarChart}
            />
          )}
        </List.Section>
      )}
    </List>
  );
}
