/**
 * Types used across the extension.
 *
 * Everything here is derived from the installed `@opencode/client` (the official
 * OpenCode V2 client). No OpenCode types come from this extension.
 */
export type {
  ServerInfo,
  SessionInfo,
  SessionsResponse,
  SessionActive,
  SessionStatus,
  SessionMessageInfo,
  SessionMessageUser,
  SessionMessageAssistant,
  SessionMessageAssistantText,
  Project,
  ModelInfo,
  ModelRef,
  ModelDefaultOutput,
  VcsInfo,
  VcsGetOutput,
  PermissionRequest,
  V2Event,
} from "@opencode/client";

export type { OpenCodeClient } from "@opencode/client";
export { ClientError } from "@opencode/client";
