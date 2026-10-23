import { Color, List } from "@raycast/api";
import { Crate, CrateDetails } from "./api";
import { formatDate } from "./format";
import { branchIcon, calendarIcon, clockIcon, downloadIcon, tagIcon, trendIcon } from "./icons";

/** Shorten `https://docs.rs/serde` to `docs.rs` for link values. */
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function CrateDetail({ crate, details }: { crate: Crate; details?: CrateDetails }) {
  const version = crate.maxStableVersion || crate.version;
  const hasLinks = !!(crate.documentationURL || crate.homepageURL || crate.repositoryURL);

  return (
    <List.Item.Detail
      markdown={`# ${crate.name}\n\n${crate.description ?? "_No description provided._"}\n\n\`\`\`toml\n${crate.name} = "${version}"\n\`\`\``}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Version"
            text={version}
            icon={tagIcon(Color.SecondaryText)}
          />
          <List.Item.Detail.Metadata.Label
            title="Downloads"
            text={crate.downloads.toLocaleString()}
            icon={downloadIcon(Color.SecondaryText)}
          />
          <List.Item.Detail.Metadata.Label
            title="Recent (90d)"
            text={crate.recentDownloads.toLocaleString()}
            icon={trendIcon(Color.SecondaryText)}
          />
          <List.Item.Detail.Metadata.Label
            title="Releases"
            text={String(crate.numVersions)}
            icon={branchIcon(Color.SecondaryText)}
          />
          {crate.yanked && (
            <List.Item.Detail.Metadata.Label
              title="Status"
              text={{ value: "Yanked", color: Color.Red }}
            />
          )}
          <List.Item.Detail.Metadata.Separator />
          {crate.updatedAt && (
            <List.Item.Detail.Metadata.Label
              title="Updated"
              text={formatDate(crate.updatedAt)}
              icon={clockIcon(Color.SecondaryText)}
            />
          )}
          {crate.createdAt && (
            <List.Item.Detail.Metadata.Label
              title="Created"
              text={formatDate(crate.createdAt)}
              icon={calendarIcon(Color.SecondaryText)}
            />
          )}
          {details && details.categories.length > 0 && (
            <>
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.TagList title="Categories">
                {details.categories.map((category) => (
                  <List.Item.Detail.Metadata.TagList.Item key={category} text={category} />
                ))}
              </List.Item.Detail.Metadata.TagList>
            </>
          )}
          {details && details.keywords.length > 0 && (
            <List.Item.Detail.Metadata.TagList title="Keywords">
              {details.keywords.map((keyword) => (
                <List.Item.Detail.Metadata.TagList.Item key={keyword} text={keyword} />
              ))}
            </List.Item.Detail.Metadata.TagList>
          )}
          {hasLinks && <List.Item.Detail.Metadata.Separator />}
          {crate.documentationURL && (
            <List.Item.Detail.Metadata.Link
              title="Documentation"
              target={crate.documentationURL}
              text={hostOf(crate.documentationURL)}
            />
          )}
          {crate.repositoryURL && (
            <List.Item.Detail.Metadata.Link
              title="Repository"
              target={crate.repositoryURL}
              text={hostOf(crate.repositoryURL)}
            />
          )}
          {crate.homepageURL && (
            <List.Item.Detail.Metadata.Link
              title="Homepage"
              target={crate.homepageURL}
              text={hostOf(crate.homepageURL)}
            />
          )}
          <List.Item.Detail.Metadata.Link
            title="crates.io"
            target={`https://crates.io/crates/${crate.name}`}
            text="View crate"
          />
        </List.Item.Detail.Metadata>
      }
    />
  );
}
