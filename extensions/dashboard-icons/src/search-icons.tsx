import {
	CDN_BASE_URL,
	REQUEST_ICON_URL,
	useDashboardIcons,
	type DashboardIcon,
} from "./dashboard-icons";
import {
	Action,
	ActionPanel,
	environment,
	Grid,
	showToast,
	Toast,
	Clipboard,
	showHUD,
	Icon,
	Image,
	getPreferenceValues,
} from "@vicinae/api";
import * as path from "node:path";
import * as fsp from "node:fs/promises";

const formatUrl = (name: string, format: string) =>
	`${CDN_BASE_URL}/${format}/${name}.${format}`;

// we use png cause it's best supported
// QT's svg renderer is quite lacking and webp requires a plugin some people don't seem to have
const iconToImage = (icon: DashboardIcon): Image.ThemedSource => {
	return {
		light: formatUrl(icon.colors?.light ?? icon.name, "png"),
		dark: formatUrl(icon.colors?.dark ?? icon.name, "png"),
	};
};

const CopyFormatAction = ({
	icon,
	format,
	action,
}: {
	format: Format;
	icon: DashboardIcon;
	action: "paste" | "copy";
}) => {
	const download = async (): Promise<string> => {
		const url = formatUrl(icon.name, format);
		const toast = await showToast(Toast.Style.Animated, "Download icon...");
		const iconDir = path.join(environment.supportPath, "icons");
		const target = path.join(iconDir, `${icon.name}.${format}`);
		const res = await fetch(url);
		const buf = await res.bytes();

		await fsp.mkdir(iconDir, { recursive: true });
		await fsp.writeFile(target, buf);

		toast.style = Toast.Style.Success;
		toast.title = "Icon downloaded";

		return target;
	};

	const handle = async () => {
		const path = await download();
		if (action === "copy") await Clipboard.copy({ file: path });
		else if (action === "paste") await Clipboard.paste({ file: path });
		await showHUD("Copied to clipboard");
	};

	return (
		<Action
			title={`Copy as ${format}`}
			icon={Icon.CopyClipboard}
			onAction={handle}
		></Action>
	);
};

const IconCell = ({ icon }: { icon: DashboardIcon }) => {
	const preferences = getPreferenceValues();
	const copyFormat = preferences["copy-format"];

	return (
		<Grid.Item
			title={icon.name}
			content={{ source: iconToImage(icon), tooltip: icon.name }}
			keywords={[...icon.categories, ...icon.aliases]}
			actions={
				<ActionPanel>
					<CopyFormatAction icon={icon} format={copyFormat} action={"copy"} />
					{formats
						.filter((fmt) => fmt !== copyFormat)
						.map((fmt) => (
							<CopyFormatAction
								key={`copy-${fmt}`}
								icon={icon}
								format={fmt}
								action={"copy"}
							/>
						))}
					{formats.map((fmt) => (
						<Action.CopyToClipboard
							key={`copy-url-${fmt}`}
							title={`Copy ${fmt} URL`}
							content={formatUrl(icon.name, fmt)}
						/>
					))}
					<Action.CopyToClipboard
						title={`Copy icon name`}
						content={icon.name}
					/>
				</ActionPanel>
			}
		/>
	);
};

const formats = ["png", "svg", "webp"] as const;
type Format = (typeof formats)[number];

export default function SearchIcons() {
	const { groupedIcons, loading, clearCache } = useDashboardIcons();

	const executeClearCache = async () => {
		clearCache();
		await showToast(Toast.Style.Success, `Cache cleared`);
	};

	return (
		<Grid
			isLoading={loading}
			columns={6}
			inset={Grid.Inset.Large}
			searchBarPlaceholder="Search icons..."
			filtering
			actions={
				<ActionPanel>
					<Action.OpenInBrowser
						title="Request new icon"
						icon={Icon.Microphone}
						url={REQUEST_ICON_URL}
					/>
					<Action
						title="Clear cache"
						icon={Icon.Trash}
						onAction={executeClearCache}
					/>
				</ActionPanel>
			}
		>
			<Grid.EmptyView
				title="No icon matches your search"
				description="No icon could be found, try refining your search."
				icon={Icon.Image}
			/>
			{groupedIcons.map((group) => (
				<Grid.Section title={group.name}>
					{group.icons.map((icon) => (
						<IconCell key={`${group.name}-${icon.name}`} icon={icon} />
					))}
				</Grid.Section>
			))}
		</Grid>
	);
}
