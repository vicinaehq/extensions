import { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  environment,
  getPreferenceValues,
} from "@vicinae/api";
import { join } from "node:path";
import { search, installed, updates, type Filter } from "./lib/catalog";
import { binary } from "./lib/system";
import { pacmanPlan } from "./lib/pacman";
import { aurPlan } from "./lib/aur";
import { flatpakPlan } from "./lib/flatpak";
import { firmwarePlan } from "./lib/firmware";
import type { Batch, Software } from "./lib/types";
import { listJobs } from "./lib/jobs";
import {
  labels,
  icons,
  useLoad,
  SoftwareRow,
  Warnings,
  PlanAction,
  JobView,
  statusLabel,
} from "./ui";
import { SourcesView } from "./sources-view";
import { AddonsView, LocalInstallView } from "./addons-view";
import { DiagnosticsView } from "./diagnostics-view";

const empty: Batch<Software> = { items: [], warnings: [] };
function BackendFilter({ value, setValue }: { value: Filter; setValue: (s: Filter) => void }) {
  return (
    <List.Dropdown tooltip="Software source" value={value} onChange={(x) => setValue(x as Filter)}>
      <List.Dropdown.Item title="All Sources" value="all" />
      {Object.entries(labels).map(([id, title]) => (
        <List.Dropdown.Item
          key={id}
          title={title}
          value={id}
          icon={icons[id as keyof typeof icons]}
        />
      ))}
    </List.Dropdown>
  );
}
export function DiscoverView() {
  const [query, setQuery] = useState(""),
    [debounced, setDebounced] = useState(""),
    [filter, setFilter] = useState<Filter>("all"),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);
  const prefs = getPreferenceValues<{ includeAur: boolean }>();
  const { value, loading, error } = useLoad(
    () =>
      debounced ? search(debounced, filter, prefs.includeAur !== false) : Promise.resolve(empty),
    [debounced, filter, revision],
    empty,
  );
  const refresh = () => setRevision((x) => x + 1);
  return (
    <List
      navigationTitle="Discover"
      searchText={query}
      onSearchTextChange={setQuery}
      filtering={false}
      isLoading={loading || query.trim() !== debounced}
      searchBarPlaceholder="Search applications or packages…"
      searchBarAccessory={<BackendFilter value={filter} setValue={setFilter} />}
    >
      {!query && (
        <>
          <List.Section title="Manage your software">
            <List.Item
              title="Installed Software"
              subtitle="System packages, AUR and Flatpak"
              icon={Icon.AppWindowGrid3x3}
              actions={
                <ActionPanel>
                  <Action.Push title="Open" target={<InstalledView />} />
                </ActionPanel>
              }
            />
            <List.Item
              title="Updates"
              subtitle="System, applications and firmware"
              icon={Icon.ArrowClockwise}
              actions={
                <ActionPanel>
                  <Action.Push title="Open" target={<UpdatesView />} />
                </ActionPanel>
              }
            />
            <List.Item
              title="Plasma Add-ons"
              subtitle="Themes, widgets and KWin"
              icon={Icon.Stars}
              actions={
                <ActionPanel>
                  <Action.Push title="Open" target={<AddonsView />} />
                </ActionPanel>
              }
            />
            <List.Item
              title="Install from File"
              subtitle="Pacman, Flatpak and Plasma packages"
              icon={Icon.Text}
              actions={
                <ActionPanel>
                  <Action.Push title="Open" target={<LocalInstallView />} />
                </ActionPanel>
              }
            />
          </List.Section>
          <List.Section title="Sources and transactions">
            <List.Item
              title="Software Sources"
              icon={Icon.Globe01}
              actions={
                <ActionPanel>
                  <Action.Push title="Open" target={<SourcesView />} />
                </ActionPanel>
              }
            />
            <List.Item
              title="Transaction History"
              icon={Icon.Clock}
              actions={
                <ActionPanel>
                  <Action.Push title="Open" target={<HistoryView />} />
                </ActionPanel>
              }
            />
            <List.Item
              title="System and Support"
              icon={Icon.Info01}
              subtitle={
                !binary("flatpak") ? "Flatpak is not installed" : "Check available backends"
              }
              actions={
                <ActionPanel>
                  <Action.Push title="Open" target={<DiagnosticsView />} />
                </ActionPanel>
              }
            />
          </List.Section>
        </>
      )}
      {query && (
        <>
          {!value.items.length && (
            <List.EmptyView
              title={loading ? "Searching sources…" : "No results found"}
              description={error || "Try another search or change the source filter."}
              icon={Icon.MagnifyingGlass}
            />
          )}
          {Object.entries(labels).map(([backend, title]) => (
            <List.Section
              key={backend}
              title={title}
              subtitle={String(value.items.filter((x) => x.backend === backend).length)}
            >
              {value.items
                .filter((x) => x.backend === backend)
                .map((item) => (
                  <SoftwareRow key={item.id} item={item} onRefresh={refresh} />
                ))}
            </List.Section>
          ))}
          <Warnings warnings={[...value.warnings, ...(error ? [error] : [])]} />
        </>
      )}
    </List>
  );
}
export function InstalledView() {
  const [filter, setFilter] = useState<Filter>("all"),
    [revision, setRevision] = useState(0);
  const { value, loading, error } = useLoad(() => installed(filter), [filter, revision], empty);
  return (
    <List
      navigationTitle="Installed Software"
      isLoading={loading}
      searchBarPlaceholder="Search installed software…"
      searchBarAccessory={<BackendFilter value={filter} setValue={setFilter} />}
    >
      <List.EmptyView
        title={loading ? "Loading installed software…" : "No installed software found"}
        description={error}
      />
      {Object.entries(labels).map(([backend, title]) => (
        <List.Section
          key={backend}
          title={title}
          subtitle={String(value.items.filter((x) => x.backend === backend).length)}
        >
          {value.items
            .filter((x) => x.backend === backend)
            .map((item) => (
              <SoftwareRow key={item.id} item={item} onRefresh={() => setRevision((x) => x + 1)} />
            ))}
        </List.Section>
      ))}
      <Warnings warnings={[...value.warnings, ...(error ? [error] : [])]} />
    </List>
  );
}
export function UpdatesView() {
  const [revision, setRevision] = useState(0),
    [fresh, setFresh] = useState(false);
  const { value, loading, error } = useLoad(() => updates(fresh), [revision, fresh], empty);
  const refresh = () => {
    setFresh(true);
    setRevision((x) => x + 1);
  };
  const toolbar = (
    <ActionPanel>
      <Action
        title="Check for Updates"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["ctrl"], key: "r" }}
        onAction={refresh}
      />
    </ActionPanel>
  );
  return (
    <List
      navigationTitle="Updates"
      isLoading={loading}
      searchBarPlaceholder="Search updates…"
      actions={toolbar}
    >
      <List.Section title="Update actions">
        {binary("pacman") && (
          <List.Item
            title="Update System"
            subtitle="Refresh repositories and upgrade all system packages"
            icon={Icon.ArrowClockwise}
            actions={
              <ActionPanel>
                <PlanAction
                  title="Review System Update"
                  make={() => pacmanPlan(undefined, "update")}
                />
                <Action title="Check for Updates" onAction={refresh} />
              </ActionPanel>
            }
          />
        )}
        {(binary("paru") || binary("yay")) && (
          <List.Item
            title="Update System and AUR"
            subtitle="Runs in a terminal with PKGBUILD review"
            icon={Icon.Code}
            actions={
              <ActionPanel>
                <PlanAction title="Review AUR Update" make={() => aurPlan()} />
              </ActionPanel>
            }
          />
        )}
        {binary("flatpak") &&
          (["user", "system"] as const).map((scope) => (
            <List.Item
              key={scope}
              title={`Update Flatpak · ${scope === "user" ? "User" : "System"}`}
              icon={Icon.AppWindow}
              actions={
                <ActionPanel>
                  <PlanAction
                    title="Review Flatpak Update"
                    make={() => flatpakPlan(undefined, "update", scope)}
                  />
                </ActionPanel>
              }
            />
          ))}
        {binary("fwupdmgr") && (
          <List.Item
            title="Refresh Firmware Sources"
            subtitle="Download hardware update metadata"
            icon={Icon.ComputerChip}
            actions={
              <ActionPanel>
                <PlanAction
                  title="Review Refresh"
                  make={() => ({
                    backend: "fwupd",
                    title: "Refresh firmware metadata",
                    description: "Download update metadata from enabled firmware sources.",
                    preview: [],
                    commands: [{ file: "fwupdmgr", args: ["refresh"], acceptedCodes: [2] }],
                  })}
                />
              </ActionPanel>
            }
          />
        )}
        <List.Item
          title="Check for Updates"
          subtitle={
            fresh ? "Check again" : "System list uses the local database; check for newer versions"
          }
          icon={Icon.MagnifyingGlass}
          actions={toolbar}
        />
      </List.Section>
      {Object.entries(labels).map(([backend, title]) => (
        <List.Section
          key={backend}
          title={title}
          subtitle={`${value.items.filter((x) => x.backend === backend).length} updates`}
        >
          {value.items
            .filter((x) => x.backend === backend)
            .map((item) => (
              <List.Item
                key={item.id}
                title={item.title}
                subtitle={item.summary}
                icon={icons[item.backend]}
                accessories={[{ text: `${item.installedVersion || ""} → ${item.version}` }]}
                actions={
                  <ActionPanel>
                    <PlanAction
                      title="Review Update"
                      make={() =>
                        item.backend === "pacman"
                          ? pacmanPlan(undefined, "update")
                          : item.backend === "aur"
                            ? aurPlan()
                            : item.backend === "flatpak"
                              ? flatpakPlan(item, "update")
                              : firmwarePlan(item)
                      }
                    />
                    <Action title="Refresh List" icon={Icon.ArrowClockwise} onAction={refresh} />
                    <Action.Push
                      title="View Information"
                      target={
                        <Detail
                          markdown={`# ${item.title}\n\n${item.description || item.summary}`}
                        />
                      }
                    />
                  </ActionPanel>
                }
              />
            ))}
        </List.Section>
      ))}
      <Warnings warnings={[...value.warnings, ...(error ? [error] : [])]} />
    </List>
  );
}
export function HistoryView() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1500);
    return () => clearInterval(id);
  }, []);
  const jobs = listJobs(join(environment.supportPath, "jobs"));
  return (
    <List navigationTitle="Transaction History" searchBarPlaceholder="Search transactions…">
      <List.EmptyView
        title="No transactions yet"
        description="Installations, removals and updates you start appear here."
      />
      {jobs.map((job) => (
        <List.Item
          key={job.id}
          title={job.title}
          subtitle={new Date(job.startedAt).toLocaleString("en-GB")}
          icon={
            job.status === "success"
              ? Icon.CheckCircle
              : job.status === "failed"
                ? Icon.XMarkCircle
                : Icon.Clock
          }
          accessories={[{ tag: statusLabel(job) }]}
          actions={
            <ActionPanel>
              <Action.Push title="Open Transaction Log" target={<JobView id={job.id} />} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
