import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@vicinae/api";
import { useState } from "react";
import {
	type DepEdge,
	type Ebuild,
	type PackageDetail,
	getDeps,
	getPackage,
	getPackagePortageNews,
	packageUrl,
} from "./api";
import { useApi } from "./hooks";
import { overlayColor } from "./utils";

const keywordColor = (keyword: string): Color => {
	if (keyword.startsWith("-")) return Color.Red;
	if (keyword.startsWith("~")) return Color.Yellow;
	return Color.Green;
};

const useFlagColor = (flag: string): Color =>
	flag.startsWith("+") ? Color.Green : Color.SecondaryText;

const depBlock = (label: string, value: string | null) => {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	return `### ${label}\n\`\`\`\n${trimmed}\n\`\`\``;
};

const EbuildItem = ({
	pkg,
	ebuild,
}: {
	pkg: PackageDetail;
	ebuild: Ebuild;
}) => {
	const atom = `${pkg.category}/${pkg.name}`;
	const keywords = ebuild.keywords?.split(/\s+/).filter(Boolean) ?? [];
	const useFlags = ebuild.useFlags?.split(/\s+/).filter(Boolean) ?? [];

	const markdown = [
		`## ${atom}-${ebuild.version}`,
		pkg.description,
		pkg.longDescription,
		depBlock("DEPEND", ebuild.depend),
		depBlock("RDEPEND", ebuild.rdepend),
		depBlock("BDEPEND", ebuild.bdepend),
	]
		.filter(Boolean)
		.join("\n\n");

	return (
		<List.Item
			title={ebuild.version}
			icon={Icon.Box}
			accessories={[
				...(ebuild.slot !== "0" ? [{ tag: `slot ${ebuild.slot}` }] : []),
				...(ebuild.historic
					? [{ tag: { value: "historic", color: Color.Orange } }]
					: []),
			]}
			detail={
				<List.Item.Detail
					markdown={markdown}
					metadata={
						<List.Item.Detail.Metadata>
							<List.Item.Detail.Metadata.Label
								title="Overlay"
								text={{ value: pkg.overlay, color: overlayColor(pkg.overlay) }}
							/>
							<List.Item.Detail.Metadata.Label
								title="Version"
								text={ebuild.version}
							/>
							<List.Item.Detail.Metadata.Label
								title="Slot"
								text={ebuild.slot}
							/>
							<List.Item.Detail.Metadata.Label
								title="EAPI"
								text={String(ebuild.eapi)}
							/>
							{ebuild.license ? (
								<List.Item.Detail.Metadata.Label
									title="License"
									text={ebuild.license}
								/>
							) : null}
							{pkg.maintainerName || pkg.maintainerEmail ? (
								<List.Item.Detail.Metadata.Label
									title="Maintainer"
									text={pkg.maintainerName ?? pkg.maintainerEmail ?? ""}
								/>
							) : null}
							{pkg.homepage?.startsWith("http") ? (
								<List.Item.Detail.Metadata.Link
									title="Homepage"
									target={pkg.homepage}
									text={pkg.homepage}
								/>
							) : null}
							{keywords.length > 0 ? (
								<List.Item.Detail.Metadata.TagList title="Keywords">
									{keywords.map((keyword) => (
										<List.Item.Detail.Metadata.TagList.Item
											key={keyword}
											text={keyword}
											color={keywordColor(keyword)}
										/>
									))}
								</List.Item.Detail.Metadata.TagList>
							) : null}
							{useFlags.length > 0 ? (
								<List.Item.Detail.Metadata.TagList title="USE Flags">
									{useFlags.map((flag) => (
										<List.Item.Detail.Metadata.TagList.Item
											key={flag}
											text={flag}
											color={useFlagColor(flag)}
										/>
									))}
								</List.Item.Detail.Metadata.TagList>
							) : null}
						</List.Item.Detail.Metadata>
					}
				/>
			}
			actions={
				<ActionPanel>
					<Action.CopyToClipboard title="Copy Atom" content={atom} />
					<Action.CopyToClipboard
						title="Copy Versioned Atom"
						content={`=${atom}-${ebuild.version}`}
					/>
					<Action.CopyToClipboard
						title="Copy Emerge Command"
						content={`emerge --ask ${atom}`}
						icon={Icon.Terminal}
					/>
					<Action.OpenInBrowser
						title="Open on Ebuilds.info"
						icon={Icon.Globe01}
						url={packageUrl(pkg.category, pkg.name)}
						shortcut={Keyboard.Shortcut.Common.Open as Keyboard.Shortcut.Common}
					/>
					{pkg.homepage?.startsWith("http") ? (
						<Action.OpenInBrowser
							title="Open Homepage"
							icon={Icon.Link}
							url={pkg.homepage}
						/>
					) : null}
					<Action.Push
						title="Show Dependencies"
						icon={Icon.Network}
						target={<DepsView category={pkg.category} name={pkg.name} />}
					/>
					<Action.Push
						title="Show Portage News"
						icon={Icon.Rss}
						target={<PortageNewsView category={pkg.category} name={pkg.name} />}
					/>
				</ActionPanel>
			}
		/>
	);
};

export const PackageView = ({
	category,
	name,
	overlay,
}: {
	category: string;
	name: string;
	overlay?: string;
}) => {
	const atom = `${category}/${name}`;
	const {
		data: pkg,
		isLoading,
		error,
	} = useApi(
		(signal) => getPackage(category, name, overlay, signal),
		[category, name, overlay],
	);

	return (
		<List
			isLoading={isLoading}
			isShowingDetail
			navigationTitle={atom}
			searchBarPlaceholder="Filter versions..."
		>
			{error ? (
				<List.EmptyView
					title="Failed to load package"
					description={error.message}
				/>
			) : !isLoading && (pkg?.ebuilds.length ?? 0) === 0 ? (
				<List.EmptyView
					title="No ebuilds"
					description={`No indexed ebuild found for ${atom}.`}
				/>
			) : null}

			<List.Section title={atom} subtitle={pkg?.overlay}>
				{pkg?.ebuilds.map((ebuild) => (
					<EbuildItem key={ebuild.id} pkg={pkg} ebuild={ebuild} />
				))}
			</List.Section>
		</List>
	);
};

const DEP_SECTIONS: { type: DepEdge["type"]; title: string }[] = [
	{ type: "rdepend", title: "Runtime (RDEPEND)" },
	{ type: "depend", title: "Build & Runtime (DEPEND)" },
	{ type: "bdepend", title: "Build (BDEPEND)" },
];

const DepItem = ({ edge, rootAtom }: { edge: DepEdge; rootAtom: string }) => {
	const [category, name] = edge.to.split("/");

	return (
		<List.Item
			title={edge.to}
			subtitle={edge.from !== rootAtom ? `via ${edge.from}` : undefined}
			icon={Icon.Box}
			accessories={edge.condition ? [{ tag: edge.condition }] : []}
			actions={
				<ActionPanel>
					{category && name ? (
						<Action.Push
							title="Show Package"
							icon={Icon.Box}
							target={<PackageView category={category} name={name} />}
						/>
					) : null}
					<Action.CopyToClipboard title="Copy Atom" content={edge.to} />
					{category && name ? (
						<Action.OpenInBrowser
							title="Open on Ebuilds.info"
							icon={Icon.Globe01}
							url={packageUrl(category, name)}
							shortcut={
								Keyboard.Shortcut.Common.Open as Keyboard.Shortcut.Common
							}
						/>
					) : null}
				</ActionPanel>
			}
		/>
	);
};

export const DepsView = ({
	category,
	name,
}: {
	category: string;
	name: string;
}) => {
	const [depth, setDepth] = useState("2");
	const atom = `${category}/${name}`;
	const {
		data: graph,
		isLoading,
		error,
	} = useApi(
		(signal) => getDeps(category, name, Number(depth), signal),
		[category, name, depth],
	);

	const rootAtom = graph ? `${graph.root.category}/${graph.root.name}` : atom;
	const dedupe = (edges: DepEdge[]) => {
		const seen = new Set<string>();
		return edges.filter((edge) => {
			const key = `${edge.from}>${edge.to}>${edge.type}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	};
	const edges = dedupe(graph?.edges ?? []);

	return (
		<List
			isLoading={isLoading}
			navigationTitle={`Dependencies of ${atom}`}
			searchBarPlaceholder="Filter dependencies..."
			searchBarAccessory={
				<List.Dropdown
					tooltip="Traversal depth"
					value={depth}
					onChange={setDepth}
				>
					{["1", "2", "3", "4"].map((value) => (
						<List.Dropdown.Item
							key={value}
							title={`Depth ${value}`}
							value={value}
						/>
					))}
				</List.Dropdown>
			}
		>
			{error ? (
				<List.EmptyView
					title="Failed to load dependencies"
					description={error.message}
				/>
			) : !isLoading && edges.length === 0 ? (
				<List.EmptyView
					title="No dependencies"
					description={`${atom} has no resolved dependencies.`}
				/>
			) : null}

			{DEP_SECTIONS.map(({ type, title }) => {
				const sectionEdges = edges.filter((edge) => edge.type === type);
				if (sectionEdges.length === 0) return null;
				return (
					<List.Section
						key={type}
						title={title}
						subtitle={`${sectionEdges.length}`}
					>
						{sectionEdges.map((edge) => (
							<DepItem
								key={`${edge.from}>${edge.to}>${edge.type}`}
								edge={edge}
								rootAtom={rootAtom}
							/>
						))}
					</List.Section>
				);
			})}
		</List>
	);
};

const PortageNewsView = ({
	category,
	name,
}: {
	category: string;
	name: string;
}) => {
	const atom = `${category}/${name}`;
	const {
		data: items,
		isLoading,
		error,
	} = useApi(
		(signal) => getPackagePortageNews(category, name, signal),
		[category, name],
	);

	return (
		<List
			isLoading={isLoading}
			navigationTitle={`Portage News for ${atom}`}
			searchBarPlaceholder="Filter news items..."
		>
			{error ? (
				<List.EmptyView
					title="Failed to load news"
					description={error.message}
				/>
			) : !isLoading && (items?.length ?? 0) === 0 ? (
				<List.EmptyView
					title="No portage news"
					description={`No portage news items mention ${atom}.`}
				/>
			) : null}

			{items?.map((item) => (
				<List.Item
					key={item.id}
					title={item.title}
					subtitle={item.author}
					icon={Icon.Rss}
					accessories={[{ text: item.posted }]}
					actions={
						<ActionPanel>
							<Action.CopyToClipboard title="Copy Title" content={item.title} />
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
};
