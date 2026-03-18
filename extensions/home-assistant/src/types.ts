/**
 * Context object included in entity state
 */
export interface HAContext {
  id: string;
  parent_id: string | null;
  user_id: string | null;
}

/**
 * Common attributes shared by all entities
 */
export interface HABaseAttributes {
  friendly_name?: string;
  icon?: string;
  device_class?: string;
  supported_features?: number;
  restored?: boolean;
  assumed_state?: boolean;
}

/**
 * Represents a Home Assistant entity
 */
export interface HAEntity {
  entity_id: string;
  state: string;
  attributes: HABaseAttributes & Record<string, unknown>;
  last_changed: string;
  last_reported: string;
  last_updated: string;
  context: HAContext;
}

/**
 * Light color modes
 */
export type HAColorMode =
  | "onoff"
  | "brightness"
  | "color_temp"
  | "hs"
  | "xy"
  | "rgb"
  | "rgbw"
  | "rgbww"
  | "white";

/**
 * Light entity attributes
 */
export interface HALightAttributes extends HABaseAttributes {
  brightness?: number | null;
  color_mode?: HAColorMode | null;
  color_temp?: number | null;
  color_temp_kelvin?: number | null;
  min_color_temp_kelvin?: number;
  max_color_temp_kelvin?: number;
  min_mireds?: number;
  max_mireds?: number;
  hs_color?: [number, number] | null;
  rgb_color?: [number, number, number] | null;
  xy_color?: [number, number] | null;
  effect?: string | null;
  effect_list?: string[];
  supported_color_modes?: HAColorMode[];
}

/**
 * Represents a light entity
 */
export interface HALightEntity extends HAEntity {
  attributes: HALightAttributes & Record<string, unknown>;
}

/**
 * Switch entity attributes
 */
export interface HASwitchAttributes extends HABaseAttributes {
  is_on?: boolean;
}

/**
 * Represents a switch entity
 */
export interface HASwitchEntity extends HAEntity {
  attributes: HASwitchAttributes & Record<string, unknown>;
}

/**
 * Cover entity attributes
 */
export interface HACoverAttributes extends HABaseAttributes {
  current_position?: number;
  current_tilt_position?: number;
}

/**
 * Represents a cover entity (blinds, curtains, etc.)
 */
export interface HACoverEntity extends HAEntity {
  attributes: HACoverAttributes & Record<string, unknown>;
}

/**
 * Climate HVAC modes
 */
export type HAHvacMode =
  | "off"
  | "heat"
  | "cool"
  | "heat_cool"
  | "auto"
  | "dry"
  | "fan_only";

/**
 * Climate entity attributes
 */
export interface HAClimateAttributes extends HABaseAttributes {
  temperature?: number | null;
  target_temp_high?: number | null;
  target_temp_low?: number | null;
  current_temperature?: number | null;
  current_humidity?: number | null;
  target_humidity?: number | null;
  min_temp?: number;
  max_temp?: number;
  min_humidity?: number;
  max_humidity?: number;
  hvac_modes?: HAHvacMode[];
  hvac_action?: string | null;
  preset_mode?: string | null;
  preset_modes?: string[];
  fan_mode?: string | null;
  fan_modes?: string[];
  swing_mode?: string | null;
  swing_modes?: string[];
}

/**
 * Represents a climate entity
 */
export interface HAClimateEntity extends HAEntity {
  attributes: HAClimateAttributes & Record<string, unknown>;
}

/**
 * Sensor state classes
 */
export type HAStateClass = "measurement" | "total" | "total_increasing";

/**
 * Sensor entity attributes
 */
export interface HASensorAttributes extends HABaseAttributes {
  state_class?: HAStateClass;
  unit_of_measurement?: string;
  options?: string[];
}

/**
 * Represents a sensor entity
 */
export interface HASensorEntity extends HAEntity {
  attributes: HASensorAttributes & Record<string, unknown>;
}

/**
 * Binary sensor entity attributes
 */
export type HABinarySensorAttributes = HABaseAttributes;

/**
 * Represents a binary sensor entity
 */
export interface HABinarySensorEntity extends HAEntity {
  attributes: HABinarySensorAttributes & Record<string, unknown>;
}

/**
 * Automation entity attributes
 */
export interface HAAutomationAttributes extends HABaseAttributes {
  id?: string;
  last_triggered?: string | null;
  mode?: "single" | "restart" | "queued" | "parallel";
  current?: number;
  max?: number;
}

/**
 * Represents an automation entity
 */
export interface HAAutomationEntity extends HAEntity {
  attributes: HAAutomationAttributes & Record<string, unknown>;
}

/**
 * Script entity attributes
 */
export interface HAScriptAttributes extends HABaseAttributes {
  last_triggered?: string | null;
  mode?: "single" | "restart" | "queued" | "parallel";
  current?: number;
  max?: number;
}

/**
 * Represents a script entity
 */
export interface HAScriptEntity extends HAEntity {
  attributes: HAScriptAttributes & Record<string, unknown>;
}

/**
 * Fan entity attributes
 */
export interface HAFanAttributes extends HABaseAttributes {
  percentage?: number | null;
  percentage_step?: number;
  preset_mode?: string | null;
  preset_modes?: string[];
  oscillating?: boolean | null;
  direction?: "forward" | "reverse" | null;
}

/**
 * Represents a fan entity
 */
export interface HAFanEntity extends HAEntity {
  attributes: HAFanAttributes & Record<string, unknown>;
}

/**
 * Media player entity states
 */
export type HAMediaPlayerState =
  | "off"
  | "on"
  | "idle"
  | "playing"
  | "paused"
  | "standby"
  | "buffering";

/**
 * Media player entity attributes
 */
export interface HAMediaPlayerAttributes extends HABaseAttributes {
  volume_level?: number | null;
  is_volume_muted?: boolean | null;
  media_content_id?: string | null;
  media_content_type?: string | null;
  media_duration?: number | null;
  media_position?: number | null;
  media_position_updated_at?: string | null;
  media_title?: string | null;
  media_artist?: string | null;
  media_album_name?: string | null;
  source?: string | null;
  source_list?: string[];
  sound_mode?: string | null;
  sound_mode_list?: string[];
  shuffle?: boolean | null;
  repeat?: "off" | "one" | "all" | null;
  entity_picture?: string | null;
}

/**
 * Represents a media player entity
 */
export interface HAMediaPlayerEntity extends HAEntity {
  attributes: HAMediaPlayerAttributes & Record<string, unknown>;
}

/**
 * Represents Home Assistant configuration
 */
export interface HAConfig {
  url: string;
  token: string;
}

/**
 * Represents API error types
 */
export type HAErrorType =
  | "NETWORK_ERROR"
  | "AUTHENTICATION_ERROR"
  | "VALIDATION_ERROR"
  | "API_ERROR"
  | "TIMEOUT_ERROR";

/**
 * Represents an API error
 */
export class HAError extends Error {
  constructor(
    message: string,
    public type: HAErrorType,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "HAError";
  }
}

/**
 * Represents API response with error handling
 */
export interface HAResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

/**
 * Configuration validation errors
 */
export type ValidationErrors =
  | "INVALID_URL"
  | "INVALID_TOKEN"
  | "MISSING_URL"
  | "MISSING_TOKEN";

/**
 * Configuration validation error
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public errorType: ValidationErrors,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Network error for API calls
 */
export class NetworkError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * Authentication error for API calls
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

/**
 * Timeout error for API calls
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Entity domain types
 */
export type HADomain =
  | "light"
  | "switch"
  | "cover"
  | "climate"
  | "sensor"
  | "binary_sensor"
  | "automation"
  | "script"
  | "fan"
  | "media_player"
  | "input_boolean"
  | "scene"
  | "button"
  | "update"
  | "person"
  | "zone"
  | "sun"
  | "weather";

/**
 * Extract domain from entity_id
 */
export function getDomain(entityId: string): HADomain | string {
  return entityId.split(".")[0] ?? "";
}

/**
 * Type guard for light entities
 */
export function isLightEntity(entity: HAEntity): entity is HALightEntity {
  return getDomain(entity.entity_id) === "light";
}

/**
 * Type guard for switch entities
 */
export function isSwitchEntity(entity: HAEntity): entity is HASwitchEntity {
  return getDomain(entity.entity_id) === "switch";
}

/**
 * Type guard for cover entities
 */
export function isCoverEntity(entity: HAEntity): entity is HACoverEntity {
  return getDomain(entity.entity_id) === "cover";
}

/**
 * Type guard for climate entities
 */
export function isClimateEntity(entity: HAEntity): entity is HAClimateEntity {
  return getDomain(entity.entity_id) === "climate";
}

/**
 * Type guard for sensor entities
 */
export function isSensorEntity(entity: HAEntity): entity is HASensorEntity {
  return getDomain(entity.entity_id) === "sensor";
}

/**
 * Type guard for automation entities
 */
export function isAutomationEntity(
  entity: HAEntity,
): entity is HAAutomationEntity {
  return getDomain(entity.entity_id) === "automation";
}

/**
 * Type guard for fan entities
 */
export function isFanEntity(entity: HAEntity): entity is HAFanEntity {
  return getDomain(entity.entity_id) === "fan";
}

/**
 * Type guard for media player entities
 */
export function isMediaPlayerEntity(
  entity: HAEntity,
): entity is HAMediaPlayerEntity {
  return getDomain(entity.entity_id) === "media_player";
}

/**
 * Check if entity is a battery sensor
 */
export function isBatteryEntity(entity: HAEntity): boolean {
  return (
    entity.attributes.device_class === "battery" ||
    entity.entity_id.toLowerCase().includes("battery")
  );
}
