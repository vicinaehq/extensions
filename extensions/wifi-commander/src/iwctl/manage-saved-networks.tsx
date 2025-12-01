import { Action, ActionPanel, Color, Icon, List, showToast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { executeIwctlCommand, executeIwctlCommandSilent } from "../utils/execute-iwctl";
import {
  type CurrentConnection,
  loadCurrentConnection,
  loadSavedNetworks,
  loadWifiDevice,
  parseWifiList,
  addAutoconnect,
  type SavedNetwork,
  type WifiDevice,
} from "../utils/wifi-helpers-iwctl";
import type { ExecResult } from "../utils/execute-command";

interface SavedNetworksResult {
  networks: SavedNetwork[];
  isLoading: boolean;
  error: string | null;
}

export default function ManageSavedNetworksIwctl() {

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
    // if it doesnt work call loadWifiDevice here aswell
    // Always load device fresh, don't rely on state
    const device = await loadWifiDevice();
    if (!device) {
      throw new Error("No WiFi device found");
    }
    const connection = await loadCurrentConnection(device?.name);
    setCurrentConnection(connection);
  };

  const loadAvailableNetworks = async () => {
    try {
      // Always load device fresh, don't rely on state
      const device = await loadWifiDevice();
      if (!device) {
        throw new Error("No WiFi device found");
      }

      const executeScan = await executeIwctlCommandSilent("station", [device.name, "scan"])

      if (!executeScan.success){
        // only info since scanning gives error if still scanning
        console.info(executeScan.error || "station scan failed.");
      }

      const result = await executeIwctlCommandSilent("station", [device.name, "get-networks", "rssi-dbms"])

      if (result.success) {
        const networks = await parseWifiList(result.stdout, device.name);
        const ssids = networks.map((network) => network.ssid).filter((ssid) => ssid);
        setAvailableNetworks(ssids);
      }
    } catch (error) {
      console.error("Failed to load available networks:", error);
    }
  };

  const loadSavedNetworksData = async () => {
    try {
      setSavedNetworks((prev) => ({ ...prev, isLoading: true, error: null }));

      const preNetworks = await loadSavedNetworks();
      const networks = await addAutoconnect(preNetworks);

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

    const result = await executeIwctlCommand("station", [wifiDevice?.name, "connect", `"${networkName}"`]);

    if (result.success) {
      await showToast({
        title: "Connected",
        message: `Successfully connected to ${networkName}`,
      });
      loadSavedNetworksData(); // Refresh the list
      loadCurrentConnectionData(); // Refresh current connection
    } else {
      await showToast({
        title: "Connection Failed",
        message: result.error || `Could not connect to ${networkName}`,
      });
    }
  };

  const handleAutoConnect = async (networkName: string, autoconnect: string) => {
    let result;
    await showToast({
      title: "Toggling Autoconnect...",
      message: `Toggling Autoconnect for ${networkName}`,
    });

    if(autoconnect === "Unkown"){
      await showToast({
        title: "Toggling Autoconnect Failed",
        message: `Could not see Autoconnect status of ${networkName}`,
      });
    }

    if(autoconnect == "yes"){
      result = await executeIwctlCommand("known-networks", [`"${networkName}"`, "set-property", "AutoConnect", "no"]);
    }else{
      result = await executeIwctlCommand("known-networks", [`"${networkName}"`, "set-property", "AutoConnect", "yes"]);
    }


    if (result.success) {
      await showToast({
        title: "Connected",
        message: `Successfully connected to ${networkName}`,
      });
      loadSavedNetworksData(); // Refresh the list
      loadCurrentConnectionData(); // Refresh current connection
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

    const result = await executeIwctlCommand("station ", [wifiDevice.name,  "disconnect"]);

    if (result.success) {
      await showToast({
        title: "Disconnected",
        message: "Successfully disconnected from current network",
      });
      loadWifiDeviceData(); // Refresh device status
      loadSavedNetworksData(); // Refresh the list
      loadCurrentConnectionData(); // Refresh current connection
    } else {
      await showToast({
        title: "Disconnect Failed",
        message: result.error || "Could not disconnect from current network",
      });
    }
  };

  const handleForget = async (networkName: string) => {
    await showToast({
      title: "Forgetting Network",
      message: `Removing ${networkName} from saved networks`,
    });

    const result = await executeIwctlCommand("known-networks", [`"${networkName}"`, "forget"]);

    if (result.success) {
      await showToast({
        title: "Network Forgotten",
        message: `${networkName} has been removed from saved networks`,
      });
      loadSavedNetworksData(); // Refresh the list
    } else {
      await showToast({
        title: "Failed to Forget Network",
        message: result.error || `Could not remove ${networkName}`,
      });
    }
  };


  // not sure if im going to implement this. since i cant get to this info of activating. only in use
  const getStateIcon = (networkState: string) => {
    switch (networkState.toLowerCase()) {
      case "activated":
        return Icon.CheckCircle;
      case "activating":
        return Icon.Clock;
      default:
        return Icon.Circle;
    }
  };

    // same with this one
  const getStateColor = (networkState: string) => {
    switch (networkState.toLowerCase()) {
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
    loadSavedNetworksData();
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
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={loadSavedNetworksData} />
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
            key={network.name}
            title={network.name}
            icon={{
              source: getStateIcon(currentConnection?.name === network.name ? "Activated" : "Disconnected"),
              tintColor: getStateColor(currentConnection?.name === network.name ? "Activated" : "Disconnected"),
            }}
            detail={
              <List.Item.Detail
                markdown={`# ${network.name}`}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label
                      title="Device"
                      text={wifiDevice?.name || "No device"}
                    />
                    <List.Item.Detail.Metadata.Label title="Security" text={network.security} />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.Label title="Auto Connect" text={network.autoconnect} />
                    <List.Item.Detail.Metadata.Label title="Hidden" text={network.hidden} />
                    <List.Item.Detail.Metadata.Label title="Last Used" text={network.last_used} />
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
                ) }
                <Action
                  title="Connect"
                  icon={Icon.Wifi}
                  onAction={() => handleConnect(network.name)}
                  shortcut={{ modifiers: ["cmd"], key: "enter" }}
                />
                <Action
                  title="Forget Network"
                  icon={Icon.Trash}
                  onAction={() => handleForget(network.name)}
                  shortcut={{ modifiers: ["cmd"], key: "delete" }}
                />
                <Action
                    title="Toggle AutoConnect"
                    icon={Icon.Repeat}
                    onAction={() => handleAutoConnect(network.name, network.autoconnect)}
                    shortcut={{ modifiers: ["cmd"], key: "a" }}
                  />
                <Action.CopyToClipboard
                  title="Copy Network Name"
                  content={network.name}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  onAction={() => {
                    loadWifiDeviceData();
                    loadCurrentConnectionData();
                    loadAvailableNetworks();
                    loadSavedNetworksData();
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
