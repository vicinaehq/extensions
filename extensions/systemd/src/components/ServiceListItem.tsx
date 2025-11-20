import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { ServiceStatus } from "../types";
import { getServiceColor } from "../utils";
import { ServiceDetail } from "./ServiceDetail";
import { createServiceActionHandler } from "../lib/actions";
import type { Service } from "../types";

// Service list item component
export function ServiceListItem({
  service,
  showingDetail,
  refreshServices,
  toggleDetails,
}: {
  service: Service;
  showingDetail: boolean;
  refreshServices: () => Promise<void>;
  toggleDetails: () => void;
}) {
  const tintColor = getServiceColor(service.status);

  return (
    <List.Item
      key={service.name}
      title={service.name}
      subtitle={service.description}
      icon={{ source: service.icon, tintColor }}
      accessories={
        !showingDetail
          ? [
              {
                icon: service.type === "system" ? Icon.Gear : Icon.Person,
                tooltip: `${service.type} service`,
              },
            ]
          : undefined
      }
      detail={showingDetail ? <ServiceDetail service={service} /> : undefined}
      actions={
        <ActionPanel>
          <Action
            title={showingDetail ? "Hide Details" : "Show Details"}
            icon={showingDetail ? Icon.EyeDisabled : Icon.Eye}
            onAction={toggleDetails}
          />
          {service.status === ServiceStatus.ACTIVE ? (
            <>
              <Action
                title="Stop"
                icon={Icon.Stop}
                style="destructive"
                shortcut={{ modifiers: ["ctrl"], key: "s" }}
                onAction={createServiceActionHandler(
                  "stop",
                  service,
                  refreshServices,
                )}
              />
              <Action
                title="Restart"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["ctrl"], key: "r" }}
                onAction={createServiceActionHandler(
                  "restart",
                  service,
                  refreshServices,
                )}
              />
              <Action
                title="Reload"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["ctrl"], key: "l" }}
                onAction={createServiceActionHandler(
                  "reload",
                  service,
                  refreshServices,
                )}
              />
            </>
          ) : (
            <Action
              title="Start"
              icon={Icon.Play}
              shortcut={{ modifiers: ["ctrl"], key: "s" }}
              onAction={createServiceActionHandler(
                "start",
                service,
                refreshServices,
              )}
            />
          )}
          <ActionPanel.Section>
            <Action
              title="Enable"
              icon={Icon.CheckCircle}
              shortcut={{ modifiers: ["ctrl"], key: "e" }}
              onAction={createServiceActionHandler(
                "enable",
                service,
                refreshServices,
              )}
            />
            <Action
              title="Disable"
              icon={Icon.XMarkCircle}
              style="destructive"
              shortcut={{ modifiers: ["ctrl"], key: "d" }}
              onAction={createServiceActionHandler(
                "disable",
                service,
                refreshServices,
              )}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
