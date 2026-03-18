import {
  Action,
  ActionPanel,
  Color,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HAEntity } from "./types";
import {
  fetchEntities,
  toggleEntity,
  turnOnEntity,
  turnOffEntity,
  openCover,
  closeCover,
  stopCover,
} from "./api";
import {
  formatEntityState,
  isToggleable,
  getEntityIcon,
  groupEntitiesByDomain,
} from "./utils";

interface Preferences {
  url: string;
  token: string;
}

const DOMAIN_LABELS: Record<string, string> = {
  light: "Lights",
  switch: "Switches",
  fan: "Fans",
  cover: "Covers",
  input_boolean: "Input Booleans",
  automation: "Automations",
  script: "Scripts",
};

const DOMAIN_ORDER = [
  "light",
  "switch",
  "fan",
  "cover",
  "automation",
  "input_boolean",
  "script",
];

function sortEntities(ents: HAEntity[]): HAEntity[] {
  return ents.sort((a, b) => {
    const nameA = (a.attributes["friendly_name"] as string) || a.entity_id;
    const nameB = (b.attributes["friendly_name"] as string) || b.entity_id;
    return nameA.localeCompare(nameB);
  });
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const [entities, setEntities] = useState<HAEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState("all");

  const loadEntities = useCallback(async () => {
    if (!preferences.url || !preferences.token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const ents = await fetchEntities(preferences);
      const toggleable = ents.filter(isToggleable);
      setEntities(sortEntities(toggleable));
    } catch (error) {
      console.error("Error loading entities:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load entities",
        message: "Check your URL and token in preferences",
      });
    } finally {
      setIsLoading(false);
    }
  }, [preferences.url, preferences.token]);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  const filteredEntities = useMemo(() => {
    if (selectedDomain === "all") return entities;
    return entities.filter((e) => e.entity_id.split(".")[0] === selectedDomain);
  }, [entities, selectedDomain]);

  const groupedEntities = useMemo(() => {
    if (selectedDomain !== "all") return { [selectedDomain]: filteredEntities };
    return groupEntitiesByDomain(filteredEntities);
  }, [filteredEntities, selectedDomain]);

  const availableDomains = useMemo(() => {
    const domains = new Set(
      entities.map((e) => e.entity_id.split(".")[0] as string),
    );
    return DOMAIN_ORDER.filter((d) => domains.has(d));
  }, [entities]);

  const updateEntity = async (
    entityId: string,
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    try {
      await action();
      const updated = await fetchEntities(preferences);
      const updatedEntity = updated.find((e) => e.entity_id === entityId);
      if (updatedEntity) {
        setEntities((prev) =>
          sortEntities(
            prev.map((e) => (e.entity_id === entityId ? updatedEntity : e)),
          ),
        );
      }
      showToast({
        style: Toast.Style.Success,
        title: successMessage,
        message: formatEntityState(
          updatedEntity || entities.find((e) => e.entity_id === entityId)!,
        ),
      });
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Action failed",
        message: (error as Error).message,
      });
    }
  };

  const handleToggle = (entity: HAEntity) => {
    updateEntity(
      entity.entity_id,
      () => toggleEntity(entity.entity_id, preferences),
      "Toggled",
    );
  };

  const handleTurnOn = (entity: HAEntity) => {
    updateEntity(
      entity.entity_id,
      () => turnOnEntity(entity.entity_id, preferences),
      "Turned on",
    );
  };

  const handleTurnOff = (entity: HAEntity) => {
    updateEntity(
      entity.entity_id,
      () => turnOffEntity(entity.entity_id, preferences),
      "Turned off",
    );
  };

  const handleOpenCover = (entity: HAEntity) => {
    updateEntity(
      entity.entity_id,
      () => openCover(entity.entity_id, preferences),
      "Opened",
    );
  };

  const handleCloseCover = (entity: HAEntity) => {
    updateEntity(
      entity.entity_id,
      () => closeCover(entity.entity_id, preferences),
      "Closed",
    );
  };

  const handleStopCover = (entity: HAEntity) => {
    updateEntity(
      entity.entity_id,
      () => stopCover(entity.entity_id, preferences),
      "Stopped",
    );
  };

  function formatRelativeTime(isoDate: string | null | undefined): string {
    if (!isoDate) return "";
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  }

  function getEntityAccessories(entity: HAEntity): List.Item.Accessory[] {
    const domain = entity.entity_id.split(".")[0];
    const accessories: List.Item.Accessory[] = [];

    // Light-specific accessories
    if (domain === "light" && entity.state === "on") {
      const brightness = entity.attributes["brightness"] as number | undefined;
      const colorTempKelvin = entity.attributes["color_temp_kelvin"] as
        | number
        | undefined;

      if (brightness != null) {
        accessories.push({
          text: `${Math.round((brightness / 255) * 100)}%`,
          icon: Icon.LightBulb,
        });
      }

      if (colorTempKelvin != null) {
        accessories.push({
          text: `${colorTempKelvin}K`,
          icon: Icon.Sun,
        });
      }
    }

    // Climate accessories
    if (domain === "climate") {
      const currentTemp = entity.attributes["current_temperature"] as
        | number
        | undefined;
      const targetTemp = entity.attributes["temperature"] as number | undefined;
      if (currentTemp != null) {
        accessories.push({ text: `${currentTemp}°`, icon: Icon.Temperature });
      }
      if (targetTemp != null) {
        accessories.push({ text: `→ ${targetTemp}°` });
      }
    }

    // Cover accessories (position)
    if (domain === "cover") {
      const position = entity.attributes["current_position"] as
        | number
        | undefined;
      if (position !== undefined) {
        accessories.push({ text: `${position}%`, icon: Icon.Gauge });
      }
    }

    // Automation accessories (last triggered)
    if (domain === "automation") {
      const lastTriggered = entity.attributes["last_triggered"] as
        | string
        | null
        | undefined;
      if (lastTriggered) {
        accessories.push({
          text: formatRelativeTime(lastTriggered),
          icon: Icon.Clock,
        });
      }
    }

    // Script accessories (last triggered)
    if (domain === "script") {
      const lastTriggered = entity.attributes["last_triggered"] as
        | string
        | null
        | undefined;
      if (lastTriggered) {
        accessories.push({
          text: formatRelativeTime(lastTriggered),
          icon: Icon.Clock,
        });
      }
    }

    // Fan accessories (percentage)
    if (domain === "fan" && entity.state === "on") {
      const percentage = entity.attributes["percentage"] as number | undefined;
      if (percentage !== undefined) {
        accessories.push({ text: `${percentage}%`, icon: Icon.Gauge });
      }
    }

    // State tag (always last) - skip for automations/scripts (they show last triggered)
    if (domain !== "automation" && domain !== "script") {
      if (entity.state === "on" || entity.state === "open") {
        accessories.push({ tag: { value: "On", color: Color.Green } });
      } else if (entity.state === "off" || entity.state === "closed") {
        accessories.push({ tag: { value: "Off", color: Color.SecondaryText } });
      }
    }

    return accessories;
  }

  function getEntityActions(entity: HAEntity) {
    const domain = entity.entity_id.split(".")[0] as string;
    const isOn = entity.state === "on" || entity.state === "open";
    const isToggleableDomain = [
      "light",
      "switch",
      "fan",
      "input_boolean",
      "automation",
    ].includes(domain);
    const isControllableDomain = [
      "light",
      "switch",
      "fan",
      "climate",
      "automation",
    ].includes(domain);
    const isCoverDomain = domain === "cover";

    return (
      <ActionPanel>
        <ActionPanel.Section>
          {isToggleableDomain && (
            <Action
              icon={Icon.Power}
              title={isOn ? "Turn Off" : "Turn On"}
              onAction={() => handleToggle(entity)}
            />
          )}
          {isControllableDomain && !isToggleableDomain && (
            <>
              <Action
                icon={Icon.Play}
                title="Turn On"
                onAction={() => handleTurnOn(entity)}
              />
              <Action
                icon={Icon.Stop}
                title="Turn Off"
                onAction={() => handleTurnOff(entity)}
              />
            </>
          )}
          {isCoverDomain && (
            <>
              <Action
                icon={Icon.ChevronUp}
                title="Open"
                onAction={() => handleOpenCover(entity)}
              />
              <Action
                icon={Icon.ChevronDown}
                title="Close"
                onAction={() => handleCloseCover(entity)}
              />
              <Action
                icon={Icon.Stop}
                title="Stop"
                onAction={() => handleStopCover(entity)}
              />
            </>
          )}
        </ActionPanel.Section>
        <ActionPanel.Section>
          <Action.CopyToClipboard
            icon={Icon.CopyClipboard}
            title="Copy Entity ID"
            content={entity.entity_id}
          />
        </ActionPanel.Section>
      </ActionPanel>
    );
  }

  if (!preferences.url || !preferences.token) {
    return (
      <List searchBarPlaceholder="Search entities...">
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Home Assistant Not Configured"
          description="Set your Home Assistant URL and access token in extension preferences"
        />
      </List>
    );
  }

  const domainDropdown =
    availableDomains.length > 1 ? (
      <List.Dropdown
        tooltip="Filter by Domain"
        value={selectedDomain}
        onChange={setSelectedDomain}
      >
        <List.Dropdown.Item title="All Domains" value="all" />
        {availableDomains.map((domain) => (
          <List.Dropdown.Item
            key={domain}
            title={DOMAIN_LABELS[domain] || domain}
            value={domain}
          />
        ))}
      </List.Dropdown>
    ) : undefined;

  const globalActions = (
    <ActionPanel>
      <Action
        icon={Icon.RotateClockwise}
        title="Refresh"
        shortcut={{ modifiers: ["ctrl"], key: "r" }}
        onAction={loadEntities}
      />
    </ActionPanel>
  );

  if (filteredEntities.length === 0 && !isLoading) {
    return (
      <List
        isLoading={isLoading}
        searchBarPlaceholder="Search entities..."
        searchBarAccessory={domainDropdown}
        actions={globalActions}
      >
        <List.EmptyView
          icon={Icon.BlankDocument}
          title="No Entities Found"
          description={
            selectedDomain === "all"
              ? "No controllable entities found in Home Assistant"
              : `No ${DOMAIN_LABELS[selectedDomain] || selectedDomain} found`
          }
          actions={globalActions}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search entities..."
      searchBarAccessory={domainDropdown}
      actions={globalActions}
    >
      {DOMAIN_ORDER.filter((domain) => groupedEntities[domain]?.length).map(
        (domain) => (
          <List.Section
            key={domain}
            title={DOMAIN_LABELS[domain] || domain}
            subtitle={`${groupedEntities[domain]?.length || 0} entities`}
          >
            {groupedEntities[domain]?.map((entity) => (
              <List.Item
                key={entity.entity_id}
                title={
                  (entity.attributes["friendly_name"] as string) ||
                  entity.entity_id
                }
                subtitle={entity.entity_id}
                icon={getEntityIcon(entity)}
                accessories={getEntityAccessories(entity)}
                actions={getEntityActions(entity)}
              />
            ))}
          </List.Section>
        ),
      )}
    </List>
  );
}
