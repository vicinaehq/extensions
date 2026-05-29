import { MonitorList } from './monitor-list';

export default function Monitors() {
  return (
    <MonitorList
      command="monitors"
      sectionTitle="Monitors"
      searchBarPlaceholder="Search monitors..."
      emptyTitle="No Monitors Found"
      emptyDescription="No active Hyprland monitors were returned by hyprctl."
    />
  );
}
