import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
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
import { ConnectionSubmenu, connectionLabel, useConnection } from "./connection";

// Custom hook for managing containers
function useContainers(showSystem: boolean, connection: string, ready: boolean) {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContainers = useCallback(async (): Promise<Container[]> => {
    try {
      const containers = await listContainers(connection, true, showSystem);

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
  }, [showSystem, connection]);

  // Only the latest request may update state, so a slow response from a
  // previous connection can never be shown under (or acted on via) the new one.
  // Callbacks captured for a previous connection (e.g. an action's refresh
  // finishing after a switch) are ignored entirely.
  const requestId = useRef(0);
  const currentConnection = useRef(connection);
  currentConnection.current = connection;

  const refreshContainers = useCallback(async () => {
    if (connection !== currentConnection.current) return;
    const id = ++requestId.current;
    setLoading(true);
    const newContainers = await fetchContainers();
    if (id !== requestId.current || connection !== currentConnection.current) {
      return;
    }
    setContainers(newContainers);
    setLoading(false);
  }, [fetchContainers, connection]);

  useEffect(() => {
    if (!ready) return;
    setContainers([]);
    refreshContainers();
  }, [refreshContainers, ready]);

  return { containers, loading, refreshContainers };
}

// Container detail component
function ContainerDetail({ container }: { container: Container }) {
  const [inspect, setInspect] = useState<string>("");
  const [inspectLoading, setInspectLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchInspect = async () => {
      setInspectLoading(true);
      let result: string;
      try {
        result = await getContainerInspect(
          container.connection,
          container.id,
          container.isSystem
        );
      } catch {
        result = "Failed to load inspect data";
      }
      if (cancelled) return;
      setInspect(result);
      setInspectLoading(false);
    };

    fetchInspect();
    return () => {
      cancelled = true;
    };
  }, [container.connection, container.id, container.isSystem]);

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
          await startContainer(container.connection, container.id);
          break;
        case "stop":
          await stopContainer(container.connection, container.id);
          break;
        case "restart":
          await restartContainer(container.connection, container.id);
          break;
        case "pause":
          await pauseContainer(container.connection, container.id);
          break;
        case "unpause":
          await unpauseContainer(container.connection, container.id);
          break;
        case "remove":
          await removeContainer(container.connection, container.id);
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
  connectionMenu,
}: {
  container: Container;
  showingDetail: boolean;
  refreshContainers: () => Promise<void>;
  toggleDetails: () => void;
  connectionMenu: ReactNode;
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
          <ActionPanel.Section>
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["ctrl"], key: "f" }}
              onAction={refreshContainers}
            />
            {connectionMenu}
          </ActionPanel.Section>
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

  const { connections, connection, setConnection, ready, allowSystem } =
    useConnection();

  // The system filter disappears for non-local targets; don't leave it selected
  useEffect(() => {
    if (!allowSystem && filter === "system") setFilter("all");
  }, [allowSystem, filter]);

  // Determine if we should show system containers based on filter (local only)
  const showSystem = allowSystem && (filter === "all" || filter === "system");

  const { containers, loading, refreshContainers } = useContainers(
    showSystem,
    connection,
    ready
  );

  const connectionMenu = (
    <ConnectionSubmenu
      connections={connections}
      connection={connection}
      onSelect={setConnection}
    />
  );
  const navigationTitle = `Containers — ${connectionLabel(connection)}`;

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
      <List navigationTitle={navigationTitle}>
        <List.EmptyView
          icon={Icon.Box}
          title="No Containers Found"
          description={`No Podman containers available on ${connectionLabel(connection)}.`}
          actions={
            <ActionPanel>
              <Action
                title="Refresh Containers"
                icon={Icon.ArrowClockwise}
                onAction={refreshContainers}
              />
              {connectionMenu}
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={loading}
      navigationTitle={navigationTitle}
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
          {allowSystem && (
            <List.Dropdown.Item
              value="system"
              title="System Containers"
              icon={Icon.Gear}
            />
          )}
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
          connectionMenu={connectionMenu}
        />
      ))}
    </List>
  );
}
