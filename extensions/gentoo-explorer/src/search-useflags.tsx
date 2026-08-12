import { Action, ActionPanel, Icon, Keyboard, List } from "@vicinae/api";
import { SITE_URL, getUseFlagPackages, getUseFlags } from "./api";
import { useApi } from "./hooks";
import { PackageListItem } from "./package-list-item";
import { singleLine } from "./utils";

const UseFlagPackagesView = ({ flag }: { flag: string }) => {
	const {
		data: packages,
		isLoading,
		error,
	} = useApi((signal) => getUseFlagPackages(flag, signal), [flag]);

	return (
		<List
			isLoading={isLoading}
			navigationTitle={`Packages using ${flag}`}
			searchBarPlaceholder="Search packages..."
		>
			{error ? (
				<List.EmptyView
					title="Failed to load packages"
					description={error.message}
				/>
			) : null}

			<List.Section title={`USE ${flag}`} subtitle={`${packages?.length ?? 0}`}>
				{packages?.map((pkg) => (
					<PackageListItem key={pkg.id} pkg={pkg} />
				))}
			</List.Section>
		</List>
	);
};

export default function SearchUseFlags() {
	const {
		data: flags,
		isLoading,
		error,
	} = useApi((signal) => getUseFlags(signal), []);

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search USE flags...">
			{error ? (
				<List.EmptyView
					title="Failed to load USE flags"
					description={error.message}
				/>
			) : null}

			<List.Section
				title="USE Flags"
				subtitle={`${flags?.length ?? 0} most used`}
			>
				{flags?.map((flag) => (
					<List.Item
						key={flag.name}
						title={flag.name}
						subtitle={singleLine(flag.description) || undefined}
						icon={Icon.Flag}
						accessories={[{ text: `${flag.count} packages` }]}
						actions={
							<ActionPanel>
								<Action.Push
									title="Show Packages"
									icon={Icon.Box}
									target={<UseFlagPackagesView flag={flag.name} />}
								/>
								<Action.CopyToClipboard title="Copy Flag" content={flag.name} />
								<Action.OpenInBrowser
									title="Open on Ebuilds.info"
									icon={Icon.Globe01}
									url={`${SITE_URL}/useflag/${flag.name}`}
									shortcut={
										Keyboard.Shortcut.Common.Open as Keyboard.Shortcut.Common
									}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
