import { Action, ActionPanel, Color, Icon, List, useNavigation } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import Connections from "./components/connections";
import Logs from "./components/logs";
import Maintenance from "./components/maintenance";
import Mode from "./components/mode";
import Overview from "./components/overview";
import Proxies from "./components/proxies";
import Rules from "./components/rules";
import { getBackends, getCurrentBackend, setCurrentBackend } from "./lib/backends";
import type { Backend } from "./types";

const PAGES = [
  { title: "Overview", subtitle: "Live traffic and totals", icon: Icon.Gauge, target: <Overview /> },
  { title: "Mode", subtitle: "Switch routing mode", icon: Icon.Switch, target: <Mode /> },
  { title: "Proxies", subtitle: "Inspect groups and select proxies", icon: Icon.Network, target: <Proxies /> },
  { title: "Rules", subtitle: "Search the complete rule list", icon: Icon.Shield01, target: <Rules /> },
  { title: "Connections", subtitle: "Inspect active connections", icon: Icon.Globe01, target: <Connections /> },
  { title: "Logs", subtitle: "Watch live Clash logs", icon: Icon.Text, target: <Logs /> },
  {
    title: "Maintenance",
    subtitle: "Clear caches and update GEO data",
    icon: Icon.Cog,
    target: <Maintenance />,
  },
] as const;

function Dashboard() {
  return (
    <List searchBarPlaceholder="Search Clash dashboard...">
      {PAGES.map((page) => (
        <List.Item
          key={page.title}
          icon={page.icon}
          title={page.title}
          subtitle={page.subtitle}
          actions={
            <ActionPanel>
              <Action.Push title={`Open ${page.title}`} icon={page.icon} target={page.target} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function BackendSelector({ backends, currentId }: { backends: Backend[]; currentId?: string }) {
  const { push } = useNavigation();
  const sortedBackends = useMemo(
    () => [...backends].sort((left, right) => Number(right.id === currentId) - Number(left.id === currentId)),
    [backends, currentId],
  );

  async function openDashboard(backend: Backend) {
    await setCurrentBackend(backend.id);
    push(<Dashboard />);
  }

  return (
    <List navigationTitle="Select Clash Backend" searchBarPlaceholder="Search backends...">
      {sortedBackends.map((backend) => {
        const isCurrent = backend.id === currentId;
        return (
          <List.Item
            key={backend.id}
            id={backend.id}
            icon={{ source: Icon.HardDrive, tintColor: isCurrent ? Color.Green : undefined }}
            title={backend.name}
            subtitle={backend.url}
            keywords={[backend.url]}
            accessories={isCurrent ? [{ tag: { value: "Last Used", color: Color.Green } }] : []}
            actions={
              <ActionPanel>
                <Action title="Open Dashboard" icon={Icon.ArrowRight} onAction={() => void openDashboard(backend)} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

export default function Command() {
  const [backends, setBackends] = useState<Backend[]>([]);
  const [currentId, setCurrentId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [items, current] = await Promise.all([getBackends(), getCurrentBackend()]);
        setBackends(items);
        setCurrentId(current?.id);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  if (isLoading) return <List isLoading />;
  if (backends.length <= 1) return <Dashboard />;
  return <BackendSelector backends={backends} currentId={currentId} />;
}
