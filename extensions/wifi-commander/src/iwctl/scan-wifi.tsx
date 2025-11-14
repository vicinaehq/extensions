import { showToast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
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

}

