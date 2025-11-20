import { useEffect, useState } from "react";
import { Color, Icon, List } from "@vicinae/api";
import { getServiceLogs } from "../lib/systemctl";
import { getServiceColor, formatBytes } from "../utils";
import type { Service } from "../types";

// Service detail component
export function ServiceDetail({ service }: { service: Service }) {
  const [logs, setLogs] = useState<string>("");
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    const fetchLogs = async () => {
      setLogsLoading(true);
      try {
        const serviceLogs = await getServiceLogs(service.name, service.type);
        setLogs(serviceLogs);
      } catch {
        setLogs("Failed to load logs");
      } finally {
        setLogsLoading(false);
      }
    };

    fetchLogs();
  }, [service.name]);

  return (
    <List.Item.Detail
      markdown={logsLoading ? "Loading logs..." : logs.replace(/\n/g, "<br/>")}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Service Name"
            text={service.name}
          />
          <List.Item.Detail.Metadata.Label
            title="Description"
            text={service.description}
          />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="Status"
            text={`${service.status} (${service.subStatus})`}
            icon={{
              source: service.icon,
              tintColor: getServiceColor(service.status),
            }}
          />
          <List.Item.Detail.Metadata.Label
            title="Load Status"
            text={service.loadStatus}
            icon={{
              source:
                service.loadStatus === "loaded"
                  ? Icon.CheckCircle
                  : Icon.XMarkCircle,
              tintColor:
                service.loadStatus === "loaded" ? Color.Green : Color.Red,
            }}
          />
          {service.execMainPID && (
            <List.Item.Detail.Metadata.Label
              title="Process ID"
              text={service.execMainPID.toString()}
              icon={{ source: Icon.Terminal, tintColor: Color.Blue }}
            />
          )}
          {service.execMainStartTimestamp && (
            <List.Item.Detail.Metadata.Label
              title="Started"
              text={new Date(
                service.execMainStartTimestamp / 1000,
              ).toLocaleString()}
              icon={{ source: Icon.Clock, tintColor: Color.Blue }}
            />
          )}
          {service.cpuUsageNSec && (
            <List.Item.Detail.Metadata.Label
              title="CPU Time"
              text={`${(service.cpuUsageNSec / 1e9).toFixed(2)}s`}
              icon={{ source: Icon.ComputerChip, tintColor: Color.Purple }}
            />
          )}
          {service.ioReadBytes && service.ioWriteBytes && (
            <>
              <List.Item.Detail.Metadata.Label
                title="IO Read"
                text={formatBytes(service.ioReadBytes)}
                icon={{ source: Icon.Download, tintColor: Color.Green }}
              />
              <List.Item.Detail.Metadata.Label
                title="IO Write"
                text={formatBytes(service.ioWriteBytes)}
                icon={{ source: Icon.Upload, tintColor: Color.Orange }}
              />
            </>
          )}
          {service.controlGroup && (
            <List.Item.Detail.Metadata.Label
              title="Control Group"
              text={service.controlGroup}
              icon={{ source: Icon.Folder, tintColor: Color.SecondaryText }}
            />
          )}
          {service.jobType && (
            <List.Item.Detail.Metadata.Label
              title="Current Job"
              text={service.jobType}
              icon={{ source: Icon.Gear, tintColor: Color.Yellow }}
            />
          )}
          {service.following && (
            <List.Item.Detail.Metadata.Label
              title="Following"
              text={service.following}
              icon={{ source: Icon.ArrowRight, tintColor: Color.SecondaryText }}
            />
          )}
        </List.Item.Detail.Metadata>
      }
    />
  );
}
