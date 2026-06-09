import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { runZen, type Preferences } from "./lib";
export default async function Command() { try { runZen(["--private-window"], getPreferenceValues<Preferences>()); } catch (e: any) { await showToast({ style: Toast.Style.Failure, title: "Could not open private window", message: e?.message || String(e) }); } }
