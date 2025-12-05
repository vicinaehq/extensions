import { Action, ActionPanel, Color, Icon, List, showToast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { executeNmcliCommand, executeNmcliCommandSilent } from "../utils/execute-nmcli";
import {
  type CurrentConnection,
  loadCurrentConnection,
  loadWifiDevice,
  parseWifiList,
  type SavedNetwork,
  type WifiDevice,
} from "../utils/wifi-helpers-nmcli";

interface SavedNetworksResult {
  networks: SavedNetwork[];
  isLoading: boolean;
  error: string | null;
}

function parseSavedConnections(output: string): SavedNetwork[] {
  const lines = output.split("\n").filter((line) => line.trim());

  if (lines.length < 2) {
    return [];
  }

  return lines
    .slice(1)
    .map((line) => {
      const parts = line.split(/\s{2,}/);
      if (parts.length < 4) return null;

      return {
        name: parts[0] || "",
        uuid: parts[1] || "",
        type: parts[2] || "",
        device: parts[3] || "",
        state: parts[4] || "",
      };
    })
    .filter(Boolean) as SavedNetwork[];
}

export default function ManageSavedNetworksNmcli() {
  const [savedNetworks, setSavedNetworks] = useState<SavedNetworksResult>({
    networks: [],
    isLoading: true,
    error: null,
  });
  const [currentConnection, setCurrentConnection] = useState<CurrentConnection | null>(null);
  const [wifiDevice, setWifiDevice] = useState<WifiDevice | null>(null);
  const [availableNetworks, setAvailableNetworks] = useState<string[]>([]);

  const loadWifiDeviceData = async () => {
    const device = await loadWifiDevice();
    setWifiDevice(device);
  };

  const loadCurrentConnectionData = async () => {
    const connection = await loadCurrentConnection();
    setCurrentConnection(connection);
  };

  const loadAvailableNetworks = async () => {
    try {
      const result = await executeNmcliCommandSilent("device wifi list --rescan yes");
      if (result.success) {
        const networks = parseWifiList(result.stdout);
        const ssids = networks.map((network) => network.ssid).filter((ssid) => ssid);
        setAvailableNetworks(ssids);
      }
    } catch (error) {
      console.error("Failed to load available networks:", error);
    }
  };

  const loadSavedNetworks = async () => {
    try {
      setSavedNetworks((prev) => ({ ...prev, isLoading: true, error: null }));

      const result = await executeNmcliCommandSilent("connection show");

      if (!result.success) {
        setSavedNetworks((prev) => ({
          ...prev,
          isLoading: false,
          error: result.error || "Failed to load saved networks",
        }));
        return;
      }

      const networks = parseSavedConnections(result.stdout);

      setSavedNetworks({
        networks,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setSavedNetworks({
        networks: [],
        isLoading: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  };

  const handleConnect = async (networkName: string) => {
    await showToast({
      title: "Connecting...",
      message: `Connecting to ${networkName}`,
    });

    const result = await executeNmcliCommand("connection up", [`"${networkName}"`]);

    if (result.success) {
      await showToast({
        title: "Connected",
        message: `Successfully connected to ${networkName}`,
      });
      loadSavedNetworks(); // Refresh the list
      loadCurrentConnection(); // Refresh current connection
    } else {
      await showToast({
        title: "Connection Failed",
        message: result.error || `Could not connect to ${networkName}`,
      });
    }
  };

  const handleDisconnect = async () => {
    if (!wifiDevice) {
      await showToast({
        title: "Disconnect Failed",
        message: "No Wi-Fi device found",
      });
      return;
    }

    await showToast({
      title: "Disconnecting...",
      message: "Disconnecting from current network",
    });

    const result = await executeNmcliCommand("device disconnect", [wifiDevice.name]);

    if (result.success) {
      await showToast({
        title: "Disconnected",
        message: "Successfully disconnected from current network",
      });
      loadWifiDeviceData(); // Refresh device status
      loadSavedNetworks(); // Refresh the list
      loadCurrentConnectionData(); // Refresh current connection
    } else {
      await showToast({
        title: "Disconnect Failed",
        message: result.error || "Could not disconnect from current network",
      });
    }
  };

  const handleForget = async (networkName: string, uuid: string) => {
    await showToast({
      title: "Forgetting Network",
      message: `Removing ${networkName} from saved networks`,
    });

    const result = await executeNmcliCommand("connection delete", [uuid]);

    if (result.success) {
      await showToast({
        title: "Network Forgotten",
        message: `${networkName} has been removed from saved networks`,
      });
      loadSavedNetworks(); // Refresh the list
    } else {
      await showToast({
        title: "Failed to Forget Network",
        message: result.error || `Could not remove ${networkName}`,
      });
    }
  };

  const getStateIcon = (network: SavedNetwork) => {
    const isConnected = currentConnection?.name === network.name;
    if (isConnected) {
      return Icon.CheckCircle;
    }
    switch (network.state.toLowerCase()) {
      case "activated":
        return Icon.CheckCircle;
      case "activating":
        return Icon.Clock;
      default:
        return Icon.Circle;
    }
  };

  const getStateColor = (network: SavedNetwork) => {
    const isConnected = currentConnection?.name === network.name;
    if (isConnected) {
      return Color.Green;
    }
    switch (network.state.toLowerCase()) {
      case "activated":
        return Color.Green;
      case "activating":
        return Color.Orange;
      default:
        return Color.SecondaryText;
    }
  };

  useEffect(() => {
    loadWifiDeviceData();
    loadCurrentConnectionData();
    loadAvailableNetworks();
    loadSavedNetworks();
  }, []);

  if (savedNetworks.isLoading) {
    return (
      <List searchBarPlaceholder="Loading saved networks...">
        <List.EmptyView
          title="Loading Saved Networks"
          description="Please wait while we load your saved Wi-Fi networks..."
          icon={Icon.Clock}
        />
      </List>
    );
  }

  if (savedNetworks.error) {
    return (
      <List searchBarPlaceholder="Search saved networks...">
        <List.EmptyView
          title="Failed to Load Networks"
          description={savedNetworks.error}
          icon={Icon.ExclamationMark}
          actions={
            <ActionPanel>
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={loadSavedNetworks} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (savedNetworks.networks.length === 0) {
    return (
      <List searchBarPlaceholder="Search saved networks...">
        <List.EmptyView
          title="No Saved Networks"
          description="No saved Wi-Fi networks found. Connect to a network first to save it."
          icon={Icon.Wifi}
        />
      </List>
    );
  }

  return (
    <List searchBarPlaceholder="Search saved networks..." isShowingDetail={true}>
      <List.Section title={`Saved Networks (${savedNetworks.networks.length})`}>
        {savedNetworks.networks.map((network) => (
          <List.Item
            key={network.uuid}
            title={network.name}
            icon={{
              source: getStateIcon(network),
              tintColor: getStateColor(network),
            }}
            detail={
              <List.Item.Detail
                markdown={`# ${network.name}`}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Type" text={network.type} />
                    <List.Item.Detail.Metadata.Label
                      title="Device"
                      text={network.device || "No device"}
                    />
                    <List.Item.Detail.Metadata.Label title="State" text={network.state} />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.Label title="UUID" text={network.uuid} />
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                {currentConnection?.name === network.name && (
                  <Action
                    title="Disconnect"
                    icon={Icon.XMarkCircle}
                    onAction={handleDisconnect}
                    shortcut={{ modifiers: ["cmd"], key: "d" }}
                  />
                )}
                <Action
                  title="Connect"
                  icon={Icon.Wifi}
                  onAction={() => handleConnect(network.name)}
                  shortcut={{ modifiers: ["cmd"], key: "enter" }}
                />
                <Action
                  title="Forget Network"
                  icon={Icon.Trash}
                  onAction={() => handleForget(network.name, network.uuid)}
                  shortcut={{ modifiers: ["cmd"], key: "delete" }}
                />
                <Action.CopyToClipboard
                  title="Copy Network Name"
                  content={network.name}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
                <Action.CopyToClipboard
                  title="Copy UUID"
                  content={network.uuid}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  onAction={() => {
                    loadWifiDeviceData();
                    loadCurrentConnectionData();
                    loadAvailableNetworks();
                    loadSavedNetworks();
                  }}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
