import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  showToast,
} from "@vicinae/api";
import {
  listContainers,
  startContainer,
  stopContainer,
  restartContainer,
  pauseContainer,
  unpauseContainer,
  removeContainer,
  getContainerLogs,
  getContainerInspect,
} from "./podman";
import {
  getContainerIcon,
  getContainerColor,
  ContainerStatus,
} from "./patterns";
import type { Container } from "./podman";

// Custom hook for managing containers
function useContainers(showSystem: boolean = false) {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContainers = useCallback(async (): Promise<Container[]> => {
    try {
      const containers = await listContainers(true, showSystem);

      // Add icons to containers
      return containers.map((container) => ({
        ...container,
        icon: getContainerIcon(),
      }));
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch containers",
      });
      console.error(error);
      return [];
    }
  }, [showSystem]);

  const refreshContainers = useCallback(async () => {
    setLoading(true);
    const newContainers = await fetchContainers();
    setContainers(newContainers);
    setLoading(false);
  }, [fetchContainers]);

  useEffect(() => {
    refreshContainers();
  }, [refreshContainers]);

  return { containers, loading, refreshContainers };
}

// Container detail component
function ContainerDetail({ container }: { container: Container }) {
  const [inspect, setInspect] = useState<string>("");
  const [inspectLoading, setInspectLoading] = useState(false);

  useEffect(() => {
    const fetchInspect = async () => {
      setInspectLoading(true);
      try {
        const containerInspect = await getContainerInspect(
          container.id,
          container.isSystem
        );
        setInspect(containerInspect);
      } catch {
        setInspect("Failed to load inspect data");
      } finally {
        setInspectLoading(false);
      }
    };

    fetchInspect();
  }, [container.id, container.isSystem]);

  const content = inspectLoading
    ? "Loading inspect data..."
    : inspect
    ? `\`\`\`json\n${inspect}\n\`\`\``
    : "";

  return (
    <List.Item.Detail
      markdown={content}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Container ID"
            text={container.id}
          />
          <List.Item.Detail.Metadata.Label
            title="Name"
            text={container.names}
          />
          <List.Item.Detail.Metadata.Label
            title="Image"
            text={container.image}
          />
          <List.Item.Detail.Metadata.Label
            title="Command"
            text={container.command}
          />
          <List.Item.Detail.Metadata.Label
            title="Created"
            text={container.created}
          />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="Status"
            text={`${container.status} (${container.state})`}
            icon={{
              source: container.icon,
              tintColor: getContainerColor(container.status),
            }}
          />
          <List.Item.Detail.Metadata.Label
            title="Ports"
            text={container.ports || "None"}
          />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

// Action handler factory functions
function createContainerActionHandler(
  action: string,
  container: Container,
  refreshContainers: () => Promise<void>
) {
  return async () => {
    try {
      switch (action) {
        case "start":
          await startContainer(container.id);
          break;
        case "stop":
          await stopContainer(container.id);
          break;
        case "restart":
          await restartContainer(container.id);
          break;
        case "pause":
          await pauseContainer(container.id);
          break;
        case "unpause":
          await unpauseContainer(container.id);
          break;
        case "remove":
          await removeContainer(container.id);
          break;
        default:
          console.error(`Unknown action: ${action}`);
          await showToast({
            style: Toast.Style.Failure,
            title: "Unknown Action",
            message: `Unknown action: ${action}`,
          });
          return;
      }
    } catch (error) {
      console.error(
        `Failed to perform ${action} on ${container.names}:`,
        error
      );
    } finally {
      // Always refresh to get the latest state
      await refreshContainers();
    }
  };
}

// Container list item component
function ContainerListItem({
  container,
  showingDetail,
  refreshContainers,
  toggleDetails,
}: {
  container: Container;
  showingDetail: boolean;
  refreshContainers: () => Promise<void>;
  toggleDetails: () => void;
}) {
  const tintColor = getContainerColor(container.status);

  return (
    <List.Item
      key={container.id}
      title={container.names}
      subtitle={container.image}
      icon={{ source: container.icon, tintColor }}
      accessories={
        !showingDetail
          ? [
              {
                text: container.status,
                icon:
                  container.status === ContainerStatus.RUNNING
                    ? Icon.Play
                    : Icon.Stop,
              },
              {
                icon: container.isSystem ? Icon.Gear : Icon.Person,
                tooltip: container.isSystem
                  ? "System container"
                  : "User container",
              },
            ]
          : undefined
      }
      detail={
        showingDetail ? <ContainerDetail container={container} /> : undefined
      }
      actions={
        <ActionPanel>
          <Action
            title={showingDetail ? "Hide Details" : "Show Details"}
            icon={showingDetail ? Icon.EyeDisabled : Icon.Eye}
            onAction={toggleDetails}
          />
          {container.status === ContainerStatus.RUNNING ? (
            <>
              <Action
                title="Stop"
                icon={Icon.Stop}
                style="destructive"
                shortcut={{ modifiers: ["ctrl"], key: "s" }}
                onAction={createContainerActionHandler(
                  "stop",
                  container,
                  refreshContainers
                )}
              />
              <Action
                title="Restart"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["ctrl"], key: "r" }}
                onAction={createContainerActionHandler(
                  "restart",
                  container,
                  refreshContainers
                )}
              />
              <Action
                title="Pause"
                icon={Icon.Pause}
                shortcut={{ modifiers: ["ctrl"], key: "p" }}
                onAction={createContainerActionHandler(
                  "pause",
                  container,
                  refreshContainers
                )}
              />
            </>
          ) : container.status === ContainerStatus.PAUSED ? (
            <>
              <Action
                title="Unpause"
                icon={Icon.Play}
                shortcut={{ modifiers: ["ctrl"], key: "u" }}
                onAction={createContainerActionHandler(
                  "unpause",
                  container,
                  refreshContainers
                )}
              />
              <Action
                title="Stop"
                icon={Icon.Stop}
                style="destructive"
                shortcut={{ modifiers: ["ctrl"], key: "s" }}
                onAction={createContainerActionHandler(
                  "stop",
                  container,
                  refreshContainers
                )}
              />
            </>
          ) : (
            <>
              <Action
                title="Start"
                icon={Icon.Play}
                shortcut={{ modifiers: ["ctrl"], key: "s" }}
                onAction={createContainerActionHandler(
                  "start",
                  container,
                  refreshContainers
                )}
              />
              <Action
                title="Remove"
                icon={Icon.Trash}
                style="destructive"
                shortcut={{ modifiers: ["ctrl"], key: "x" }}
                onAction={createContainerActionHandler(
                  "remove",
                  container,
                  refreshContainers
                )}
              />
            </>
           )}
         </ActionPanel>
      }
    />
  );
}

// Container filter type
type ContainerFilter =
  | "all"
  | "user"
  | "system"
  | "running"
  | "stopped"
  | "paused";

// Main component
export default function Containers() {
  const [showingDetail, setShowingDetail] = useState(false);
  const [filter, setFilter] = useState<ContainerFilter>("all");

  // Determine if we should show system containers based on filter
  const showSystem = filter === "all" || filter === "system";

  const { containers, loading, refreshContainers } = useContainers(showSystem);

  const toggleDetails = useCallback(() => {
    setShowingDetail(!showingDetail);
  }, [showingDetail]);

  // Filter containers based on selected filter
  const filteredContainers = useMemo(() => {
    return containers.filter((container) => {
      switch (filter) {
        case "user":
          return !container.isSystem;
        case "system":
          return container.isSystem;
        case "running":
          return container.status === ContainerStatus.RUNNING;
        case "stopped":
          return (
            container.status === ContainerStatus.EXITED ||
            container.status === ContainerStatus.STOPPED
          );
        case "paused":
          return container.status === ContainerStatus.PAUSED;
        case "all":
        default:
          return true;
      }
    });
  }, [containers, filter]);

  if (containers.length === 0 && !loading) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Box}
          title="No Containers Found"
          description="No Podman containers available. Create a container to get started."
          actions={
            <ActionPanel>
              <Action
                title="Refresh Containers"
                icon={Icon.ArrowClockwise}
                onAction={refreshContainers}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search containers..."
      isShowingDetail={showingDetail}
    >
      <List.Dropdown
        tooltip="Filter containers"
        value={filter}
        onChange={(value) => setFilter(value as ContainerFilter)}
      >
        <List.Dropdown.Section>
          <List.Dropdown.Item
            value="all"
            title="All Containers"
            icon={Icon.List}
          />
          <List.Dropdown.Item
            value="user"
            title="User Containers"
            icon={Icon.Person}
          />
          <List.Dropdown.Item
            value="system"
            title="System Containers"
            icon={Icon.Gear}
          />
          <List.Dropdown.Item
            value="running"
            title="Running"
            icon={Icon.Play}
          />
          <List.Dropdown.Item
            value="stopped"
            title="Stopped"
            icon={Icon.Stop}
          />
          <List.Dropdown.Item value="paused" title="Paused" icon={Icon.Pause} />
        </List.Dropdown.Section>
      </List.Dropdown>
      {filteredContainers.map((container) => (
        <ContainerListItem
          key={container.id}
          container={container}
          showingDetail={showingDetail}
          refreshContainers={refreshContainers}
          toggleDetails={toggleDetails}
        />
      ))}
    </List>
  );
}
