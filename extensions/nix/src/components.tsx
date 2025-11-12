import { exec } from "child_process";
import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { cleanText } from "./api";
import { copyToClipboard } from "./utils";
import { PackageItem, OptionItem, FlakeItem, HomeManagerOptionItem } from "./types";

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

export function PackageListItem({ pkg }: { pkg: PackageItem }) {
  const openHomepage = () => {
    if (pkg.homepage) {
      exec(`xdg-open "${pkg.homepage}"`);
    }
  };

  return (
    <List.Item
      key={`${pkg.name}-${pkg.version}`}
      title={pkg.name}
      accessories={[{ text: `v${pkg.version}` }]}
      detail={
        <List.Item.Detail
          markdown={`# ${pkg.name}\n\n${cleanText(pkg.longDescription || pkg.description)}`}
          metadata={
            <PackageMetadata
              version={pkg.version}
              platforms={pkg.platforms}
              maintainers={pkg.maintainers}
              licenses={pkg.licenses}
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
          {pkg.sourceUrl && (
            <Action.OpenInBrowser
              title="View Source Code"
              icon={Icon.Code}
              url={pkg.sourceUrl}
              shortcut={{ modifiers: ["ctrl"], key: "s" }}
            />
          )}
          <Action
            title="Copy Package Name"
            icon={Icon.Clipboard}
            onAction={async () => await copyToClipboard(pkg.name, "Package name")}
            shortcut={{ modifiers: ["ctrl"], key: "n" }}
          />
          <Action
            title="Copy Description"
            icon={Icon.Clipboard}
            onAction={async () => await copyToClipboard(pkg.description, "Description")}
            shortcut={{ modifiers: ["ctrl"], key: "d" }}
          />
        </ActionPanel>
      }
    />
  );
}

export function OptionListItem({ option }: { option: OptionItem }) {
  return (
    <List.Item
      key={option.name}
      title={option.name}
      detail={
        <List.Item.Detail
          markdown={`# ${option.name}\n\n${cleanText(option.description)}${option.example ? `\n\n**Example:**\n\`\`\`\n${cleanText(option.example)}\n\`\`\`` : ""}`}
          metadata={(() => {
            const metadataItems: JSX.Element[] = [];
            let itemCount = 0;

            if (option.type && option.type.trim()) {
              metadataItems.push(<List.Item.Detail.Metadata.Label key="type" title="Type" text={option.type} />);
              itemCount++;
            }

            if (option.default && option.default.trim()) {
              if (itemCount > 0) metadataItems.push(<List.Item.Detail.Metadata.Separator key={`sep-${itemCount}`} />);
              metadataItems.push(
                <List.Item.Detail.Metadata.Label key="default" title="Default" text={option.default} />,
              );
              itemCount++;
            }

            if (option.flake && option.flake.trim()) {
              if (itemCount > 0) metadataItems.push(<List.Item.Detail.Metadata.Separator key={`sep-${itemCount}`} />);
              metadataItems.push(<List.Item.Detail.Metadata.Label key="flake" title="Flake" text={option.flake} />);
              itemCount++;
            }

            return <List.Item.Detail.Metadata>{metadataItems}</List.Item.Detail.Metadata>;
          })()}
        />
      }
      actions={
        <OptionActions
          name={option.name}
          description={option.description}
          defaultValue={option.default}
          sourceUrl={
            option.option_source ? `https://github.com/NixOS/nixpkgs/blob/master/${option.option_source}` : undefined
          }
        />
      }
    />
  );
}

export function FlakeListItem({ flake }: { flake: FlakeItem }) {
  return (
    <List.Item
      key={`${flake.name}-${flake.revision}`}
      title={flake.name}
      accessories={[{ text: `v${flake.revision.slice(0, 7)}` }]}
      detail={
        <List.Item.Detail
          markdown={`# ${flake.name}\n\n${cleanText(flake.description)}`}
          metadata={
            <FlakeMetadata
              flakeName={flake.flakeName}
              repo={`${flake.owner}/${flake.repo}`}
              packageName={flake.pname}
              platforms={flake.platforms}
              maintainers={flake.maintainers}
              licenses={flake.licenses}
            />
          }
        />
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Open Repository"
            icon={Icon.Globe}
            url={flake.sourceUrl}
            shortcut={{ modifiers: ["ctrl"], key: "o" }}
          />
          <Action
            title="Copy Flake Name"
            icon={Icon.Clipboard}
            onAction={async () => await copyToClipboard(flake.flakeName, "Flake name")}
            shortcut={{ modifiers: ["ctrl"], key: "n" }}
          />
          <Action
            title="Copy Package Name"
            icon={Icon.Clipboard}
            onAction={async () => await copyToClipboard(flake.name, "Package name")}
            shortcut={{ modifiers: ["ctrl"], key: "p" }}
          />
          <Action
            title="Copy Description"
            icon={Icon.Clipboard}
            onAction={async () => await copyToClipboard(flake.description, "Description")}
            shortcut={{ modifiers: ["ctrl"], key: "d" }}
          />
        </ActionPanel>
      }
    />
  );
}

export function HomeManagerOptionListItem({ option }: { option: HomeManagerOptionItem }) {
  return (
    <List.Item
      key={option.name}
      title={option.name}
      detail={
        <List.Item.Detail
          markdown={`# ${option.name}\n\n${cleanText(option.description)}${option.example ? `\n\n**Example:**\n\`\`\`\n${cleanText(option.example)}\n\`\`\`` : ""}`}
          metadata={(() => {
            const metadataItems: JSX.Element[] = [];
            let itemCount = 0;

            if (option.type && option.type.trim()) {
              metadataItems.push(<List.Item.Detail.Metadata.Label key="type" title="Type" text={option.type} />);
              itemCount++;
            }

            if (option.default && option.default.trim()) {
              if (itemCount > 0) metadataItems.push(<List.Item.Detail.Metadata.Separator key={`sep-${itemCount}`} />);
              metadataItems.push(
                <List.Item.Detail.Metadata.Label key="default" title="Default" text={option.default} />,
              );
              itemCount++;
            }

            return <List.Item.Detail.Metadata>{metadataItems}</List.Item.Detail.Metadata>;
          })()}
        />
      }
      actions={
        <OptionActions
          name={option.name}
          description={option.description}
          defaultValue={option.default}
          sourceUrl={option.sourceUrl}
        />
      }
    />
  );
}
