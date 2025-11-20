// Utility functions for the systemd extension

import { Icon, Color } from "@vicinae/api";
import { MessageBus } from "dbus-next";
import {
  ServiceStatus,
  ServiceSubStatus,
  ServiceLoadStatus,
  SystemdUnit,
  Service,
  SystemdServiceInterface,
  SystemdManagerInterface,
  ServiceFilter,
} from "./types";

// Format bytes into human readable format
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

// Get icon based on service status
export function getServiceIcon(): string {
  // Use a consistent gear icon for all services, status is shown via colors and accessories
  return Icon.Gear;
}

// Get color based on service status
export function getServiceColor(status: ServiceStatus): Color {
  switch (status) {
    case ServiceStatus.ACTIVE:
      return Color.Green;
    case ServiceStatus.FAILED:
      return Color.Red;
    case ServiceStatus.INACTIVE:
      return Color.SecondaryText;
    default:
      return Color.Orange;
  }
}

// Parse D-Bus unit info into Service object
export function parseUnitInfo(
  unit: SystemdUnit,
  type: "system" | "user",
): Service | null {
  // Skip non-service units
  if (!unit[0] || !unit[0].endsWith(".service")) {
    return null;
  }

  let parsedStatus = ServiceStatus.UNKNOWN;
  if (unit[3] === "active") {
    parsedStatus = ServiceStatus.ACTIVE;
  } else if (unit[3] === "inactive") {
    parsedStatus = ServiceStatus.INACTIVE;
  } else if (unit[3] === "failed") {
    parsedStatus = ServiceStatus.FAILED;
  }

  let parsedSubStatus = ServiceSubStatus.UNKNOWN;
  if (unit[4] === "running") {
    parsedSubStatus = ServiceSubStatus.RUNNING;
  } else if (unit[4] === "exited") {
    parsedSubStatus = ServiceSubStatus.EXITED;
  } else if (unit[4] === "dead") {
    parsedSubStatus = ServiceSubStatus.DEAD;
  }

  let parsedLoadStatus = ServiceLoadStatus.UNKNOWN;
  if (unit[2] === "loaded") {
    parsedLoadStatus = ServiceLoadStatus.LOADED;
  } else if (unit[2] === "not-found") {
    parsedLoadStatus = ServiceLoadStatus.NOT_FOUND;
  }

  return {
    name: unit[0],
    description: unit[1] || unit[0],
    status: parsedStatus,
    subStatus: parsedSubStatus,
    loadStatus: parsedLoadStatus,
    type,
    icon: "", // Will be set by getServiceIcon
    following: unit[5] || undefined,
    jobType: unit[7] || undefined,
    jobObjectPath: unit[8] || undefined,
  };
}

// Get systemd manager proxy for a bus
export async function getSystemdManager(
  bus: MessageBus,
): Promise<SystemdManagerInterface> {
  const systemd = await bus.getProxyObject(
    "org.freedesktop.systemd1",
    "/org/freedesktop/systemd1",
  );
  return systemd.getInterface(
    "org.freedesktop.systemd1.Manager",
  ) as unknown as SystemdManagerInterface;
}

// Fetch additional properties from the unit object
export async function fetchAdditionalUnitProperties(
  service: Service,
  bus: MessageBus,
  unitPath: string,
) {
  try {
    const unitProxy = await bus.getProxyObject(
      "org.freedesktop.systemd1",
      unitPath,
    );

    // Get service-specific properties if this is a service
    if (service.name.endsWith(".service")) {
      try {
        const serviceInterface = unitProxy.getInterface(
          "org.freedesktop.systemd1.Service",
        );
        const serviceProps =
          serviceInterface as unknown as SystemdServiceInterface;
        service.execMainPID = serviceProps.ExecMainPID;
        service.execMainStartTimestamp = serviceProps.ExecMainStartTimestamp;
        service.cpuUsageNSec = serviceProps.CPUUsageNSec;
        service.controlGroup = serviceProps.ControlGroup;
        service.ioReadBytes = serviceProps.IOReadBytes;
        service.ioWriteBytes = serviceProps.IOWriteBytes;
      } catch (serviceError) {
        // Not all units have service interface, that's okay
        console.debug(
          `No service interface for ${service.name}:`,
          serviceError,
        );
      }
    }
  } catch (error) {
    console.warn(
      `Failed to fetch additional properties for ${unitPath}:`,
      error,
    );
  }
}

// Filter services based on filter type
export function filterServices(
  services: Service[],
  filter: ServiceFilter,
): Service[] {
  if (filter === "all") return services;

  return services.filter((service) => {
    switch (filter) {
      case "system":
        return service.type === "system";
      case "user":
        return service.type === "user";
      case "running":
        return service.status === ServiceStatus.ACTIVE;
      case "stopped":
        return service.status === ServiceStatus.INACTIVE;
      default:
        return true;
    }
  });
}
