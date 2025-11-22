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

const isTextFormat = (fmt: Format) => fmt === "svg";

const CopyFormatAction = ({
	icon,
	format,
}: {
	format: Format;
	icon: DashboardIcon;
}) => {
	const download = async (name: string) => {
		const url = formatUrl(name, format);
		const toast = await showToast(Toast.Style.Animated, "Download icon...");
		const res = await fetch(url);

		if (isTextFormat(format)) {
			await Clipboard.copy({ text: await res.text() });
		} else {
			const buf = await res.bytes();
			const iconDir = path.join(environment.supportPath, "icons");
			const target = path.join(iconDir, `${name}.${format}`);
			await fsp.mkdir(iconDir, { recursive: true });
			await fsp.writeFile(target, buf);
			await Clipboard.copy({ file: target });
		}

		toast.style = Toast.Style.Success;
		toast.title = "Icon downloaded";
		await showHUD("Copied to clipboard");
	};

	const makeDownload = (name: string) => () => download(name);

	if (icon.colors) {
		return (
			<>
				{icon.colors.dark && (
					<Action
						title={`Copy dark variant (${format})`}
						icon={Icon.Moon}
						onAction={makeDownload(icon.colors.dark)}
					/>
				)}
				{icon.colors.light && (
					<Action
						title={`Copy light variant (${format})`}
						icon={Icon.Sun}
						onAction={makeDownload(icon.colors.light)}
					/>
				)}
			</>
		);
	}

	return (
		<Action
			title={`Copy as ${format}`}
			icon={Icon.CopyClipboard}
			onAction={makeDownload(icon.name)}
		></Action>
	);
};

const CopyFormatUrlAction = ({
	icon,
	format,
}: {
	format: Format;
	icon: DashboardIcon;
}) => {
	if (icon.colors) {
		return (
			<>
				{icon.colors.dark && (
					<Action.CopyToClipboard
						title={`Copy dark URL (${format})`}
						icon={Icon.Moon}
						content={formatUrl(icon.colors.dark, format)}
					/>
				)}
				{icon.colors.light && (
					<Action.CopyToClipboard
						title={`Copy light URL (${format})`}
						icon={Icon.Sun}
						content={formatUrl(icon.colors.light, format)}
					/>
				)}
			</>
		);
	}

	return (
		<Action.CopyToClipboard
			title={`Copy URL (${format})`}
			icon={Icon.CopyClipboard}
			content={formatUrl(icon.name, format)}
		/>
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
					<ActionPanel.Section>
						<CopyFormatAction icon={icon} format={copyFormat} />
						{formats
							.filter((fmt) => fmt !== copyFormat)
							.map((fmt) => (
								<CopyFormatAction
									key={`copy-${fmt}`}
									icon={icon}
									format={fmt}
								/>
							))}
					</ActionPanel.Section>
					<ActionPanel.Section>
						{formats.map((fmt) => (
							<CopyFormatUrlAction format={fmt} icon={icon} />
						))}
					</ActionPanel.Section>
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
	const preferences = getPreferenceValues();
	const columns = parseInt(preferences.columns, 10);

	const executeClearCache = async () => {
		clearCache();
		await showToast(Toast.Style.Success, `Cache cleared`);
	};

	return (
		<Grid
			isLoading={loading}
			columns={columns}
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
				<Grid.Section title={group.name} key={group.name}>
					{group.icons.map((icon) => (
						<IconCell key={`${group.name}-${icon.name}`} icon={icon} />
					))}
				</Grid.Section>
			))}
		</Grid>
	);
}
