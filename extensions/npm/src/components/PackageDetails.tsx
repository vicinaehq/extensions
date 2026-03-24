import { List } from "@vicinae/api";
import type { NPMPackage } from "../hooks/useNpmSeach";

export const PackageDetails = ({ pkg }: { pkg: NPMPackage }) => {
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
