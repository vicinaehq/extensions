import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";

type DependencyReason =
	| "wl-mirror-not-found"
	| "wlr-randr-not-found"
	| "slurp-not-found";

type Reason = DependencyReason | "monitors-req-not-met";

type DependencyInfo = {
	packageName: string;
	summary: string;
	commands: { label: string; command: string }[];
};

const DEPENDENCIES: Record<DependencyReason, DependencyInfo> = {
	"wl-mirror-not-found": {
		packageName: "wl-mirror",
		summary:
			"Screen Mirror uses **wl-mirror** to capture your source display and render it on the target display.",
		commands: [
			{ label: "Arch Linux", command: "sudo pacman -S wl-mirror" },
			{ label: "Ubuntu / Debian", command: "sudo apt install wl-mirror" },
			{ label: "Fedora", command: "sudo dnf install wl-mirror" },
		],
	},
	"wlr-randr-not-found": {
		packageName: "wlr-randr",
		summary:
			"Screen Mirror uses **wlr-randr** to discover your connected outputs, resolutions, scale, and transform.",
		commands: [
			{ label: "Arch Linux", command: "sudo pacman -S wlr-randr" },
			{ label: "Ubuntu / Debian", command: "sudo apt install wlr-randr" },
			{ label: "Fedora", command: "sudo dnf install wlr-randr" },
		],
	},
	"slurp-not-found": {
		packageName: "slurp",
		summary:
			"Screen Mirror uses **slurp** to draw the on-screen overlay where you select the region you want to mirror.",
		commands: [
			{ label: "Arch Linux", command: "sudo pacman -S slurp" },
			{ label: "Ubuntu / Debian", command: "sudo apt install slurp" },
			{ label: "Fedora", command: "sudo dnf install slurp" },
		],
	},
};

const codeBlock = (command: string) => `~~~bash\n${command}\n~~~`;

const dependencyMarkdown = (info: DependencyInfo) =>
	[
		`# ${info.packageName} is not installed`,
		"",
		info.summary,
		"",
		"## Install it",
		"",
		...info.commands.flatMap(({ label, command }) => [
			`### ${label}`,
			"",
			codeBlock(command),
			"",
		]),
		"---",
		"",
		"After installing, choose **Retry Detection** below.",
	].join("\n");

const monitorMarkdown = (detectedMonitors: number) => {
	const detected =
		detectedMonitors === 1
			? "Only **1 active monitor** was detected."
			: detectedMonitors === 0
				? "No active monitors were detected."
				: `Only **${detectedMonitors} active monitors** were detected.`;

	return [
		"# Not enough monitors",
		"",
		"Screen Mirror needs a **source** display and a **target** display.",
		"",
		detected,
		"",
		"## What to do",
		"",
		"- Connect a second monitor, or enable a disabled output.",
		"- Make sure both outputs are active and extend the desktop.",
		"- Then choose **Retry Detection** below.",
		"",
	].join("\n");
};

const DependencyDetail = ({
	info,
	onRefresh,
}: {
	info: DependencyInfo;
	onRefresh: () => Promise<void>;
}) => {
	return (
		<Detail
			markdown={dependencyMarkdown(info)}
			actions={
				<ActionPanel>
					<Action
						title="Retry Detection"
						icon={Icon.RotateClockwise}
						shortcut={{ modifiers: ["ctrl"], key: "r" }}
						onAction={onRefresh}
					/>
				</ActionPanel>
			}
		/>
	);
};

const MonitorsDetail = ({
	detectedMonitors,
	onRefresh,
}: {
	detectedMonitors: number;
	onRefresh: () => Promise<void>;
}) => {
	return (
		<Detail
			markdown={monitorMarkdown(detectedMonitors)}
			actions={
				<ActionPanel>
					<Action
						title="Retry Detection"
						icon={Icon.RotateClockwise}
						shortcut={{ modifiers: ["ctrl"], key: "r" }}
						onAction={onRefresh}
					/>
				</ActionPanel>
			}
		/>
	);
};

export default function HandleMissingRequirements({
	onRefresh,
	reason,
	detectedMonitors = 0,
}: {
	onRefresh: () => Promise<void>;
	reason: Reason;
	detectedMonitors?: number;
}) {
	if (reason === "monitors-req-not-met") {
		return (
			<MonitorsDetail
				detectedMonitors={detectedMonitors}
				onRefresh={onRefresh}
			/>
		);
	}

	return <DependencyDetail info={DEPENDENCIES[reason]} onRefresh={onRefresh} />;
}
