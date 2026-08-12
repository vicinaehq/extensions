import {
	Action,
	ActionPanel,
	Color,
	Detail,
	Icon,
	Keyboard,
	List,
} from "@vicinae/api";
import { type Glsa, getGlsa } from "./api";
import { useApi } from "./hooks";

const severityColor = (severity: string): Color => {
	switch (severity) {
		case "critical":
		case "high":
			return Color.Red;
		case "normal":
			return Color.Orange;
		case "low":
			return Color.Yellow;
		default:
			return Color.SecondaryText;
	}
};

const GlsaDetailView = ({ glsa }: { glsa: Glsa }) => {
	const markdown = [
		`# ${glsa.title}`,
		glsa.summary,
		`## Description\n\n${glsa.description}`,
		`## Impact\n\n${glsa.impact}`,
		`## Resolution\n\n\`\`\`\n${glsa.resolution.trim()}\n\`\`\``,
	].join("\n\n");

	return (
		<Detail
			navigationTitle={glsa.glsaId}
			markdown={markdown}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label title="GLSA" text={glsa.glsaId} />
					<Detail.Metadata.Label
						title="Severity"
						text={{ value: glsa.severity, color: severityColor(glsa.severity) }}
					/>
					<Detail.Metadata.Label title="Access" text={glsa.access} />
					<Detail.Metadata.Label
						title="Published"
						text={new Date(glsa.publishedAt).toDateString()}
					/>
					{glsa.affectedPackages.length > 0 ? (
						<Detail.Metadata.TagList title="Affected Packages">
							{glsa.affectedPackages.map((pkg) => (
								<Detail.Metadata.TagList.Item
									key={pkg}
									text={pkg}
									color={Color.Orange}
								/>
							))}
						</Detail.Metadata.TagList>
					) : null}
					{glsa.cves.length > 0 ? (
						<Detail.Metadata.TagList title="CVEs">
							{glsa.cves.map((cve) => (
								<Detail.Metadata.TagList.Item key={cve} text={cve} />
							))}
						</Detail.Metadata.TagList>
					) : null}
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
					<Action.OpenInBrowser
						title="Open on Security.gentoo.org"
						icon={Icon.Globe01}
						url={glsa.url}
					/>
					<Action.CopyToClipboard title="Copy GLSA ID" content={glsa.glsaId} />
					<Action.CopyToClipboard title="Copy Link" content={glsa.url} />
				</ActionPanel>
			}
		/>
	);
};

export default function SecurityAdvisories() {
	const {
		data: advisories,
		isLoading,
		error,
	} = useApi((signal) => getGlsa(signal), []);

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search advisories...">
			{error ? (
				<List.EmptyView
					title="Failed to load advisories"
					description={error.message}
				/>
			) : !isLoading && (advisories?.length ?? 0) === 0 ? (
				<List.EmptyView
					title="No advisories"
					description="No security advisories are currently listed."
					icon={Icon.Warning}
				/>
			) : null}

			<List.Section
				title="Security Advisories"
				subtitle={`${advisories?.length ?? 0}`}
			>
				{advisories?.map((glsa) => (
					<List.Item
						key={glsa.id}
						title={glsa.title}
						subtitle={glsa.glsaId}
						icon={Icon.Warning}
						keywords={glsa.affectedPackages}
						accessories={[
							{
								tag: {
									value: glsa.severity,
									color: severityColor(glsa.severity),
								},
							},
							{ text: new Date(glsa.publishedAt).toDateString() },
						]}
						actions={
							<ActionPanel>
								<Action.Push
									title="Show Advisory"
									icon={Icon.Text}
									target={<GlsaDetailView glsa={glsa} />}
								/>
								<Action.OpenInBrowser
									title="Open on Security.gentoo.org"
									icon={Icon.Globe01}
									url={glsa.url}
									shortcut={
										Keyboard.Shortcut.Common.Open as Keyboard.Shortcut.Common
									}
								/>
								<Action.CopyToClipboard
									title="Copy GLSA ID"
									content={glsa.glsaId}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
