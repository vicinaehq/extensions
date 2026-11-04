import { Action, ActionPanel, Alert, confirmAlert, Icon, List, showToast, Toast } from "@vicinae/api";
import { useState } from "react";
import { flushDnsCache, flushFakeIpCache, updateGeoDatabase } from "../lib/clash-api";
import { showError } from "../lib/toast";

type MaintenanceAction = {
  title: string;
  confirmation: string;
  successTitle: string;
  icon: Icon;
  destructive?: boolean;
  run: () => Promise<void>;
};

const ACTIONS: MaintenanceAction[] = [
  {
    title: "Clear DNS Cache",
    confirmation: "Clear the DNS cache?",
    successTitle: "DNS Cache Cleared",
    icon: Icon.Trash,
    destructive: true,
    run: flushDnsCache,
  },
  {
    title: "Clear FakeIP Cache",
    confirmation: "Clear the FakeIP cache?",
    successTitle: "FakeIP Cache Cleared",
    icon: Icon.Trash,
    destructive: true,
    run: flushFakeIpCache,
  },
  {
    title: "Update GEO Database",
    confirmation: "Download and replace the GEO database?",
    successTitle: "GEO Database Updated",
    icon: Icon.Download,
    run: updateGeoDatabase,
  },
];

export default function Maintenance() {
  const [isLoading, setIsLoading] = useState(false);

  async function execute(action: MaintenanceAction) {
    const confirmed = await confirmAlert({
      title: action.confirmation,
      message: action.destructive
        ? "Active DNS resolutions may be performed again after this operation."
        : "The update may take a moment to complete.",
      primaryAction: {
        title: action.title,
        ...(action.destructive ? { style: Alert.ActionStyle.Destructive } : {}),
      },
    });
    if (!confirmed) return;

    setIsLoading(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: action.title });
    try {
      await action.run();
      toast.style = Toast.Style.Success;
      toast.title = action.successTitle;
      await toast.update();
    } catch (error) {
      toast.hide();
      await showError(`${action.title} Failed`, error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search maintenance actions...">
      {ACTIONS.map((action) => (
        <List.Item
          key={action.title}
          icon={action.icon}
          title={action.title}
          actions={
            <ActionPanel>
              <Action
                title={action.title}
                icon={action.icon}
                style={action.destructive ? Action.Style.Destructive : undefined}
                onAction={() => void execute(action)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
