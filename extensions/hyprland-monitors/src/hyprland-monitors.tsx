import {
  Action,
  ActionPanel,
  Color,
  Detail,
  List,
  useNavigation,
} from "@vicinae/api";
import { useMonitors } from "./hooks/useMonitors";
import { MonitorSettings } from "./MonitorSettings";
import { useIsHyprlandInstalled } from "./hooks/useIsHyprlandInstalled";
import { noHyprlandErrorMessage } from "./noHyprlandErrorMessage";
import { buildMonitorRule } from "./api/monitor";

export default function HyperlandMonitors() {
  const { monitors, refetchMonitors } = useMonitors();
  const hyprlandInstalled = useIsHyprlandInstalled();
  const { push } = useNavigation();
  if (!hyprlandInstalled) {
    return <Detail markdown={noHyprlandErrorMessage} />;
  }
  return (
    <List searchBarPlaceholder="Monitors...">
      <List.Section title="Monitors">
        {monitors.map((monitor) => (
          <List.Item
            key={buildMonitorRule(monitor)}
            title={monitor.description}
            keywords={[monitor.description]}
            actions={
              <ActionPanel>
                <Action
                  title="Select"
                  onAction={() =>
                    push(
                      <MonitorSettings
                        monitor={monitor}
                        refreshParent={refetchMonitors}
                      />
                    )
                  }
                />
              </ActionPanel>
            }
            accessories={[
              {
                text: {
                  value: `${monitor.width}x${monitor.height}`,
                  color: Color.Green,
                },
              },
              {
                text: { value: `${monitor.refreshRate}Hz`, color: Color.Blue },
              },
            ]}
          />
        ))}
      </List.Section>
    </List>
  );
}

export type Monitor = {
  id: number;
  description: string;
  name: string;
  width: number;
  height: number;
  scale: number;
  transform: number;
  position: string;
  mode: string;
  refreshRate: number;
  availableModes: string[];
};
