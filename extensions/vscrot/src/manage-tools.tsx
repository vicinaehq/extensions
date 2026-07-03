import { Action, ActionPanel, Detail, Icon, List, showHUD } from "@vicinae/api";
import { copyTextToClipboard } from "./lib/clipboard";
import {
	TOOLS_DATABASE,
	detectPackageManager,
	getInstallCommand,
	isToolInstalled,
	type ToolInfo,
} from "./lib/tools-database";

const CATEGORY_TITLES: Record<string, string> = {
	capture: "Capture Tools",
	annotate: "Annotation Tools",
	clipboard: "Clipboard Tools",
	dependency: "Dependencies",
};

function InstallDetail({
	tool,
	pm,
}: {
	tool: ToolInfo;
	pm: ReturnType<typeof detectPackageManager>;
}) {
	const pms = ["pacman", "apt", "dnf", "brew", "winget"] as const;
	const rows = pms
		.map((p) => {
			const cmd = tool.packages[p];
			return cmd ? `| \`${p}\` | \`${cmd}\` |` : null;
		})
		.filter(Boolean)
		.join("\n");

	const notes = tool.notes ? `\n> **Note:** ${tool.notes}\n` : "";

	const markdown = `# ${tool.displayName}\n\n${tool.description}\n${notes}\n## Install Commands\n\n| Package Manager | Command |\n|---|---|\n${rows || "| - | No package available |"}`;

	return (
		<Detail
			markdown={markdown}
			navigationTitle={`Install ${tool.displayName}`}
			actions={
				<ActionPanel>
					{pm !== "unknown" && getInstallCommand(tool, pm) && (
						<Action
							title={`Copy Command for ${pm}`}
							icon={Icon.CopyClipboard}
							onAction={() => {
								const cmd = getInstallCommand(tool, pm)!;
								copyTextToClipboard(cmd);
								showHUD(`Copied: ${cmd}`);
							}}
						/>
					)}
				</ActionPanel>
			}
		/>
	);
}

export default function ManageTools() {
	const pm = detectPackageManager();

	const categories = [
		"capture",
		"annotate",
		"clipboard",
		"dependency",
	] as const;

	const missingTools = TOOLS_DATABASE.filter(
		(t) => !isToolInstalled(t) && t.checkCommand !== null,
	);

	const installScript = missingTools
		.map((t) =>
			getInstallCommand(t, pm as Parameters<typeof getInstallCommand>[1]),
		)
		.filter(Boolean)
		.join("\n");

	return (
		<List
			searchBarPlaceholder="Search tools..."
			actions={
				<ActionPanel>
					{installScript && (
						<Action
							title="Copy Install Script for All Missing Tools"
							icon={Icon.CopyClipboard}
							onAction={() => {
								copyTextToClipboard(installScript);
								showHUD(`Copied install script (${missingTools.length} tools)`);
							}}
						/>
					)}
				</ActionPanel>
			}
		>
			{categories.map((category) => {
				const tools = TOOLS_DATABASE.filter((t) => t.category === category);
				return (
					<List.Section key={category} title={CATEGORY_TITLES[category]}>
						{tools.map((tool) => {
							const installed = isToolInstalled(tool);
							const installCmd =
								pm !== "unknown" ? getInstallCommand(tool, pm) : null;

							return (
								<List.Item
									key={tool.id}
									icon={installed ? Icon.CheckCircle : Icon.Circle}
									title={tool.displayName}
									subtitle={
										installed
											? "Installed"
											: (installCmd ?? "No package for current OS")
									}
									actions={
										<ActionPanel>
											{!installed && installCmd && (
												<Action
													title="Copy Install Command"
													icon={Icon.CopyClipboard}
													onAction={() => {
														copyTextToClipboard(installCmd);
														showHUD(`Copied: ${installCmd}`);
													}}
												/>
											)}
											<Action.Push
												title="Show All Package Managers"
												icon={Icon.BulletPoints}
												target={<InstallDetail tool={tool} pm={pm} />}
											/>
										</ActionPanel>
									}
								/>
							);
						})}
					</List.Section>
				);
			})}
		</List>
	);
}
