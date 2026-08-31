import { Action, ActionPanel, Icon, List, Color, showToast, Toast } from "@vicinae/api";
import {
  getStatus,
  connect,
  doDisconnect,
  type ConnectionStatus,
  ProtonVPNError,
} from "@/lib/protonvpn";
import { useProtonGuard, ProtonGuard } from "@/lib/guard";
import { useState, useEffect, useRef } from "react";

export default function VPNStatus() {
  const guard = useProtonGuard();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [showDetail, setShowDetail] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const guardRef = useRef(guard);
  guardRef.current = guard;

  const loadStatus = () => {
    setLoadingStatus(true);
    setStatusError(null);
    getStatus()
      .then((s) => { setStatus(s); setLoadingStatus(false); })
      .catch((err) => {
        const msg = err instanceof ProtonVPNError ? err.message : "Failed to get status";
        setStatusError(msg);
        setLoadingStatus(false);
      });
  };

  useEffect(() => {
    if (guard.state === "ready") loadStatus();
  }, [guard.state]);

  if (guard.state !== "ready") {
    return <ProtonGuard state={guard.state} onRefresh={guard.refresh}><List isLoading /></ProtonGuard>;
  }

  if (loadingStatus) {
    return <List isLoading />;
  }

  const isConnected = status?.connected ?? false;

  return (
    <ProtonGuard state={guard.state} onRefresh={guard.refresh}>
      <List isShowingDetail={showDetail}>
        {statusError && (
          <List.Section title="Error">
            <List.Item
              title={statusError}
              icon={{ source: Icon.Warning, tintColor: Color.Yellow }}
              actions={
                <ActionPanel>
                  <Action title="Retry" icon={Icon.ArrowClockwise} onAction={loadStatus} />
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
            detail={
              <List.Item.Detail
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label
                      title="Status"
                      text={isConnected ? "Connected" : "Disconnected"}
                      icon={{ source: Icon.CircleFilled, tintColor: isConnected ? Color.Green : Color.Red }}
                    />
                    {isConnected && status && (
                      <>
                        <List.Item.Detail.Metadata.Separator />
                        {status.server && (
                          <List.Item.Detail.Metadata.Label title="Server" text={status.server} icon={Icon.Globe01} />
                        )}
                        {status.country && (
                          <List.Item.Detail.Metadata.Label title="Country" text={status.country} icon={Icon.Flag} />
                        )}
                        {status.city && (
                          <List.Item.Detail.Metadata.Label title="City" text={status.city} icon={Icon.Pin} />
                        )}
                        {status.ip && (
                          <List.Item.Detail.Metadata.Label title="IP Address" text={status.ip} icon={Icon.Desktop} />
                        )}
                        {status.protocol && (
                          <List.Item.Detail.Metadata.Label title="Protocol" text={status.protocol} icon={Icon.Lock} />
                        )}
                        {status.uptime && (
                          <List.Item.Detail.Metadata.Label title="Uptime" text={status.uptime} icon={Icon.Clock} />
                        )}
                        {status.load && (
                          <List.Item.Detail.Metadata.Label title="Server Load" text={status.load} icon={Icon.BarChart} />
                        )}
                      </>
                    )}
                    {!isConnected && (
                      <>
                        <List.Item.Detail.Metadata.Separator />
                        <List.Item.Detail.Metadata.Label
                          title="Tip"
                          text="Use Quick Connect to connect to a free server"
                          icon={Icon.Info01}
                        />
                      </>
                    )}
                  </List.Item.Detail.Metadata>
                }
              />
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
                          await showToast({ style: Toast.Style.Success, title: "Disconnected" });
                          loadStatus();
                        } catch (err) {
                          await showToast({
                            style: Toast.Style.Failure,
                            title: "Disconnect failed",
                            message: err instanceof Error ? err.message : "Unknown error",
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
                    title="Quick Connect"
                    icon={Icon.Plug}
                    onAction={async () => {
                      await showToast({ style: Toast.Style.Animated, title: "Connecting..." });
                      try {
                        await connect({});
                        await showToast({ style: Toast.Style.Success, title: "Connected to ProtonVPN" });
                        refreshStatus();
                      } catch (err) {
                        const msg = err instanceof ProtonVPNError ? err.message : "Connection failed";
                        await showToast({ style: Toast.Style.Failure, title: msg });
                      }
                    }}
                  />
                )}
                <Action
                  title={showDetail ? "Hide Details" : "Show Details"}
                  icon={showDetail ? Icon.EyeDisabled : Icon.Eye}
                  onAction={() => setShowDetail(!showDetail)}
                  shortcut={{ modifiers: ["cmd"], key: "d" }}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      </List>
    </ProtonGuard>
  );
}
