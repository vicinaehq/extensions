import { MonitorList } from './monitor-list';

export default function Outputs() {
  return (
    <MonitorList
      command="monitors all"
      sectionTitle="Outputs"
      searchBarPlaceholder="Search outputs..."
      emptyTitle="No Outputs Found"
      emptyDescription="No Hyprland outputs were returned by hyprctl."
    />
  );
}
