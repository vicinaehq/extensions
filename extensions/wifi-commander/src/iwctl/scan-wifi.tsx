import { Action, ActionPanel, Color, Icon, List, showToast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
import {
  loadSavedNetworks,
  loadWifiDevice,
  parseWifiList,
  getBssid,
  type SavedNetwork,
  type WifiDevice,
  type WifiNetwork,
} from "../utils/wifi-helpers-iwctl";
import { executeIwctlCommandSilent } from "../utils/execute-iwctl";

interface ScanResult {
  networks: WifiNetwork[];
  isLoading: boolean;
  error: string | null;
}

export default function ScanWifiIwctl() {
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
    return device
  };

  const loadSavedNetworksData = async () => {
    const networks = await loadSavedNetworks();
    setSavedNetworks(networks);
  };

  const scanWifi = async () => {
    try {
      setScanResult((prev) => ({ ...prev, isLoading: true, error: null }));

      // Always load device fresh, don't rely on state
      const device = await loadWifiDevice();
      if (!device) {
        throw new Error("No WiFi device found");
      }
      
      const executeScan = await executeIwctlCommandSilent("station", [device.name, "scan"])
      if (!executeScan.success){
        throw new Error(executeScan.error || "station scan failed")
      }
      
      const result = await executeIwctlCommandSilent("station", [device.name, "get-networks", "rssi-dbms"])
      
      if (!result.success) {
        setScanResult((prev) => ({
          ...prev,
          isLoading: false,
          error: result.error || "Failed to scan wifi networks",
        }));
        return;
      }
      const networks = await parseWifiList(result.stdout, device.name);
      
      setScanResult({
        networks: networks,
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
    console.log("no Errors in scan")
  };

  const getSignalIcon = (rssi: number) => {
    if (rssi >= -50) return Icon.FullSignal;
    if (rssi >= -60) return Icon.Signal3;
    if (rssi >= -70) return Icon.Signal2;
    if (rssi >= -80) return Icon.Signal1;
    if (rssi >= -100) return "signal-0";
  };
  
  const getSignalPercent = (rssi: number) => {
    if (rssi <= -100) return 0;
    if (rssi >= -50) return 100;
  
    const percent = 2 * (rssi + 100);
    return Math.round(percent);
  };
  

  
  const getSecurityIcon = (security: string) => {
    if (security.includes("open")) return Icon.LockUnlocked;
    return Icon.Lock;
  };

  const handleDisconnect = async () => {
    console.log("called handleDIsconnect")
    return
  }

  const handleConnect = async (ssid: string, security: string) => {
    console.log("called connect")
    return
  }



  useEffect(() => {
    loadWifiDeviceData();
    loadSavedNetworksData();
    scanWifi();
  }, []);

  console.log("About to render final return");
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
            subtitle={`${getSignalPercent(network.signal)}% signal • ${network.security}`}
            icon={network.inUse ? Icon.CheckCircle : getSignalIcon(network.signal)}
            accessories={[
              {
                text: network.inUse ? "Connected" : "",
              },
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
                      text={`${getSignalPercent(network.signal)}%`}
                    />
                    <List.Item.Detail.Metadata.Label title="Security" text={network.security} />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.Label title="BSSID" text={network.bssid} />
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


