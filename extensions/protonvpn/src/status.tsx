import { List, Icon, Color, showToast, Toast, ActionPanel, Action } from '@vicinae/api';
import { useState, useEffect, useCallback } from 'react';
import {
  checkProtonVPNInstalled,
  getVPNStatus,
  getIPInfo,
  getLatency,
  connectVPN,
  disconnectVPN,
  reconnectVPN,
  CONNECT_DELAY,
  DISCONNECT_DELAY,
  type IPInfo,
  type LatencyInfo
} from './utils';

export default function Command() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [server, setServer] = useState<string | undefined>();
  const [protocol, setProtocol] = useState<string | undefined>();
  const [ipInfo, setIpInfo] = useState<IPInfo | null>(null);
  const [latency, setLatency] = useState<LatencyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wrapped in useCallback so we can call it after toggling
  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const installed = await checkProtonVPNInstalled();
      setIsInstalled(installed);

      if (!installed) {
        setIsLoading(false);
        return;
      }

      const status = await getVPNStatus();
      setIsConnected(status.isConnected);
      setServer(status.server);
      setProtocol(status.protocol);

      const ip = await getIPInfo();
      setIpInfo(ip);

      if (status.isConnected) {
        const lat = await getLatency();
        setLatency(lat);
      } else {
        setLatency(null);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleToggle() {
    try {
      setIsLoading(true);
      if (isConnected) {
        await showToast({
          style: Toast.Style.Animated,
          title: "Disconnecting...",
          message: `From ${server || "ProtonVPN"}`
        });
        await disconnectVPN();
        await new Promise(r => setTimeout(r, DISCONNECT_DELAY)); // Wait for system cleanup
        await showToast({
          style: Toast.Style.Success,
          title: "Disconnected",
          message: "ProtonVPN connection closed"
        });
      } else {
        await showToast({
          style: Toast.Style.Animated,
          title: "Connecting...",
          message: "Finding fastest server"
        });
        await connectVPN();
        await new Promise(r => setTimeout(r, CONNECT_DELAY)); // Wait for WireGuard handshake

        // Verify connection
        const newStatus = await getVPNStatus();
        if (newStatus.isConnected) {
          await showToast({
            style: Toast.Style.Success,
            title: "Connected",
            message: newStatus.server || "ProtonVPN connection established"
          });
        } else {
          await showToast({
            style: Toast.Style.Failure,
            title: "Connection Failed",
            message: "Unable to establish VPN connection"
          });
        }
      }
      await fetchStatus(); // Refresh everything
    } catch (err) {
      setIsLoading(false);
      await showToast({
        style: Toast.Style.Failure,
        title: "Action Failed",
        message: err instanceof Error ? err.message : String(err)
      });
    }
  }

  async function handleReconnect() {
    try {
      setIsLoading(true);
      await showToast({
        style: Toast.Style.Animated,
        title: "Changing Server...",
        message: "Reconnecting to new server"
      });

      await reconnectVPN();

      // Wait for new connection to establish
      await new Promise(r => setTimeout(r, CONNECT_DELAY));

      // Verify new connection
      const newStatus = await getVPNStatus();
      if (newStatus.isConnected) {
        await showToast({
          style: Toast.Style.Success,
          title: "Server Changed",
          message: newStatus.server || "Connected to new server"
        });
      } else {
        await showToast({
          style: Toast.Style.Failure,
          title: "Reconnection Failed",
          message: "Unable to connect to new server"
        });
      }

      await fetchStatus();
    } catch (err) {
      setIsLoading(false);
      await showToast({
        style: Toast.Style.Failure,
        title: "Server Change Failed",
        message: err instanceof Error ? err.message : String(err)
      });
    }
  }

  if (!isInstalled) {
    return (
      <List>
      <List.Item
      title="ProtonVPN Not Installed"
      subtitle="Click to download and install ProtonVPN"
      icon={{ source: Icon.XMarkCircle, tintColor: Color.Red }}
      actions={
        <ActionPanel>
        <Action.OpenInBrowser
        title="Download ProtonVPN"
        url="https://protonvpn.com/download"
        />
        </ActionPanel>
      }
      />
      </List>
    );
  }

  if (error) {
    return (
      <List>
      <List.Item
      title="Error"
      subtitle={error}
      icon={{ source: Icon.ExclamationMark, tintColor: Color.Red }}
      actions={
        <ActionPanel>
        <Action title="Retry" icon={Icon.Repeat} onAction={fetchStatus} />
        </ActionPanel>
      }
      />
      </List>
    );
  }

  return (
    <List isLoading={isLoading}>
    {/* Connection Status */}
    <List.Section title="Connection Status">
    <List.Item
    title={isConnected ? 'Connected' : 'Disconnected'}
    subtitle={isConnected ? (server || 'Connected to ProtonVPN') : 'Not connected'}
    icon={{
      source: Icon.Dot,
      tintColor: isConnected ? Color.Green : Color.Red
    }}
    actions={
      <ActionPanel>
      <Action title="Refresh" icon={Icon.Repeat} onAction={fetchStatus} />
      <Action
      title={isConnected ? "Disconnect" : "Connect"}
      icon={isConnected ? Icon.XMarkCircle : Icon.Wifi}
      onAction={handleToggle}
      />
      </ActionPanel>
    }
    />
    </List.Section>

    {/* IP Information */}
    {ipInfo && (
      <List.Section title="IP Information">
      <List.Item
      title="IP Address"
      subtitle={ipInfo.ip}
      icon={Icon.Globe}
      actions={
        <ActionPanel>
        <Action.CopyToClipboard
        title="Copy IP Address"
        content={ipInfo.ip}
        />
        </ActionPanel>
      }
      />
      <List.Item
      title="Location"
      subtitle={`${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country}`}
      icon={Icon.Pin}
      accessories={[{ text: ipInfo.countryCode }]}
      />
      <List.Item
      title="ISP"
      subtitle={ipInfo.isp}
      icon={Icon.Network}
      />
      </List.Section>
    )}

    {/* Latency Information */}
    {isConnected && latency && (
      <List.Section title="Network Performance">
      <List.Item
      title="Average Latency"
      subtitle={`${latency.avg.toFixed(2)} ms`}
      icon={Icon.Gauge}
      accessories={[
        {
          text: `Min: ${latency.min.toFixed(2)}ms`,
                                tooltip: 'Minimum latency'
        }
      ]}
      />
      <List.Item
      title="Max Latency"
      subtitle={`${latency.max.toFixed(2)} ms`}
      icon={Icon.ChartBar}
      />
      <List.Item
      title="Packet Loss"
      subtitle={`${latency.loss.toFixed(1)}%`}
      icon={{
        source: Icon.Dot,
        tintColor: latency.loss === 0 ? Color.Green : latency.loss < 5 ? Color.Yellow : Color.Red
      }}
      />
      </List.Section>
    )}

    {/* Quick Actions */}
    <List.Section title="Quick Actions">
    <List.Item
    title={isConnected ? 'Disconnect VPN' : 'Connect VPN'}
    subtitle={isConnected ? 'Disconnect from ProtonVPN' : 'Connect to fastest server'}
    icon={{
      source: isConnected ? Icon.XMarkCircle : Icon.Checkmark,
      tintColor: isConnected ? Color.Red : Color.Green
    }}
    actions={
      <ActionPanel>
      <Action
      title={isConnected ? "Disconnect" : "Connect"}
      icon={isConnected ? Icon.XMarkCircle : Icon.Wifi}
      onAction={handleToggle}
      />
      </ActionPanel>
    }
    />
    {/* ONLY show Change Server if connected */}
    {isConnected && (
      <List.Item
      title="Change Server"
      subtitle="Reconnect to rotate IP"
      icon={Icon.ArrowClockwise}
      actions={
        <ActionPanel>
        <Action
        title="Change Server"
        icon={Icon.ArrowClockwise}
        onAction={handleReconnect}
        />
        </ActionPanel>
      }
      />
    )}
    </List.Section>
    </List>
  );
}
