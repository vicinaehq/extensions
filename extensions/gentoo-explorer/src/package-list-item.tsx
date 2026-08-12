import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { type PackageSummary, packageUrl } from "./api";
import { PackageView } from "./package-view";
import { overlayColor } from "./utils";

export const PackageListItem = ({
	pkg,
	extraAccessories = [],
}: {
	pkg: PackageSummary;
	extraAccessories?: List.Item.Accessory[];
}) => {
	const atom = `${pkg.category}/${pkg.name}`;

	return (
		<List.Item
			title={atom}
			subtitle={pkg.description ?? undefined}
			icon={Icon.Box}
			accessories={[
				...extraAccessories,
				{ tag: { value: pkg.overlay, color: overlayColor(pkg.overlay) } },
				...(pkg.version ? [{ text: pkg.version }] : []),
			]}
			actions={
				<ActionPanel>
					<Action.Push
						title="Show Package"
						icon={Icon.Box}
						target={
							<PackageView
								category={pkg.category}
								name={pkg.name}
								overlay={pkg.overlay}
							/>
						}
					/>
					<Action.CopyToClipboard title="Copy Atom" content={atom} />
					<Action.OpenInBrowser
						title="Open on Ebuilds.info"
						icon={Icon.Globe01}
						url={packageUrl(pkg.category, pkg.name)}
					/>
				</ActionPanel>
			}
		/>
	);
};
