import { Icon } from "@vicinae/api";
import { searchHomeManagerOptions } from "./api";
import { HomeManagerOptionListItem } from "./components";
import GenericCommand from "./generic-command";

export default function Command() {
  return (
    <GenericCommand
      searchFunction={searchHomeManagerOptions}
      errorMessage="Failed to search Home-Manager options. Please try again."
      placeholder="Search Home-Manager options..."
      emptyIcon={Icon.Gear}
      emptyTitle="Search Home-Manager Options"
      emptyDescription="Type in the search bar to find Home-Manager options"
      renderItems={(options) =>
        options.map((option) => <HomeManagerOptionListItem key={option.title} option={option} />)
      }
    />
  );
}
