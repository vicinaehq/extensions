import React from "react";
import { exec } from "child_process";
import { Action, ActionPanel, Color, Detail, getPreferenceValues, Icon, List } from "@vicinae/api";
import { cleanText } from "./api";
import { copyToClipboard, relativeTime } from "./utils";
import type {
  NixPackage,
  NixOption,
  NixFlake,
  HomeManagerOption,
  GitHubIssue,
  GitHubPullRequest,
  GitHubLabel,
  GitHubUser,
} from "./types";
import { useGithubPullRequestDetail } from "./hooks";

function OptionActions({
  name,
  description,
  defaultValue,
  sourceUrl,
}: {
  name: string;
  description: string;
  defaultValue?: string;
  sourceUrl?: string;
}) {
  return (
    <ActionPanel>
      {sourceUrl && (
        <Action.OpenInBrowser
          title="View Source Code"
          icon={Icon.Code}
          url={sourceUrl}
          shortcut={{ modifiers: ["ctrl"], key: "s" }}
        />
      )}
      <Action
        title="Copy Option Name"
        icon={Icon.Clipboard}
        onAction={async () => await copyToClipboard(name, "Option name")}
        shortcut={{ modifiers: ["ctrl"], key: "n" }}
      />
      <Action
        title="Copy Description"
        icon={Icon.Clipboard}
        onAction={async () => await copyToClipboard(description, "Description")}
        shortcut={{ modifiers: ["ctrl"], key: "d" }}
      />
      {defaultValue && (
        <Action
          title="Copy Default Value"
          icon={Icon.Clipboard}
          onAction={async () => await copyToClipboard(defaultValue, "Default value")}
          shortcut={{ modifiers: ["ctrl"], key: "v" }}
        />
      )}
    </ActionPanel>
  );
}

function PackageMetadata({
  version,
  platforms,
  maintainers,
  licenses,
}: {
  version: string;
  platforms: string[];
  maintainers: string;
  licenses: string;
}) {
  const hasPlatforms = platforms.length > 0;
  const hasMaintainers = maintainers.trim();
  const hasLicenses = licenses.trim();

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Version" text={version} />
      {hasPlatforms && (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Platforms" text={platforms.join(", ")} />
        </>
      )}
      {hasMaintainers && (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Maintainers" text={maintainers} />
        </>
      )}
      {hasLicenses && (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Licenses" text={licenses} />
        </>
      )}
    </List.Item.Detail.Metadata>
  );
}

function FlakeMetadata({
  flakeName,
  repo,
  packageName,
  platforms,
  maintainers,
  licenses,
}: {
  flakeName: string;
  repo: string;
  packageName: string;
  platforms: string[];
  maintainers: string;
  licenses: string;
}) {
  const hasPlatforms = platforms.length > 0;
  const hasMaintainers = maintainers.trim();
  const hasLicenses = licenses.trim();

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Flake" text={flakeName} />
      <List.Item.Detail.Metadata.Separator />
      <List.Item.Detail.Metadata.Label title="Repository" text={repo} />
      <List.Item.Detail.Metadata.Separator />
      <List.Item.Detail.Metadata.Label title="Package" text={packageName} />
      {hasPlatforms && (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Platforms" text={platforms.join(", ")} />
        </>
      )}
      {hasMaintainers && (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Maintainers" text={maintainers} />
        </>
      )}
      {hasLicenses && (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Licenses" text={licenses} />
        </>
      )}
    </List.Item.Detail.Metadata>
  );
}

export function PackageListItem({ pkg }: { pkg: NixPackage }) {
  const openHomepage = () => {
    if (pkg.package_homepage.length > 0) {
      exec(`xdg-open "${pkg.package_homepage[0]}"`);
    }
  };

  // Extract source URL from package position
  const package_position = pkg.package_position;
  const parts = package_position.split(":");
  const line = parts[parts.length - 1];
  const file_path = parts.slice(0, -1).join(":");
  const cleanFilePath = file_path.startsWith("/") ? file_path.slice(1) : file_path;
  const sourceUrl = `https://github.com/NixOS/nixpkgs/blob/master/${cleanFilePath}#L${line}`;

  const description = pkg.package_description || "No description available.";
  const trimmedDescription = cleanText(description);

  return (
    <List.Item
      key={`${pkg.package_attr_name}-${pkg.package_pversion}`}
      title={pkg.package_attr_name}
      accessories={[{ text: `v${pkg.package_pversion}` }]}
      detail={
        <List.Item.Detail
          markdown={`# ${pkg.package_attr_name}\n\n${cleanText(pkg.package_longDescription || trimmedDescription)}`}
          metadata={
            <PackageMetadata
              version={pkg.package_pversion}
              platforms={pkg.package_platforms}
              maintainers={pkg.package_maintainers_set.join(", ")}
              licenses={pkg.package_license_set.join(", ")}
            />
          }
        />
      }
      actions={
        <ActionPanel>
          <Action
            title="Open Homepage"
            icon={Icon.Globe}
            onAction={openHomepage}
            shortcut={{ modifiers: ["ctrl"], key: "o" }}
          />
          {sourceUrl && (
            <Action.OpenInBrowser
              title="View Source Code"
              icon={Icon.Code}
              url={sourceUrl}
              shortcut={{ modifiers: ["ctrl"], key: "s" }}
            />
          )}
          <Action
            title="Copy Package Name"
            icon={Icon.Clipboard}
            onAction={async () => await copyToClipboard(pkg.package_attr_name, "Package name")}
            shortcut={{ modifiers: ["ctrl"], key: "n" }}
          />
          <Action
            title="Copy Description"
            icon={Icon.Clipboard}
            onAction={async () => await copyToClipboard(trimmedDescription, "Description")}
            shortcut={{ modifiers: ["ctrl"], key: "d" }}
          />
        </ActionPanel>
      }
    />
  );
}

export function OptionListItem({ option }: { option: NixOption }) {
  const description = option.option_description || "No description available.";
  const trimmedDescription = cleanText(description);

  return (
    <List.Item
      key={option.option_name}
      title={option.option_name}
      detail={
        <List.Item.Detail
          markdown={`# ${option.option_name}\n\n${trimmedDescription}${option.option_example ? `\n\n**Example:**\n\`\`\`\n${cleanText(option.option_example)}\n\`\`\`` : ""}`}
          metadata={(() => {
            const metadataItems: React.JSX.Element[] = [];
            let itemCount = 0;

            if (option.option_type && option.option_type.trim()) {
              metadataItems.push(<List.Item.Detail.Metadata.Label key="type" title="Type" text={option.option_type} />);
              itemCount++;
            }

            if (option.option_default && option.option_default.trim()) {
              if (itemCount > 0) metadataItems.push(<List.Item.Detail.Metadata.Separator key={`sep-${itemCount}`} />);
              metadataItems.push(
                <List.Item.Detail.Metadata.Label key="default" title="Default" text={option.option_default} />,
              );
              itemCount++;
            }

            if (option.option_flake && option.option_flake.trim()) {
              if (itemCount > 0) metadataItems.push(<List.Item.Detail.Metadata.Separator key={`sep-${itemCount}`} />);
              metadataItems.push(
                <List.Item.Detail.Metadata.Label key="flake" title="Flake" text={option.option_flake} />,
              );
              itemCount++;
            }

            return <List.Item.Detail.Metadata>{metadataItems}</List.Item.Detail.Metadata>;
          })()}
        />
      }
      actions={
        <OptionActions
          name={option.option_name}
          description={trimmedDescription}
          defaultValue={option.option_default}
          sourceUrl={
            option.option_source ? `https://github.com/NixOS/nixpkgs/blob/master/${option.option_source}` : undefined
          }
        />
      }
    />
  );
}

export function FlakeListItem({ flake }: { flake: NixFlake }) {
  // Determine source URL and repository info
  let sourceUrl: string;
  let owner: string;
  let repo: string;
  let flakeName: string;

  if (flake.flake_resolved) {
    // Parse owner/repo from URL like https://github.com/owner/repo or https://codeberg.org/owner/repo
    const urlMatch = flake.flake_resolved.url.match(/https?:\/\/[^/]+\/([^/]+)\/(.+)/);
    if (urlMatch) {
      owner = urlMatch[1];
      repo = urlMatch[2].replace(/\.git$/, ""); // Remove .git suffix if present
    } else {
      owner = "unknown";
      repo = "unknown";
    }
    sourceUrl = flake.flake_resolved.url;
    flakeName = flake.flake_name;
  } else {
    // Fallback for packages that might be flakes but aren't indexed as such
    sourceUrl =
      flake.package_homepage?.[0] ||
      `https://github.com/NixOS/nixpkgs/blob/master/${flake.package_position?.split(":")[0] || ""}`;
    owner = "NixOS";
    repo = "nixpkgs";
    flakeName = flake.package_attr_name;
  }

  const description = flake.flake_description || flake.package_description || "Nix package";

  return (
    <List.Item
      key={`${flake.package_attr_name}-${flake.revision}`}
      title={flake.package_attr_name}
      accessories={[{ text: `v${flake.revision.slice(0, 7)}` }]}
      detail={
        <List.Item.Detail
          markdown={`# ${flake.package_attr_name}\n\n${cleanText(description)}`}
          metadata={
            <FlakeMetadata
              flakeName={flakeName}
              repo={`${owner}/${repo}`}
              packageName={flake.package_pname}
              platforms={flake.package_platforms}
              maintainers={flake.package_maintainers_set.join(", ")}
              licenses={flake.package_license_set.join(", ")}
            />
          }
        />
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Open Repository"
            icon={Icon.Globe}
            url={sourceUrl}
            shortcut={{ modifiers: ["ctrl"], key: "o" }}
          />
          <Action
            title="Copy Flake Name"
            icon={Icon.Clipboard}
            onAction={async () => await copyToClipboard(flakeName, "Flake name")}
            shortcut={{ modifiers: ["ctrl"], key: "n" }}
          />
          <Action
            title="Copy Package Name"
            icon={Icon.Clipboard}
            onAction={async () => await copyToClipboard(flake.package_attr_name, "Package name")}
            shortcut={{ modifiers: ["ctrl"], key: "p" }}
          />
          <Action
            title="Copy Description"
            icon={Icon.Clipboard}
            onAction={async () => await copyToClipboard(description, "Description")}
            shortcut={{ modifiers: ["ctrl"], key: "d" }}
          />
        </ActionPanel>
      }
    />
  );
}

export function HomeManagerOptionListItem({ option }: { option: HomeManagerOption }) {
  const title = typeof option.title === "string" ? option.title : "";
  const description = typeof option.description === "string" ? option.description : "";
  const type = typeof option.type === "string" ? option.type : "";
  const defaultValue = typeof option.default === "string" ? option.default : undefined;
  const example = typeof option.example === "string" ? option.example : undefined;

  const sourceUrl =
    option.declarations &&
    Array.isArray(option.declarations) &&
    option.declarations.length > 0 &&
    option.declarations[0]?.url
      ? option.declarations[0].url
      : undefined;

  return (
    <List.Item
      key={title}
      title={title}
      detail={
        <List.Item.Detail
          markdown={`# ${title}\n\n${cleanText(description)}${example ? `\n\n**Example:**\n\`\`\`\n${cleanText(example)}\n\`\`\`` : ""}`}
          metadata={(() => {
            const metadataItems: React.JSX.Element[] = [];
            let itemCount = 0;

            if (type && type.trim()) {
              metadataItems.push(<List.Item.Detail.Metadata.Label key="type" title="Type" text={type} />);
              itemCount++;
            }

            if (defaultValue && defaultValue.trim()) {
              if (itemCount > 0) metadataItems.push(<List.Item.Detail.Metadata.Separator key={`sep-${itemCount}`} />);
              metadataItems.push(<List.Item.Detail.Metadata.Label key="default" title="Default" text={defaultValue} />);
              itemCount++;
            }

            return <List.Item.Detail.Metadata>{metadataItems}</List.Item.Detail.Metadata>;
          })()}
        />
      }
      actions={
        <OptionActions name={title} description={description} defaultValue={defaultValue} sourceUrl={sourceUrl} />
      }
    />
  );
}

export function PullRequestListItem({ pr, onSelect }: { pr: GitHubIssue; onSelect: () => void }) {
  const statusIcon =
    pr.state === "open"
      ? { source: "../assets/PROpen.svg", tintColor: Color.Green }
      : pr.pull_request?.merged_at
        ? { source: "../assets/PRMerge.svg", tintColor: Color.Purple }
        : { source: "../assets/PRClosed.svg", tintColor: Color.Red };

  return (
    <List.Item
      key={pr.number}
      title={pr.title}
      subtitle={`#${pr.number} • ${pr.user?.login ?? "unknown"}`}
      icon={statusIcon}
      accessories={[{ text: `Updated ${relativeTime(pr.updated_at)}` }]}
      actions={
        <ActionPanel>
          <Action title="View Details" icon={Icon.Sidebar} onAction={onSelect} />
          <Action.OpenInBrowser icon={Icon.Globe} title="Open Pull Request" url={pr.html_url} />
          <Action.CopyToClipboard
            title="Copy Pull Request Number"
            content={pr.number.toString()}
            onCopy={() => copyToClipboard(pr.number.toString(), "pull request number")}
            shortcut={{ modifiers: ["ctrl"], key: "c" }}
          />
        </ActionPanel>
      }
    />
  );
}

export function PullRequestDetail({ pr }: { pr: GitHubPullRequest }) {
  const statusIcon =
    pr.state === "open"
      ? { source: "../assets/PROpen.svg", tintColor: Color.Green }
      : pr.merged_at
        ? { source: "../assets/PRMerge.svg", tintColor: Color.Purple }
        : { source: "../assets/PRClosed.svg", tintColor: Color.Red };

  return (
    <Detail
      navigationTitle={`Pull Request #${pr.number}`}
      markdown={`\`NixOS:${pr.base?.ref ?? "unknown"}\` ← \`${pr.user?.login ?? "unknown"}:${pr.head?.ref ?? "unknown"}\`\n\n*Created at: ${new Date(pr.created_at).toLocaleString()}, Updated ${relativeTime(pr.updated_at)}*\n\n# ${pr.title}\n\n${pr.body || "_No description provided._"}`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Link
            title="Author"
            target={`https://github.com/${pr.user?.login ?? "unknown"}`}
            text={pr.user?.login ?? "unknown"}
          />
          <Detail.Metadata.Label
            title="Status"
            text={pr.state === "open" ? "Open" : pr.merged_at ? "Merged" : "Closed"}
            icon={statusIcon}
          />
          {pr.availableOn.length > 0 ? (
            <Detail.Metadata.TagList title="Available on">
              {pr.availableOn.map((l: string) => (
                <Detail.Metadata.TagList.Item text={l} color={Color.PrimaryText} />
              ))}
            </Detail.Metadata.TagList>
          ) : null}
          {pr.labels.length > 0 ? (
            <Detail.Metadata.TagList title="Labels">
              {pr.labels.map((l: GitHubLabel) => (
                <Detail.Metadata.TagList.Item key={l.id} text={l.name} color={l.color} />
              ))}
            </Detail.Metadata.TagList>
          ) : null}
          {pr.requested_reviewers.length > 0 ? (
            <Detail.Metadata.TagList title="Reviewers">
              {pr.requested_reviewers.map((r: GitHubUser) => (
                <Detail.Metadata.TagList.Item key={r.login} text={r.login} color={Color.PrimaryText} />
              ))}
            </Detail.Metadata.TagList>
          ) : (
            <Detail.Metadata.Label title="Reviewers" text="No reviewers" />
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser icon={Icon.Globe} title="Open Pull Request" url={pr.html_url} />
          <Action.CopyToClipboard
            title="Copy Pull Request Number"
            content={pr.number.toString()}
            onCopy={() => copyToClipboard(pr.number.toString(), "pull request number")}
          />
        </ActionPanel>
      }
    />
  );
}
export function PullRequestDetailView({ prNumber }: { prNumber: number }) {
  const { githubToken } = getPreferenceValues<{ githubToken?: string }>();
  const { pr, loading, error } = useGithubPullRequestDetail(prNumber, githubToken);

  if (!githubToken) {
    return (
      <Detail
        markdown={`# Missing GitHub Token\n\nPlease set your GitHub token in the extension preferences to search NixOS Packages Pull Requests.`}
      />
    );
  }

  if (loading) return <List isLoading={true} />;

  if (error) {
    return <Detail markdown={`# Error Loading Pull Request\n\n${error}`} />;
  }

  if (!pr) return <List isLoading={true} />;

  return <PullRequestDetail pr={pr} />;
}
