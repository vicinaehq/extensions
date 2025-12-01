import { Icon } from "@vicinae/api";
import { searchNixFlakes } from "./api";
import { FlakeListItem } from "./components";
import GenericCommand from "./generic-command";

export default function Command() {
  return (
    <GenericCommand
      searchFunction={searchNixFlakes}
      errorMessage="Failed to search Nix flake packages. Please try again."
      placeholder="Search Nix flake packages..."
      emptyIcon={Icon.Box}
      emptyTitle="Search Nix Flake Packages"
      emptyDescription="Type in the search bar to find Nix flake packages"
      renderItems={(flakes) =>
        flakes.map((flake) => <FlakeListItem key={`${flake.package_attr_name}-${flake.revision}`} flake={flake} />)
      }
    />
  );
}
