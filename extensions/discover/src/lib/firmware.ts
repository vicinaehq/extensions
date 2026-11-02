import { run, assertRepo } from "./system";
import type { Software, Plan, Source } from "./types";

export interface Device {
  DeviceId: string;
  Name?: string;
  Summary?: string;
  Version?: string;
  Flags?: string[];
  Problems?: string[];
  Releases?: { Version: string; Description?: string; Name?: string }[];
}
export function parseDevices(text: string, updates = false): Software[] {
  const data = JSON.parse(text || "{}") as { Devices?: Device[] };
  return (data.Devices || [])
    .filter((d) => !updates || d.Releases?.length)
    .map((d) => ({
      id: `fwupd:${d.DeviceId}`,
      backend: "fwupd",
      name: d.DeviceId,
      title: d.Name || d.DeviceId,
      summary: d.Summary || "Firmware",
      version: updates ? d.Releases![0].Version : d.Version || "",
      installed: true,
      installedVersion: d.Version,
      source: "LVFS / fwupd",
      description: d.Releases?.[0]?.Description?.replace(/<[^>]*>/g, " "),
      details: {
        "Installed version": d.Version || "Unknown",
        Flags: (d.Flags || []).join(", "),
        Problems: (d.Problems || []).join(", ") || "None",
      },
    }));
}
export async function firmware(updates = false): Promise<Software[]> {
  const text = await run("fwupdmgr", [updates ? "get-updates" : "get-devices", "--json"], {
    codes: [2],
    timeout: 60000,
  });
  return parseDevices(text, updates);
}
export function firmwarePlan(item?: Software): Plan {
  if (item && !/^[a-f0-9]{40}$/.test(item.name)) throw new Error("Invalid device ID.");
  return {
    backend: "fwupd",
    title: item ? `Update ${item.title} firmware` : "Apply firmware updates",
    description:
      "Keep the device connected to power. Check the transaction log for required restart or shutdown steps. The system will not restart automatically. Firmware updates are started separately from system packages.",
    preview: item
      ? [`${item.installedVersion || "?"} → ${item.version}`, item.summary]
      : ["All supported devices"],
    commands: [
      {
        file: "fwupdmgr",
        args: [
          "update",
          ...(item ? [item.name] : []),
          "--assume-yes",
          "--no-reboot-check",
          "--no-unreported-check",
        ],
        acceptedCodes: [2],
      },
    ],
  };
}
export async function firmwareSources(): Promise<Source[]> {
  const text = await run("fwupdmgr", ["get-remotes", "--json"], { codes: [2] });
  const data = JSON.parse(text || "{}") as {
    Remotes?: { Id: string; Title?: string; Enabled: boolean; MetadataUri?: string }[];
  };
  return (data.Remotes || []).map((r) => ({
    id: `fwupd:${r.Id}`,
    backend: "fwupd",
    title: r.Id,
    description: r.Title,
    url: r.MetadataUri || "",
    enabled: r.Enabled,
  }));
}
export function firmwareSourcePlan(source: Source): Plan {
  return {
    backend: "fwupd",
    title: `${source.title}: ${source.enabled ? "disable" : "enable"}`,
    description: "Change whether the firmware source is enabled.",
    preview: [source.url],
    commands: [
      {
        file: "fwupdmgr",
        args: [source.enabled ? "disable-remote" : "enable-remote", assertRepo(source.title)],
      },
    ],
  };
}
