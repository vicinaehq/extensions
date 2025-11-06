import React, { useState, useEffect } from "react";
import {
	List,
	ActionPanel,
	Action,
	showToast,
	Icon,
	closeMainWindow,
	PopToRootType,
	getPreferenceValues,
} from "@vicinae/api";
import toolsData from "./tools-data.json";
import type { ITTool, PreferenceValues } from "./types";

// Tool icon - same for all tools
const EXTENSION_ICON = "extension_icon.png";

/**
 * Gets the icon for a tool, validating that it's a valid data URI
 */
function getToolIcon(tool: ITTool): string {
	if (!tool.icon) {
		return EXTENSION_ICON;
	}

	// Validate that the icon is a valid data URI for SVG
	if (tool.icon.startsWith("data:image/svg+xml")) {
		return tool.icon;
	}

	// If it's not a valid SVG data URI, fallback to default icon
	return EXTENSION_ICON;
}

function loadTools(preferences: PreferenceValues): ITTool[] {
	console.log("[IT Tools] Loading tools from tools-data.json...");

	const baseUrl =
		preferences["base-url"] || "https://sharevb-it-tools.vercel.app";

	const tools: ITTool[] = (toolsData as { tools: ITTool[] }).tools.map(
		(tool) => ({
			name: tool.name,
			description: tool.description,
			href: `${baseUrl}/${tool.path}`,
			path: tool.path,
			icon: tool.icon,
		}),
	);

	console.log(`[IT Tools] Loaded ${tools.length} tools from configuration`);

	return tools;
}

export default function ITToolsList() {
	const [tools, setTools] = useState<ITTool[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const preferences = getPreferenceValues<PreferenceValues>();

	useEffect(() => {
		console.log("[IT Tools] Component mounted, loading tools...");
		try {
			const loadedTools = loadTools(preferences);
			setTools(loadedTools);
			setIsLoading(false);
		} catch (error) {
			console.error("[IT Tools] Error loading IT tools:", error);
			showToast({
				title: "Error",
				message: `Failed to load IT tools: ${error}`,
			});
			setIsLoading(false);
		}
	}, [preferences]);

	if (isLoading) {
		console.log("[IT Tools] Rendering loading state...");
		return (
			<List searchBarPlaceholder="Loading IT tools..." isLoading={true}>
				<List.Section title="IT Tools">
					<List.Item title="Loading..." />
				</List.Section>
			</List>
		);
	}

	console.log(`[IT Tools] Rendering ${tools.length} tools`);

	if (tools.length === 0) {
		console.warn("[IT Tools] No tools to display!");
		return (
			<List searchBarPlaceholder="Search IT tools...">
				<List.Section title="IT Tools">
					<List.Item
						title="No tools found"
						subtitle="Unable to load tools. Check the console logs for details."
						icon={Icon.Warning}
					/>
				</List.Section>
			</List>
		);
	}

	return (
		<List searchBarPlaceholder="Search IT tools...">
			<List.Section title={`IT Tools (${tools.length})`}>
				{tools.map((tool) => (
					<List.Item
						key={tool.href}
						title={tool.name}
						subtitle={tool.description}
						icon={getToolIcon(tool)}
						actions={
							<ActionPanel>
								<Action
									title="Open Tool"
									icon={Icon.Globe}
									onAction={async () => {
										// Open URL in browser using system command
										// This will work on Linux (xdg-open), macOS (open), and Windows (start)
										const { exec } = require("child_process");
										const command =
											process.platform === "win32"
												? `start "" "${tool.href}"`
												: process.platform === "darwin"
													? `open "${tool.href}"`
													: `xdg-open "${tool.href}"`;

										// Execute the command (non-blocking, ignore errors)
										exec(command, (error: Error | null) => {
											if (error) {
												console.error("[IT Tools] Failed to open URL:", error);
											}
										});

										// Close Vicinae window completely
										await closeMainWindow({
											clearRootSearch: true,
											popToRootType: PopToRootType.Immediate,
										});
									}}
								/>
								<Action.CopyToClipboard
									title="Copy URL"
									content={tool.href}
									icon={Icon.Clipboard}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
