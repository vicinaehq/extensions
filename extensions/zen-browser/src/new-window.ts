import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { runZen, type Preferences } from "./lib";
export default async function Command() { try { runZen(["--blank-window"], getPreferenceValues<Preferences>()); } catch (e: any) { await showToast({ style: Toast.Style.Failure, title: "Could not open Zen window", message: e?.message || String(e) }); } }
