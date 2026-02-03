import type { HAEntity } from "./types";
import type { ImageLike } from "@vicinae/api";

/**
 * Formats an entity state with domain-specific information
 * @param entity The entity to format
 * @returns Formatted string representation of entity state
 */
export function formatEntityState(entity: HAEntity): string {
  const domain = entity.entity_id.split(".")[0];
  const name =
    (entity.attributes["friendly_name"] as string | undefined) ||
    entity.entity_id;
  let stateStr = entity.state;

  // Add relevant attributes based on domain
  if (domain === "light" && entity.state === "on") {
    const brightness = entity.attributes["brightness"] as number | undefined;
    if (brightness !== undefined) {
      stateStr += ` (${Math.round((brightness / 255) * 100)}%)`;
    }
  } else if (domain === "climate") {
    const temp = entity.attributes["temperature"] as number | undefined;
    const currentTemp = entity.attributes["current_temperature"] as
      | number
      | undefined;
    if (currentTemp !== undefined) stateStr += ` ${currentTemp}°`;
    if (temp !== undefined) stateStr += ` → ${temp}°`;
  } else if (domain === "sensor") {
    const unit = entity.attributes["unit_of_measurement"] as string | undefined;
    if (unit) stateStr += ` ${unit}`;
  }

  return `${name}: ${stateStr}`;
}

/**
 * Determines if an entity can be toggled
 * @param entity The entity to check
 * @returns True if the entity can be toggled, false otherwise
 */
export function isToggleable(entity: HAEntity): boolean {
  const toggleableDomains = [
    "light",
    "switch",
    "fan",
    "cover",
    "input_boolean",
    "automation",
    "script",
  ];
  return toggleableDomains.includes(entity.entity_id.split(".")[0] as string);
}

/**
 * Gets an appropriate icon for an entity
 * @param entity The entity to get icon for
 * @returns Icon string or Icon enum value
 */
export function getEntityIcon(entity: HAEntity): ImageLike {
  const domain = entity.entity_id.split(".")[0];
  const state = entity.state;
  const deviceClass = entity.attributes["device_class"] as string | undefined;

  // Check for battery entities (by device_class or entity_id)
  if (
    deviceClass === "battery" ||
    entity.entity_id.toLowerCase().includes("battery")
  ) {
    if (state === "charging") {
      return "battery-charging";
    }
    if (state === "unavailable" || state === "unknown") {
      return "battery-disabled";
    }
    return "battery";
  }

  switch (domain) {
    case "light":
      return "💡";
    case "switch":
      return "🔌";
    case "fan":
      return "💨";
    case "cover":
      return "🪟";
    case "climate":
      return "🌡️";
    case "automation":
      return "🤖";
    case "script":
      return "📜";
    case "input_boolean":
      return state === "on" ? "✅" : "❌";
    default:
      return "❓";
  }
}

/**
 * Gets entity-specific actions
 * @param entity The entity to get actions for
 * @returns Array of available actions
 */
export function getEntityActions(
  entity: HAEntity,
): Array<{ title: string; icon: string; action: string }> {
  const domain = entity.entity_id.split(".")[0] as string;
  const actions: Array<{ title: string; icon: string; action: string }> = [];

  // Common actions
  if (
    ["light", "switch", "fan", "input_boolean", "automation"].includes(domain)
  ) {
    actions.push({
      title: "Toggle",
      icon: "🔄",
      action: "toggle",
    });
  }

  if (["light", "switch", "fan", "climate", "automation"].includes(domain)) {
    actions.push({
      title: "Turn On",
      icon: "🔵",
      action: "turn_on",
    });
    actions.push({
      title: "Turn Off",
      icon: "⚫",
      action: "turn_off",
    });
  }

  if (domain === "cover") {
    actions.push({
      title: "Open",
      icon: "⬆️",
      action: "open_cover",
    });
    actions.push({
      title: "Close",
      icon: "⬇️",
      action: "close_cover",
    });
    actions.push({
      title: "Stop",
      icon: "⏹️",
      action: "stop_cover",
    });
  }

  return actions;
}

/**
 * Gets entity state with icon and formatted state
 * @param entity The entity to get display info for
 * @returns Object with icon, formatted state, and entity ID
 */
export function getEntityDisplayInfo(entity: HAEntity) {
  return {
    entityId: entity.entity_id,
    icon: getEntityIcon(entity),
    state: formatEntityState(entity),
    actions: getEntityActions(entity),
    attributes: entity.attributes,
  };
}

/**
 * Filters entities by domain
 * @param entities Array of entities to filter
 * @param domain The domain to filter by (e.g., 'light', 'switch')
 * @returns Filtered array of entities
 */
export function filterEntitiesByDomain(
  entities: HAEntity[],
  domain: string,
): HAEntity[] {
  return entities.filter((entity) => {
    const entityDomain = entity.entity_id.split(".")[0] as string;
    return entityDomain === domain;
  });
}

/**
 * Gets entities with specific attributes
 * @param entities Array of entities to search
 * @param attributeName The attribute name to search for
 * @param attributeValue The attribute value to match
 * @returns Filtered array of entities
 */
export function filterEntitiesByAttribute(
  entities: HAEntity[],
  attributeName: string,
  attributeValue: unknown,
): HAEntity[] {
  return entities.filter((entity) => {
    const attribute = entity.attributes[attributeName];
    return attribute === attributeValue;
  });
}

/**
 * Groups entities by domain
 * @param entities Array of entities to group
 * @returns Object mapping domains to their entities
 */
export function groupEntitiesByDomain(entities: HAEntity[]) {
  return entities.reduce(
    (groups, entity) => {
      const domain = entity.entity_id.split(".")[0] as string;
      if (!groups[domain]) {
        groups[domain] = [];
      }
      groups[domain].push(entity);
      return groups;
    },
    {} as Record<string, HAEntity[]>,
  );
}

/**
 * Sorts entities by their friendly name
 * @param entities Array of entities to sort
 * @returns Sorted array of entities
 */
export function sortEntitiesByName(entities: HAEntity[]): HAEntity[] {
  return [...entities].sort((a, b) => {
    const nameA =
      (a.attributes["friendly_name"] as string | undefined) || a.entity_id;
    const nameB =
      (b.attributes["friendly_name"] as string | undefined) || b.entity_id;
    return nameA.localeCompare(nameB);
  });
}
