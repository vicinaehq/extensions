import { exec } from "child_process";
import { promisify } from "util";
import { Toast, showToast } from "@vicinae/api";
import { PODMAN_REGEX, ContainerStatus } from "./patterns";

const execAsync = promisify(exec);

export type Container = {
  id: string;
  image: string;
  command: string;
  created: string;
  status: ContainerStatus;
  ports: string;
  names: string;
  icon: string;
  state: string;
  isSystem: boolean;
};

export type Image = {
  id: string;
  repository: string;
  tag: string;
  imageId: string;
  created: string;
  size: string;
  icon: string;
};

// Parse podman ps JSON output
export function parseContainerFromJson(containerJson: any): Container | null {
  try {
    const id = containerJson.Id;
    const image = containerJson.Image;
    const command = Array.isArray(containerJson.Command)
      ? containerJson.Command.join(" ")
      : containerJson.Command || "";
    const created = containerJson.CreatedAt || "";
    const status = containerJson.Status || "";
    const state = containerJson.State || "";
    const names = Array.isArray(containerJson.Names)
      ? containerJson.Names[0] || ""
      : containerJson.Names || "";

    // Parse ports
    let ports = "";
    if (containerJson.Ports && Array.isArray(containerJson.Ports)) {
      ports = containerJson.Ports.map((p: any) =>
        `${p.host_ip || ""}:${p.host_port || ""}->${p.container_port}/${p.protocol}`
      ).join(", ");
    }

    if (!id || !image || !names) {
      return null;
    }

    let parsedStatus = ContainerStatus.UNKNOWN;
    if (PODMAN_REGEX.runningStatus.test(status)) {
      parsedStatus = ContainerStatus.RUNNING;
    } else if (PODMAN_REGEX.exitedStatus.test(status)) {
      parsedStatus = ContainerStatus.EXITED;
    } else if (PODMAN_REGEX.createdStatus.test(status)) {
      parsedStatus = ContainerStatus.CREATED;
    } else if (PODMAN_REGEX.pausedStatus.test(status)) {
      parsedStatus = ContainerStatus.PAUSED;
    } else if (PODMAN_REGEX.stoppedStatus.test(status)) {
      parsedStatus = ContainerStatus.STOPPED;
    }

    return {
      id,
      image,
      command: command || "",
      created: created || "",
      status: parsedStatus,
      ports: ports || "",
      names: names.trim(),
      state,
      isSystem: false, // Default to user container
      icon: "", // Will be set by getContainerIcon
    };
  } catch (error) {
    console.error("Error parsing container JSON:", error);
    return null;
  }
}

// Get list of containers
export async function listContainers(
  showAll: boolean = true,
  showSystem: boolean = false
): Promise<Container[]> {
  try {
    const containers: Container[] = [];

    // Get user containers first
    const userCommand = showAll ? "podman ps -a --format json" : "podman ps --format json";
    try {
      const { stdout: userStdout } = await execAsync(userCommand, {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      const userContainerData = JSON.parse(userStdout.trim());
      const userContainerArray = Array.isArray(userContainerData) ? userContainerData : [userContainerData];

      for (const containerJson of userContainerArray) {
        const container = parseContainerFromJson(containerJson);
        if (container) {
          containers.push(container);
        }
      }
    } catch (userError) {
      console.log("Could not get user containers:", userError);
    }

    // Try to get system containers if enabled (requires sudo)
    if (showSystem) {
      try {
        const systemCommand = showAll ? "sudo -n podman ps -a --format json" : "sudo -n podman ps --format json";
        const { stdout: systemStdout } = await execAsync(systemCommand, {
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          timeout: 5000 // 5 second timeout for sudo
        });

        const systemContainerData = JSON.parse(systemStdout.trim());
        const systemContainerArray = Array.isArray(systemContainerData) ? systemContainerData : [systemContainerData];

        for (const containerJson of systemContainerArray) {
          const container = parseContainerFromJson(containerJson);
          if (container) {
            containers.push({ ...container, isSystem: true });
          }
        }
      } catch (systemError) {
        // System containers might not be accessible, that's okay
        // This is normal if:
        // - No sudo access
        // - Sudo requires password (-n flag prevents prompting)
        // - No system containers exist
        console.log("Could not get system containers (this is normal):", systemError);
      }
    }

    return containers.sort((a, b) => a.names.localeCompare(b.names));
  } catch (error) {
    console.error("Error listing containers:", error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to list containers",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

// Control container actions
export async function startContainer(containerId: string): Promise<void> {
  try {
    await showToast({
      style: Toast.Style.Animated,
      title: `Starting container ${containerId}...`,
    });

    const { stderr } = await execAsync(`podman start ${containerId}`);

    if (stderr) {
      console.warn(`Warning starting ${containerId}:`, stderr);
    }

    await showToast({
      style: Toast.Style.Success,
      title: "Container started",
      message: `Container ${containerId} started successfully`,
    });
  } catch (error) {
    console.error(`Error starting ${containerId}:`, error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to start container",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function stopContainer(containerId: string): Promise<void> {
  try {
    await showToast({
      style: Toast.Style.Animated,
      title: `Stopping container ${containerId}...`,
    });

    const { stderr } = await execAsync(`podman stop ${containerId}`);

    if (stderr) {
      console.warn(`Warning stopping ${containerId}:`, stderr);
    }

    await showToast({
      style: Toast.Style.Success,
      title: "Container stopped",
      message: `Container ${containerId} stopped successfully`,
    });
  } catch (error) {
    console.error(`Error stopping ${containerId}:`, error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to stop container",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function restartContainer(containerId: string): Promise<void> {
  try {
    await showToast({
      style: Toast.Style.Animated,
      title: `Restarting container ${containerId}...`,
    });

    const { stderr } = await execAsync(`podman restart ${containerId}`);

    if (stderr) {
      console.warn(`Warning restarting ${containerId}:`, stderr);
    }

    await showToast({
      style: Toast.Style.Success,
      title: "Container restarted",
      message: `Container ${containerId} restarted successfully`,
    });
  } catch (error) {
    console.error(`Error restarting ${containerId}:`, error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to restart container",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function pauseContainer(containerId: string): Promise<void> {
  try {
    await showToast({
      style: Toast.Style.Animated,
      title: `Pausing container ${containerId}...`,
    });

    const { stderr } = await execAsync(`podman pause ${containerId}`);

    if (stderr) {
      console.warn(`Warning pausing ${containerId}:`, stderr);
    }

    await showToast({
      style: Toast.Style.Success,
      title: "Container paused",
      message: `Container ${containerId} paused successfully`,
    });
  } catch (error) {
    console.error(`Error pausing ${containerId}:`, error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to pause container",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function unpauseContainer(containerId: string): Promise<void> {
  try {
    await showToast({
      style: Toast.Style.Animated,
      title: `Unpausing container ${containerId}...`,
    });

    const { stderr } = await execAsync(`podman unpause ${containerId}`);

    if (stderr) {
      console.warn(`Warning unpausing ${containerId}:`, stderr);
    }

    await showToast({
      style: Toast.Style.Success,
      title: "Container unpaused",
      message: `Container ${containerId} unpaused successfully`,
    });
  } catch (error) {
    console.error(`Error unpausing ${containerId}:`, error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to unpause container",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function removeContainer(containerId: string, force: boolean = false): Promise<void> {
  try {
    await showToast({
      style: Toast.Style.Animated,
      title: `Removing container ${containerId}...`,
    });

    const forceFlag = force ? "--force" : "";
    const { stderr } = await execAsync(`podman rm ${forceFlag} ${containerId}`);

    if (stderr) {
      console.warn(`Warning removing ${containerId}:`, stderr);
    }

    await showToast({
      style: Toast.Style.Success,
      title: "Container removed",
      message: `Container ${containerId} removed successfully`,
    });
  } catch (error) {
    console.error(`Error removing ${containerId}:`, error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to remove container",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

// Get container logs
export async function getContainerLogs(
  containerId: string,
  lines: number = 50,
  isSystem: boolean = false
): Promise<string> {
  try {
    // Use sudo for system containers
    const command = isSystem
      ? `sudo -n podman logs --tail ${lines} ${containerId}`
      : `podman logs --tail ${lines} ${containerId}`;

    // Use larger buffer size to handle large log outputs
    const { stdout } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: isSystem ? 5000 : undefined // 5 second timeout for sudo
    });

    return stdout.trim() || "No logs available for this container.";
  } catch (error) {
    console.error(`Error getting logs for ${containerId}:`, error);
    return `Failed to get logs: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
  }
}

// Get container details
export async function getContainerInspect(containerId: string, isSystem: boolean = false): Promise<string> {
  try {
    // Use sudo for system containers
    const command = isSystem
      ? `sudo -n podman inspect ${containerId}`
      : `podman inspect ${containerId}`;

    const { stdout } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: isSystem ? 5000 : undefined // 5 second timeout for sudo
    });
    return stdout;
  } catch (error) {
    console.error(`Error inspecting ${containerId}:`, error);
    return `Failed to inspect container: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
  }
}

// Parse podman images JSON output
export function parseImageFromJson(imageJson: any): Image | null {
  try {
    const id = imageJson.Id;
    const created = imageJson.CreatedAt || "";
    const size = imageJson.Size ? `${(imageJson.Size / 1024 / 1024 / 1024).toFixed(2)} GB` : "";

    // Parse repository and tag from multiple possible sources
    let repository = "<none>";
    let tag = "<none>";

    // First try RepoTags (most reliable)
    if (imageJson.RepoTags && Array.isArray(imageJson.RepoTags) && imageJson.RepoTags.length > 0) {
      const repoTag = imageJson.RepoTags[0];
      if (repoTag && repoTag.includes(':')) {
        [repository, tag] = repoTag.split(':', 2);
      } else {
        repository = repoTag || "<none>";
      }
    }
    // If RepoTags is null, try Names array
    else if (imageJson.Names && Array.isArray(imageJson.Names) && imageJson.Names.length > 0) {
      const repoTag = imageJson.Names[0];
      if (repoTag && repoTag.includes(':')) {
        [repository, tag] = repoTag.split(':', 2);
      } else {
        repository = repoTag || "<none>";
      }
    }
    // If Names is also not available, try History array
    else if (imageJson.History && Array.isArray(imageJson.History) && imageJson.History.length > 0) {
      const repoTag = imageJson.History[0];
      if (repoTag && repoTag.includes(':')) {
        [repository, tag] = repoTag.split(':', 2);
      } else {
        repository = repoTag || "<none>";
      }
    }

    if (!id) {
      return null;
    }

    return {
      id,
      repository,
      tag,
      imageId: id,
      created: created || "",
      size: size || "",
      icon: "", // Will be set by getImageIcon
    };
  } catch (error) {
    console.error("Error parsing image JSON:", error);
    return null;
  }
}

// Get list of images
export async function listImages(): Promise<Image[]> {
  try {
    const { stdout } = await execAsync("podman images --format json", {
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const imageData = JSON.parse(stdout.trim());
    const imageArray = Array.isArray(imageData) ? imageData : [imageData];

    const images: Image[] = [];
    for (const imageJson of imageArray) {
      const image = parseImageFromJson(imageJson);
      if (image) {
        images.push(image);
      }
    }

    return images.sort((a, b) => a.repository.localeCompare(b.repository));
  } catch (error) {
    console.error("Error listing images:", error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to list images",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

// Pull an image
export async function pullImage(imageName: string): Promise<void> {
  try {
    await showToast({
      style: Toast.Style.Animated,
      title: `Pulling image ${imageName}...`,
    });

    const { stderr } = await execAsync(`podman pull ${imageName}`);

    if (stderr) {
      console.warn(`Warning pulling ${imageName}:`, stderr);
    }

    await showToast({
      style: Toast.Style.Success,
      title: "Image pulled",
      message: `Image ${imageName} pulled successfully`,
    });
  } catch (error) {
    console.error(`Error pulling ${imageName}:`, error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to pull image",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

// Remove an image
export async function removeImage(imageId: string, force: boolean = false): Promise<void> {
  try {
    await showToast({
      style: Toast.Style.Animated,
      title: `Removing image ${imageId}...`,
    });

    const forceFlag = force ? "--force" : "";
    const { stderr } = await execAsync(`podman rmi ${forceFlag} ${imageId}`);

    if (stderr) {
      console.warn(`Warning removing ${imageId}:`, stderr);
    }

    await showToast({
      style: Toast.Style.Success,
      title: "Image removed",
      message: `Image ${imageId} removed successfully`,
    });
  } catch (error) {
    console.error(`Error removing ${imageId}:`, error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to remove image",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

// Get image details
export async function getImageInspect(imageId: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`podman inspect ${imageId}`, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    return stdout;
  } catch (error) {
    console.error(`Error inspecting ${imageId}:`, error);
    return `Failed to inspect image: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
  }
}