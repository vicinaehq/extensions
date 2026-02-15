import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import { useState } from "react";
import { useNpmSeach, type NPMPackage } from "./hooks/useNpmSeach";
import { NpmErrorDetails } from "./components/NpmErrorDetails";
import { NpmTerminalUsageDetails } from "./components/NpmTerminalUsageDetails";
import { useInstallPackages } from "./hooks/useInstallPackages";

export default function NpmInstall(props: {
  arguments?: {
    pwd: string;
  };
}) {
  const pwd = props?.arguments?.pwd;
  if (!pwd) return <NpmTerminalUsageDetails />;
  const [query, setQuery] = useState("");
  const [isShowingDetails, setIsShowingDetails] = useState(false);
  const {
    installPackages,
    project,
    onSelectDependency,
    selectedDependencies,
    error,
    clearError,
    npmCommand,
  } = useInstallPackages(pwd);
  const { loading, npmPackages } = useNpmSeach(query, project);
  const isSelectedDependency = (pkgName: string) =>
    selectedDependencies.some((selected) => selected.name === pkgName);

  if (error) {
    return <NpmErrorDetails error={error} clear={clearError} />;
  }

  return (
    <List
      searchBarPlaceholder="Search npm packages..."
      isLoading={loading}
      onSearchTextChange={setQuery}
      searchText={query}
      isShowingDetail={isShowingDetails}
    >
      {npmPackages.length === 0 && query.length > 0 && !loading && (
        <List.EmptyView title="No packages found" />
      )}
      {npmPackages.length === 0 && query.length === 0 && !loading && (
        <List.EmptyView title="Start typing to search for npm packages" />
      )}
      {selectedDependencies.length > 0 && (
        <List.Section title="Selected packages">
          {selectedDependencies.map((pkg) => (
            <PackageListItem
              key={pkg.name}
              pkg={pkg}
              npmCommand={npmCommand}
              selected={isSelectedDependency(pkg.name)}
              onSelect={onSelectDependency}
              onInstall={() => installPackages(false)}
              onInstallDev={() => installPackages(true)}
              onToggleDetails={() => setIsShowingDetails((prev) => !prev)}
            />
          ))}
        </List.Section>
      )}
      <List.Section title="Search results">
        {npmPackages
          .filter((pkg) => !pkg.installed && !isSelectedDependency(pkg.name))
          .map((pkg) => (
            <PackageListItem
              key={pkg.name}
              pkg={pkg}
              selected={isSelectedDependency(pkg.name)}
              onSelect={onSelectDependency}
              onInstall={() => installPackages(false)}
              onInstallDev={() => installPackages(true)}
              onToggleDetails={() => setIsShowingDetails((prev) => !prev)}
              npmCommand={npmCommand}
            />
          ))}
      </List.Section>
    </List>
  );
}

const PackageListItem = ({
  pkg,
  selected,
  onSelect,
  onInstall,
  onInstallDev,
  onToggleDetails,
  npmCommand,
}: {
  pkg: NPMPackage;
  selected: boolean;
  onSelect: (pkg: NPMPackage) => void;
  onToggleDetails: () => void;
  onInstall: () => void;
  onInstallDev: () => void;
  npmCommand: string;
}) => {
  return (
    <List.Item
      key={pkg.name}
      title={pkg.name}
      detail={<PackageDetails pkg={pkg} />}
      subtitle={pkg.description}
      icon={selected ? Icon.CheckCircle : Icon.Circle}
      accessories={[
        {
          text: {
            color: Color.Blue,
            value: pkg.version,
          },
        },
      ]}
      actions={
        <ActionPanel>
          <Action
            title={selected ? "Deselect" : "Select"}
            icon={selected ? Icon.Circle : Icon.CheckCircle}
            onAction={() => onSelect(pkg)}
          />
          <Action
            title="Open details"
            icon={Icon.AppWindowSidebarRight}
            onAction={onToggleDetails}
          />
          <Action title="Install" icon={Icon.Download} onAction={onInstall} />
          <Action
            title="Install dev"
            icon={Icon.Download}
            onAction={onInstallDev}
          />
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy npm install command"
              content={npmCommand}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
};

const PackageDetails = ({ pkg }: { pkg: NPMPackage }) => {
  return (
    <List.Item.Detail
      markdown={pkg.description}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Package name"
            text={pkg.name}
          />
          <List.Item.Detail.Metadata.Label title="Version" text={pkg.version} />
          <List.Item.Detail.Metadata.Label
            title="Weekly Downloads"
            text={pkg.weeklyDownloads?.toLocaleString()}
          />
          {pkg.license && (
            <List.Item.Detail.Metadata.Label
              title="License"
              text={pkg.license}
            />
          )}
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="Publisher name"
            text={pkg.publisher.username}
          />
          <List.Item.Detail.Metadata.Label
            title="Publisher email"
            text={pkg.publisher.email}
          />
        </List.Item.Detail.Metadata>
      }
    />
  );
};
