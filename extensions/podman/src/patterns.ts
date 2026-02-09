import { Icon, Color } from "@vicinae/api";

// Podman container status patterns
export const PODMAN_REGEX = {
  // Status patterns
  runningStatus: /\bUp\b/i,
  exitedStatus: /\bExited\b/i,
  createdStatus: /\bCreated\b/i,
  pausedStatus: /\bPaused\b/i,
  stoppedStatus: /\bExited|Stopped\b/i,
};

// Container status types
export enum ContainerStatus {
  RUNNING = "running",
  EXITED = "exited",
  CREATED = "created",
  PAUSED = "paused",
  STOPPED = "stopped",
  UNKNOWN = "unknown",
}

// Container state types
export enum ContainerState {
  RUNNING = "running",
  EXITED = "exited",
  CREATED = "created",
  PAUSED = "paused",
  RESTARTING = "restarting",
  REMOVING = "removing",
  DEAD = "dead",
  UNKNOWN = "unknown",
}

// Get icon based on container status
export function getContainerIcon(): string {
  // Use a consistent container icon for all containers, status is shown via colors
  return Icon.Box;
}

// Get icon for images
export function getImageIcon(): string {
  return Icon.Image;
}

// Get color based on container status
export function getContainerColor(status: ContainerStatus) {
  switch (status) {
    case ContainerStatus.RUNNING:
      return Color.Green;
    case ContainerStatus.EXITED:
      return Color.Red;
    case ContainerStatus.CREATED:
      return Color.Yellow;
    case ContainerStatus.PAUSED:
      return Color.Orange;
    case ContainerStatus.STOPPED:
      return Color.SecondaryText;
    default:
      return Color.Orange;
  }
}