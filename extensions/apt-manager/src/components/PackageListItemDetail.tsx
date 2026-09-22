import { Color, List } from "@vicinae/api";
import { useEffect, useState } from "react";
import {
	type AptPackage,
	type PackageInfo,
	fetchPackageInfo,
} from "../lib/apt";
import {
	type FlathubApp,
	buildDetailMarkdown,
	formatInstalls,
} from "../lib/flathub";
import { useAppDetail } from "../lib/useAppDetail";

export function AptAppDetail({
	pkg,
	enabled,
}: {
	pkg: AptPackage;
	enabled: boolean;
}) {
	const [info, setInfo] = useState<PackageInfo | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		setInfo(null);
		setLoading(true);
		fetchPackageInfo(pkg.name)
			.then((value) => {
				if (cancelled) return;
				setInfo(value);
				setLoading(false);
			})
			.catch(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [pkg.name, enabled]);

	const first = info?.paragraphs[0] ?? {};
  const field = (key: string): string | undefined => first[key]?.[0];


	const statusParts: string[] = [];
	if (pkg.flags.installed) statusParts.push("installed");
	if (pkg.flags.upgradable) statusParts.push(`upgradable to ${pkg.version}`);

	let size: string | null = null;
	const sizeKb = Number.parseInt(field("Installed-Size") ?? "0", 10);
	if (sizeKb > 0) size = `${(sizeKb / 1024).toFixed(1)} MB`;

	return (
		<List.Item.Detail
			isLoading={loading}
			metadata={
        <List.Item.Detail.Metadata>
         	<List.Item.Detail.Metadata.Label
						title="Package"
						text={field("Package") ?? pkg.version}
					/>
					{statusParts.length > 0 && (
						<List.Item.Detail.Metadata.Label
							title="Status"
							text={statusParts.join(", ")}
						/>
					)}
					<List.Item.Detail.Metadata.Label
						title="Version"
						text={field("Version") ?? pkg.version}
          />
          {field("Priority") && (
						<List.Item.Detail.Metadata.Label
							title="Priority"
							text={field("Priority")!}
						/>
					)}
					{field("Section") && (
						<List.Item.Detail.Metadata.Label
							title="Section"
							text={field("Section")!}
						/>
          )}
					{size && <List.Item.Detail.Metadata.Label title="Size" text={size} />}
					{field("Maintainer") && (
						<List.Item.Detail.Metadata.Label
							title="Maintainer"
							text={field("Maintainer")!}
						/>
          )}
					{field("Depends") && (
						<List.Item.Detail.Metadata.TagList
              title="Depends">
              {field("Depends")?.split(",").map((lib, index) => (
                <List.Item.Detail.Metadata.TagList.Item
                  key={index}
                  text={lib}
                  color={Color.Blue}
                />
              ))}
            </List.Item.Detail.Metadata.TagList>
						)}
          {field("Homepage") && (
						<List.Item.Detail.Metadata.Link
              title="Homepage"
							target={field('Homepage')!}
							text={field('Package')!}
						/>
          )}
				</List.Item.Detail.Metadata>
			}

		/>
	);
}

export function FlathubAppDetail({
	app,
	enabled,
}: {
	app: FlathubApp;
	enabled: boolean;
}) {
	const { data: fullApp, isLoading } = useAppDetail(app.app_id, enabled);

	const displayApp = fullApp || app;
	const screenshots = displayApp.screenshots || [];
	const latestRelease = displayApp.releases?.[0];

	const markdown = isLoading
		? `# ${app.app_id}\n\n_Loading…_`
		: buildDetailMarkdown(screenshots, app, displayApp);

	return (
		<List.Item.Detail
			isLoading={isLoading}
			markdown={markdown}
			metadata={
				<List.Item.Detail.Metadata>
					{displayApp.summary && (
						<List.Item.Detail.Metadata.Label
							title="Tagline"
							text={displayApp.summary}
						/>
					)}
					{displayApp.developer_name && (
						<List.Item.Detail.Metadata.Label
							title="Developer"
							text={displayApp.developer_name}
						/>
					)}
					{displayApp.installs_last_month && (
						<List.Item.Detail.Metadata.Label
							title="Installs"
							text={formatInstalls(displayApp.installs_last_month)}
						/>
					)}
					{latestRelease && (
						<List.Item.Detail.Metadata.Label
							title="Version"
							text={latestRelease.version}
						/>
					)}
				</List.Item.Detail.Metadata>
			}
		/>
	);
}
