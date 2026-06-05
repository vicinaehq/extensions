import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import { useState } from "react";
import { PackageDetails } from "./components/PackageDetails";
import { useNpmSeach, type NPMPackage } from "./hooks/useNpmSeach";

export default function NpmSearch() {
  const [query, setQuery] = useState("");
  const [isShowingDetails, setIsShowingDetails] = useState(false);

  let { isLoading, data: npmPackages } = useNpmSeach(query);

  return (
    <List
      searchBarPlaceholder="Search npm packages..."
      isLoading={isLoading}
      onSearchTextChange={setQuery}
      searchText={query}
      isShowingDetail={isShowingDetails}
    >
      {npmPackages.length === 0 && query.length > 0 && !isLoading && (
        <List.EmptyView title="No packages found" />
      )}
      {npmPackages.length === 0 && query.length === 0 && !isLoading && (
        <List.EmptyView title="Start typing to search for npm packages" />
      )}
      <List.Section title="Search results">
        {npmPackages.map((pkg) => (
          <PackageListItem
            key={pkg.name}
            pkg={pkg}
            onToggleDetails={() => setIsShowingDetails((prev) => !prev)}
          />
        ))}
      </List.Section>
    </List>
  );
}

const PackageListItem = ({
  pkg,
  onToggleDetails,
}: {
  pkg: NPMPackage;
  onToggleDetails: () => void;
}) => {
  return (
    <List.Item
      key={pkg.name}
      title={pkg.name}
      detail={<PackageDetails pkg={pkg} />}
      subtitle={pkg.description}
      accessories={[
        {
          icon: Icon.Download,
          text: pkg.weeklyDownloads?.toLocaleString(),
        },
        {
          text: {
            color: Color.Blue,
            value: pkg.version,
          },
        },
      ]}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy package name"
            content={pkg.name}
          />
          <Action title="Toggle Details" onAction={onToggleDetails} />
        </ActionPanel>
      }
    />
  );
};
