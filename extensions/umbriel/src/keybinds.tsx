import { basename } from "node:path";
import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshAction } from "./components/RefreshAction";
import { UmbrielList } from "./components/UmbrielList";
import { getActionCatalog } from "./lib/action-catalog";
import {
  collectKeybinds,
  getUmbrielConfigPath,
  loadUmbrielConfig,
} from "./lib/config";
import { formatError } from "./lib/format";
import type { ActionCatalog, Keybind } from "./lib/types";

const OTHER_SECTION = "Other";

const SECTION_ICONS: Record<string, Icon> = {
  Programs: Icon.Terminal,
  Screencasting: Icon.Video,
  Focus: Icon.Eye,
  "Move & size": Icon.ArrowsExpand,
  Windows: Icon.AppWindow,
  Scratchpad: Icon.FloatingWindow,
  Workspaces: Icon.Desktop,
  Overview: Icon.AppWindowGrid3x3,
  System: Icon.Cog,
  [OTHER_SECTION]: Icon.QuestionMarkCircle,
};

function formatAction(keybind: Keybind): string {
  return (
    [keybind.actionName, keybind.args].filter(Boolean).join(" ") || "Unset"
  );
}

function sectionFor(catalog: ActionCatalog, actionName: string): string {
  if (!actionName) return OTHER_SECTION;
  if (actionName.startsWith("spawn")) return "Programs";
  return catalog.byAction.get(actionName) ?? OTHER_SECTION;
}

export default function Keybinds() {
  const [keybinds, setKeybinds] = useState<Keybind[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [catalog, setCatalog] = useState<ActionCatalog>(() => ({
    sections: [],
    byAction: new Map(),
  }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [files, actionCatalog] = await Promise.all([
        loadUmbrielConfig(),
        getActionCatalog(),
      ]);
      setKeybinds(collectKeybinds(files));
      setCatalog(actionCatalog);
      setError(null);
    } catch (caught) {
      setKeybinds([]);
      setError(formatError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sections = useMemo(() => {
    const grouped = new Map<string, Keybind[]>();

    for (const keybind of keybinds) {
      const title = sectionFor(catalog, keybind.actionName);
      const list = grouped.get(title) ?? [];
      list.push(keybind);
      grouped.set(title, list);
    }

    const order = [
      "Programs",
      ...catalog.sections
        .map((section) => section.title)
        .filter((title) => title !== "Programs"),
      OTHER_SECTION,
    ];

    return order
      .filter((title, index) => order.indexOf(title) === index)
      .map((title) => ({
        title,
        keybinds: (grouped.get(title) ?? []).sort((a, b) =>
          a.keys.localeCompare(b.keys),
        ),
      }))
      .filter((section) => section.keybinds.length > 0);
  }, [keybinds, catalog]);

  const reloadAction = <RefreshAction onRefresh={load} />;

  return (
    <UmbrielList
      isLoading={loading}
      isEmpty={keybinds.length === 0}
      emptyTitle={error ? "Cannot Load Keybinds" : "No Keybinds Found"}
      emptyDescription={
        error ?? `No keybinds are declared in ${getUmbrielConfigPath()}.`
      }
      emptyIcon={error ? Icon.Warning : Icon.Keyboard}
      emptyActions={reloadAction}
      searchBarPlaceholder="Search keys, actions, submap, and arguments…"
      isShowingDetail={showDetail && keybinds.length > 0}
      onRefresh={load}
    >
      {sections.map((section) => {
        const icon = SECTION_ICONS[section.title] ?? Icon.Keyboard;
        return (
          <List.Section
            key={section.title}
            title={section.title}
            subtitle={`${section.keybinds.length}`}
          >
            {section.keybinds.map((keybind, index) => {
              const keys = keybind.keys;
              const command = formatAction(keybind);

              return (
                <List.Item
                  key={`${keybind.source}:${keybind.line}:${index}`}
                  title={keys}
                  subtitle={showDetail ? "" : command}
                  icon={icon}
                  keywords={[
                    keybind.combo,
                    keybind.actionName,
                    keybind.args,
                    keybind.submap ?? "",
                    ...keybind.modifiers,
                  ].filter(Boolean)}
                  detail={
                    <List.Item.Detail
                      metadata={
                        <List.Item.Detail.Metadata>
                          <List.Item.Detail.Metadata.Label
                            title="Keys"
                            text={keys}
                          />
                          <List.Item.Detail.Metadata.Label
                            title="Action"
                            text={keybind.actionName || "Unset"}
                          />
                          {keybind.args && (
                            <List.Item.Detail.Metadata.Label
                              title="Arguments"
                              text={keybind.args}
                            />
                          )}
                          {keybind.submap && (
                            <List.Item.Detail.Metadata.Label
                              title="Submap"
                              text={keybind.submap}
                            />
                          )}
                          {keybind.transition && (
                            <List.Item.Detail.Metadata.Label
                              title="Then Submap"
                              text={keybind.transition}
                            />
                          )}
                          <List.Item.Detail.Metadata.Separator />
                          <List.Item.Detail.Metadata.Label
                            title="Declared In"
                            text={`${basename(keybind.source)}:${keybind.line}`}
                          />
                        </List.Item.Detail.Metadata>
                      }
                    />
                  }
                  actions={
                    <ActionPanel>
                      <Action
                        title={showDetail ? "Hide Details" : "Show Details"}
                        icon={Icon.Text}
                        shortcut={{ modifiers: ["cmd"], key: "i" }}
                        onAction={() => setShowDetail((shown) => !shown)}
                      />
                      <Action.CopyToClipboard
                        title="Copy Keys"
                        icon={Icon.Keyboard}
                        content={keys}
                        shortcut={{ modifiers: ["cmd"], key: "c" }}
                      />
                      <Action.CopyToClipboard
                        title="Copy Action"
                        icon={Icon.Terminal}
                        content={command}
                      />
                      <Action.CopyToClipboard
                        title="Copy Bind"
                        icon={Icon.CopyClipboard}
                        content={keybind.text}
                      />
                      <Action.CopyToClipboard
                        title="Copy Config Path"
                        icon={Icon.Finder}
                        content={keybind.source}
                      />
                      {reloadAction}
                    </ActionPanel>
                  }
                />
              );
            })}
          </List.Section>
        );
      })}
    </UmbrielList>
  );
}
