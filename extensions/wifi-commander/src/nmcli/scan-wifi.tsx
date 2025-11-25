import { Action, ActionPanel, Color, Icon, List, showToast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
import ConnectForm from "../components/ConnectFormNmcli";
import { executeNmcliCommand, executeNmcliCommandSilent } from "../utils/execute-nmcli";
import {
  loadSavedNetworks,
  loadWifiDevice,
  parseWifiList,
  type SavedNetwork,
  sortNetworks,
  type WifiDevice,
  type WifiNetwork,
} from "../utils/wifi-helpers-nmcli";

interface ScanResult {
  networks: WifiNetwork[];
  isLoading: boolean;
  error: string | null;
}

export default function ScanWifiNmcli() {
  const { push } = useNavigation();
  const [scanResult, setScanResult] = useState<ScanResult>({
    networks: [],
    isLoading: true,
    error: null,
  });
  const [savedNetworks, setSavedNetworks] = useState<SavedNetwork[]>([]);
  const [wifiDevice, setWifiDevice] = useState<WifiDevice | null>(null);

  const loadWifiDeviceData = async () => {
    const device = await loadWifiDevice();
    setWifiDevice(device);
  };

  const loadSavedNetworksData = async () => {
    const networks = await loadSavedNetworks();
    setSavedNetworks(networks);
  };

  const scanWifi = async () => {
    try {
      setScanResult((prev) => ({ ...prev, isLoading: true, error: null }));

      const result = await executeNmcliCommandSilent("device wifi list --rescan yes");

      if (!result.success) {
        setScanResult((prev) => ({
          ...prev,
          isLoading: false,
          error: result.error || "Failed to scan wifi networks",
        }));
        return;
      }

      const networks = parseWifiList(result.stdout);
      const sortedNetworks = sortNetworks(networks);

      setScanResult({
        networks: sortedNetworks,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setScanResult({
        networks: [],
        isLoading: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  };

  const handleConnect = async (ssid: string, security: string) => {
    // Check if this network is already saved
    const isSaved = savedNetworks.some((network) => network.name === ssid);

    // If the network is not secure, connect directly
    if (!security || security.toLowerCase() === "open") {
      await showToast({
        title: "Connecting...",
        message: `Attempting to connect to open network ${ssid}`,
      });
      const result = await executeNmcliCommand("device wifi connect", [`"${ssid}"`]);
      if (result.success) {
        await showToast({
          title: "Connection Successful",
          message: `Successfully connected to ${ssid}`,
        });
        scanWifi(); // Refresh the list to show connected status
      } else {
        await showToast({
          title: "Connection Failed",
          message: result.error || `Could not connect to ${ssid}`,
        });
      }
    } else if (isSaved) {
      // If the network is saved, connect using the saved connection
      await showToast({
        title: "Connecting...",
        message: `Connecting to saved network ${ssid}`,
      });
      const result = await executeNmcliCommand("connection up", [`"${ssid}"`]);
      if (result.success) {
        await showToast({
          title: "Connection Successful",
          message: `Successfully connected to ${ssid}`,
        });
        scanWifi(); // Refresh the list to show connected status
      } else {
        await showToast({
          title: "Connection Failed",
          message: result.error || `Could not connect to ${ssid}`,
        });
      }
    } else {
      // If the network is secure and not saved, push the password form
      push(<ConnectForm ssid={ssid} />);
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
      scanWifi(); // Refresh the list to update connection status
    } else {
      await showToast({
        title: "Disconnect Failed",
        message: result.error || "Could not disconnect from current network",
      });
    }
  };

  const getSignalIcon = (signal: number) => {
    if (signal >= 75) return Icon.Wifi;
    if (signal >= 50) return Icon.Wifi;
    if (signal >= 25) return Icon.Wifi;
    return Icon.Wifi;
  };

  const getSecurityIcon = (security: string) => {
    if (security.includes("WPA2")) return Icon.Lock;
    if (security.includes("WPA1")) return Icon.Lock;
    if (security.includes("WEP")) return Icon.Lock;
    return Icon.LockUnlocked;
  };

  useEffect(() => {
    loadWifiDeviceData();
    loadSavedNetworksData();
    scanWifi();
  }, []);

  if (scanResult.isLoading) {
    return (
      <List searchBarPlaceholder="Scanning wifi networks...">
        <List.EmptyView
          title="Scanning Networks"
          description="Please wait while we scan for available wifi networks..."
          icon={Icon.Clock}
        />
      </List>
    );
  }

  if (scanResult.error) {
    return (
      <List searchBarPlaceholder="Search wifi networks...">
        <List.EmptyView
          title="Scan Failed"
          description={scanResult.error}
          icon={Icon.ExclamationMark}
          actions={
            <ActionPanel>
              <Action title="Retry Scan" icon={Icon.ArrowClockwise} onAction={scanWifi} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (scanResult.networks.length === 0) {
    return (
      <List searchBarPlaceholder="Search wifi networks...">
        <List.EmptyView
          title="No Networks Found"
          description="No wifi networks were found. Make sure wifi is enabled."
          icon={Icon.Wifi}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={scanWifi} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List searchBarPlaceholder="Search wifi networks..." isShowingDetail={true}>
      <List.Section title={`Available Networks (${scanResult.networks.length})`}>
        {scanResult.networks.map((network) => (
          <List.Item
            key={`${network.bssid}-${network.ssid || "hidden"}`}
            title={network.ssid || "Hidden Network"}
            icon={{
              source: network.inUse ? Icon.CheckCircle : getSignalIcon(network.signal),
              tintColor: network.inUse ? Color.Green : "white",
            }}
            accessories={[
              {
                icon: getSecurityIcon(network.security),
                tooltip: network.security,
              },
            ]}
            detail={
              <List.Item.Detail
                markdown={`# ${network.ssid || "Hidden Network"}`}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label
                      title="Signal Strength"
                      text={`${network.signal}%`}
                    />
                    <List.Item.Detail.Metadata.Label title="Rate" text={network.rate} />
                    <List.Item.Detail.Metadata.Label title="Security" text={network.security} />
                    <List.Item.Detail.Metadata.Label title="Channel" text={`${network.channel}`} />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.Label title="BSSID" text={network.bssid} />
                    <List.Item.Detail.Metadata.Label title="Mode" text={network.mode} />
                    {network.inUse && (
                      <>
                        <List.Item.Detail.Metadata.Separator />
                        <List.Item.Detail.Metadata.Label
                          title="Status"
                          text="Connected"
                          icon={{ source: Icon.CheckCircle, tintColor: Color.Green }}
                        />
                      </>
                    )}
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                {network.inUse ? (
                  <Action
                    title="Disconnect"
                    icon={Icon.XMarkCircle}
                    onAction={handleDisconnect}
                    shortcut={{ modifiers: ["cmd"], key: "d" }}
                  />
                ) : (
                  <Action
                    title="Connect"
                    icon={Icon.Wifi}
                    onAction={() => handleConnect(network.ssid, network.security)}
                    shortcut={{ modifiers: ["cmd"], key: "enter" }}
                  />
                )}
                <Action.CopyToClipboard
                  title="Copy SSID"
                  content={network.ssid}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
                <Action.CopyToClipboard
                  title="Copy BSSID"
                  content={network.bssid}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  onAction={scanWifi}
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
