import { Action, ActionPanel, Color, Icon, List, showToast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
import {
  loadSavedNetworks,
  loadWifiDevice,
  parseWifiList,
  type SavedNetwork,
  sortNetworks,
  type WifiDevice,
  type WifiNetwork,
} from "../utils/wifi-helpers-iwctl";

interface ScanResult {
  networks: WifiNetwork[];
  isLoading: boolean;
  error: string | null;
}

export default async function ScanWifiIwctl() {
  await showToast({
    title: "TODO",
    message: "TODO: implement Scan Wifi for iwctl",
  });

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




  return (
    <List searchBarPlaceholder="Search wifi networks..." isShowingDetail={true}>
      <List.Section title={`Available Networks (${scanResult.networks.length})`}>
        {scanResult.networks.map((network) => (
          <List.Item
            key={`${network.bssid}-${network.ssid || "hidden"}`}
            title={network.ssid || "Hidden Network"}
            subtitle={`${network.signal}% signal • ${network.security}`}
            icon={network.inUse ? Icon.CheckCircle : getSignalIcon(network.signal)}
            accessories={[
              {
                text: network.inUse ? "Connected" : `${network.rate}`,
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

