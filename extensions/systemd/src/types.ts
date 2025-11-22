// Shared TypeScript types for the systemd extension

// Service status types
export enum ServiceStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  FAILED = "failed",
  UNKNOWN = "unknown",
}

// Service sub-status types
export enum ServiceSubStatus {
  RUNNING = "running",
  EXITED = "exited",
  DEAD = "dead",
  WAITING = "waiting",
  UNKNOWN = "unknown",
}

// Service load status
export enum ServiceLoadStatus {
  LOADED = "loaded",
  NOT_FOUND = "not-found",
  UNKNOWN = "unknown",
}

// Service filter type
export type ServiceFilter = "all" | "system" | "user" | "running" | "stopped";

// Type for systemd unit information from ListUnits
export type SystemdUnit = [
  string, // name
  string, // description
  string, // load state
  string, // active state
  string, // sub state
  string, // following
  string, // unit object path
  string, // job type
  string, // job object path
];

export type Service = {
  name: string;
  description: string;
  status: ServiceStatus;
  subStatus: ServiceSubStatus;
  loadStatus: ServiceLoadStatus;
  type: "system" | "user";
  icon: string;
  jobType?: string;
  jobObjectPath?: string;
  execMainPID?: number;
  execMainStartTimestamp?: number;
  cpuUsageNSec?: number;
  memoryUsage?: number;
  ioReadBytes?: number;
  ioWriteBytes?: number;
  controlGroup?: string;
  following?: string;
};

// D-Bus interface types
export interface SystemdServiceInterface {
  ExecMainPID: number;
  ExecMainStartTimestamp: number;
  CPUUsageNSec: number;
  ControlGroup: string;
  IOReadBytes: number;
  IOWriteBytes: number;
}

export interface SystemdManagerInterface {
  ListUnits(): Promise<SystemdUnit[]>;
  GetUnit(name: string): Promise<string>;
}
