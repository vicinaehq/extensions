import { Icon, Image } from "@vicinae/api";

interface ModelDisplayInfo {
  name: string;
  icon: Image.ImageLike;
  vision: boolean;
}

/**
 * Maps known Bedrock model IDs to abbreviated display names and company icons.
 */
const MODEL_DISPLAY_INFO: Record<string, ModelDisplayInfo> = {
  "us.anthropic.claude-opus-4-6-v1": {
    name: "Claude Opus 4.6",
    icon: "anthropic.svg",
    vision: true,
  },
  "us.anthropic.claude-sonnet-4-6": {
    name: "Claude Sonnet 4.6",
    icon: "anthropic.svg",
    vision: true,
  },
  "us.anthropic.claude-haiku-4-5-20251001-v1:0": {
    name: "Claude Haiku 4.5",
    icon: "anthropic.svg",
    vision: true,
  },
  "moonshotai.kimi-k2.5": {
    name: "Kimi K2.5",
    icon: "moonshot.svg",
    vision: true,
  },
  "zai.glm-5": {
    name: "GLM 5",
    icon: "zhipu.svg",
    vision: false,
  },
};

/**
 * Returns the display name for a Bedrock model ID.
 * Falls back to the raw model ID for unknown/custom models.
 */
export function getModelDisplayName(modelId: string): string {
  return MODEL_DISPLAY_INFO[modelId]?.name ?? modelId;
}

/**
 * Returns the icon for a Bedrock model ID.
 * Falls back to a generic icon for unknown/custom models.
 */
export function getModelIcon(modelId: string): Image.ImageLike {
  return MODEL_DISPLAY_INFO[modelId]?.icon ?? Icon.ComputerChip;
}

/**
 * Returns whether a model is known to support vision/image input.
 * Unknown/custom models are assumed vision-capable.
 */
export function isVisionModel(modelId: string): boolean {
  return MODEL_DISPLAY_INFO[modelId]?.vision ?? true;
}
