import { Icon } from "@vicinae/api";
import { searchNixPackages } from "./api";
import { PackageListItem } from "./components";
import GenericCommand from "./generic-command";

export default function Command() {
  return (
    <GenericCommand
      searchFunction={searchNixPackages}
      errorMessage="Failed to search Nix packages. Please try again."
      placeholder="Search Nix packages..."
      emptyIcon={Icon.Box}
      emptyTitle="Search Nix Packages"
      emptyDescription="Type in the search bar to find Nix packages"
      renderItems={(packages) =>
        packages.map((pkg) => <PackageListItem key={`${pkg.package_attr_name}-${pkg.package_pversion}`} pkg={pkg} />)
      }
    />
  );
}
