import { Icon } from "@vicinae/api";
import { searchNixOptions } from "./api";
import { OptionListItem } from "./components";
import GenericCommand from "./generic-command";

export default function Command() {
  return (
    <GenericCommand
      searchFunction={searchNixOptions}
      errorMessage="Failed to search Nix options. Please try again."
      placeholder="Search Nix options..."
      emptyIcon={Icon.Gear}
      emptyTitle="Search Nix Options"
      emptyDescription="Type in the search bar to find Nix options"
      renderItems={(options) => options.map((option) => <OptionListItem key={option.option_name} option={option} />)}
    />
  );
}
