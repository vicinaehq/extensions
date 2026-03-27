import { Action, ActionPanel, Clipboard, Icon } from "@vicinae/api";
import type { ReactNode } from "react";
import type { IconData, PrimaryAction } from "./iconify-types";
import {
	ACTION_ORDER,
	copySvgFile,
	formatIconName,
	getPrimaryAction,
	getPrimaryActionIcon,
	handleActionError,
	notifySuccess,
	pasteSvgFile,
	toSvgUrl,
} from "./iconify-utils";

type ActionKind = PrimaryAction;

type IconActionsProps = {
	icon: IconData;
	svg: string;
	dataUri: string;
	children?: ReactNode;
};

const titleMap: Record<ActionKind, string> = {
	paste: "Paste SVG String",
	copy: "Copy SVG String",
	pasteFile: "Paste SVG File",
	copyFile: "Copy SVG File",
	pasteName: "Paste Icon Name",
	copyName: "Copy Icon Name",
	copyURL: "Copy SVG URL",
	copyDataURI: "Copy Data URI",
};

const executeAction = async (
	kind: ActionKind,
	icon: IconData,
	svg: string,
	dataUri: string,
) => {
	const iconName = formatIconName(icon.set.id, icon.id);

	switch (kind) {
		case "paste":
			await Clipboard.paste(svg);
			await notifySuccess("Pasted SVG");
			return;
		case "copy":
			await Clipboard.copy(svg);
			await notifySuccess("Copied SVG");
			return;
		case "pasteFile":
			await pasteSvgFile(icon, svg);
			await notifySuccess("Pasted SVG file");
			return;
		case "copyFile":
			await copySvgFile(icon, svg);
			await notifySuccess("Copied SVG file");
			return;
		case "pasteName":
			await Clipboard.paste(iconName);
			await notifySuccess("Pasted icon name");
			return;
		case "copyName":
			await Clipboard.copy(iconName);
			await notifySuccess("Copied icon name");
			return;
		case "copyURL":
			await Clipboard.copy(toSvgUrl(icon.set.id, icon.id));
			await notifySuccess("Copied SVG URL");
			return;
		case "copyDataURI":
			await Clipboard.copy(dataUri);
			await notifySuccess("Copied Data URI");
			return;
	}
};

const IconAction = ({
	kind,
	icon,
	svg,
	dataUri,
}: {
	kind: ActionKind;
	icon: IconData;
	svg: string;
	dataUri: string;
}) => (
	<Action
		title={titleMap[kind]}
		icon={getPrimaryActionIcon(kind)}
		onAction={() =>
			executeAction(kind, icon, svg, dataUri).catch((error) =>
				handleActionError(titleMap[kind], error),
			)
		}
	/>
);

export const IconActions = ({
	icon,
	svg,
	dataUri,
	children,
}: IconActionsProps) => {
	const primaryAction = getPrimaryAction();
	const orderedKinds = [
		primaryAction,
		...ACTION_ORDER.filter((kind) => kind !== primaryAction),
	];

	return (
		<ActionPanel>
			<ActionPanel.Section title="Icon Actions">
				{orderedKinds.map((kind) => (
					<IconAction
						key={kind}
						kind={kind}
						icon={icon}
						svg={svg}
						dataUri={dataUri}
					/>
				))}
			</ActionPanel.Section>
			<ActionPanel.Section title="Metadata">
				<Action.CopyToClipboard
					title="Copy Raw Icon Name"
					icon={Icon.Tag}
					content={icon.id}
				/>
				<Action.CopyToClipboard
					title="Copy Collection Name"
					icon={Icon.AppWindowSidebarLeft}
					content={icon.set.title}
				/>
				<Action.OpenInBrowser
					title="Open Icon in Browser"
					icon={Icon.Globe01}
					url={toSvgUrl(icon.set.id, icon.id)}
				/>
			</ActionPanel.Section>
			{children}
		</ActionPanel>
	);
};
