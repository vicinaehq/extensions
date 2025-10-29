import * as yaml from "js-yaml";
import * as toml from "toml";
import type { WorkflowConfig } from "../types/workflow";

export function parseWorkflowFile(content: string, extension: string): WorkflowConfig {
  const config: WorkflowConfig = {};

  try {
    let parsedData: Record<string, unknown>;

    // Parse based on file extension
    if (extension === ".json") {
      parsedData = JSON.parse(content) as Record<string, unknown>;
    } else if (extension === ".yaml" || extension === ".yml") {
      parsedData = yaml.load(content) as Record<string, unknown>;
    } else if (extension === ".toml") {
      parsedData = toml.parse(content) as Record<string, unknown>;
    } else {
      // Fallback to regex parsing for unknown formats
      return parseWithRegex(content, extension);
    }

    // Extract basic properties
    if (parsedData.description && typeof parsedData.description === "string") {
      config.description = parsedData.description;
    }

    if (
      parsedData.final_workspace !== undefined &&
      typeof parsedData.final_workspace === "number"
    ) {
      config.final_workspace = parsedData.final_workspace;
    }

    // Count workspaces and apps
    let workspaceCount = 0;
    let appCount = 0;

    if (parsedData.workspaces && Array.isArray(parsedData.workspaces)) {
      workspaceCount = parsedData.workspaces.length;

      // Count apps across all workspaces
      for (const workspace of parsedData.workspaces) {
        if (workspace.apps && Array.isArray(workspace.apps)) {
          appCount += workspace.apps.length;
        }
      }
    }

    // Create workspaces array with proper counts
    if (workspaceCount > 0) {
      config.workspaces = Array(workspaceCount)
        .fill(null)
        .map((_, i) => ({
          target: i,
          apps: [], // We don't need to populate the actual apps, just count them
        }));
    }

    // Store the total app count for summary generation
    config.totalAppCount = appCount;

    return config;
  } catch (error) {
    console.error(`Error parsing ${extension} file:`, error);
    // Fallback to regex parsing if library parsing fails
    return parseWithRegex(content, extension);
  }
}

function parseWithRegex(content: string, extension: string): WorkflowConfig {
  const config: WorkflowConfig = {};

  // Extract description
  const descMatch = content.match(
    /(?:^|\n)\s*(?:"?description"?\s*[:=]\s*|description\s*=\s*)["']?([^"'\n,}]+)["']?/i
  );
  if (descMatch) {
    config.description = descMatch[1].trim();
  }

  // Extract final_workspace
  const finalWsMatch = content.match(
    /(?:^|\n)\s*(?:"?final_workspace"?\s*[:=]\s*|final_workspace\s*=\s*)(\d+)/i
  );
  if (finalWsMatch) {
    config.final_workspace = parseInt(finalWsMatch[1], 10);
  }

  // Count workspaces and apps based on format
  let workspaceCount = 0;
  let appCount = 0;

  if (extension === ".json") {
    // JSON format counting
    const workspaceMatches = content.match(/"target"\s*:\s*\d+/g);
    workspaceCount = workspaceMatches ? workspaceMatches.length : 0;

    const appMatches = content.match(/"name"\s*:\s*"[^"]+"/g);
    appCount = appMatches ? appMatches.length : 0;
  } else if (extension === ".yaml" || extension === ".yml") {
    // YAML format counting - simpler approach
    const workspaceMatches = content.match(/^\s*-\s+target\s*:/gm);
    workspaceCount = workspaceMatches ? workspaceMatches.length : 0;

    const appMatches = content.match(/^\s*-\s+name\s*:/gm);
    appCount = appMatches ? appMatches.length : 0;
  } else if (extension === ".toml") {
    // TOML format counting
    const workspaceMatches = content.match(/\[\[workspaces\]\]/g);
    workspaceCount = workspaceMatches ? workspaceMatches.length : 0;

    // For TOML, apps are usually defined as name = "..." within workspace sections
    // Look for name = "..." patterns that are likely app definitions
    const appMatches = content.match(/^\s*name\s*=\s*"[^"]+"/gm);
    appCount = appMatches ? appMatches.length : 0;
  }

  // Create workspaces array with proper counts
  if (workspaceCount > 0) {
    config.workspaces = Array(workspaceCount)
      .fill(null)
      .map((_, i) => ({
        target: i,
        apps: [], // We don't need to populate the actual apps, just count them
      }));
  }

  // Store the total app count for summary generation
  config.totalAppCount = appCount;

  return config;
}

export function extractWorkflowDescription(config: WorkflowConfig): string {
  return config.description || "No description available";
}

export function getWorkflowSummary(config: WorkflowConfig): string {
  const parts: string[] = [];

  if (config.description) {
    parts.push(config.description);
  }

  if (config.workspaces && config.workspaces.length > 0) {
    const workspaceCount = config.workspaces.length;
    const appCount = config.totalAppCount || 0;
    parts.push(
      `${workspaceCount} workspace${workspaceCount > 1 ? "s" : ""}, ${appCount} app${appCount > 1 ? "s" : ""}`
    );
  }

  return parts.join(" • ");
}
