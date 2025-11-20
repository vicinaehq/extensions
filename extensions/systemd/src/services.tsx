import { useCallback, useMemo, useState } from "react";
import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useServices } from "./hooks/useServices";
import { ServiceListItem } from "./components/ServiceListItem";
import { filterServices } from "./utils";
import type { ServiceFilter } from "./types";

// Main component
export default function Services() {
  const { services, loading, refreshServices } = useServices();
  const [showingDetail, setShowingDetail] = useState(false);
  const [filter, setFilter] = useState<ServiceFilter>("all");

  const toggleDetails = useCallback(() => {
    setShowingDetail(!showingDetail);
  }, [showingDetail]);

  // Filter services based on selected filter
  const filteredServices = useMemo(() => {
    return filterServices(services, filter);
  }, [services, filter]);

  if (services.length === 0 && !loading) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Gear}
          title="No Services Found"
          description="No systemd services available. This might indicate a permission issue or no services are loaded."
          actions={
            <ActionPanel>
              <Action
                title="Refresh Services"
                icon={Icon.ArrowClockwise}
                onAction={refreshServices}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search services..."
      isShowingDetail={showingDetail}
    >
      <List.Dropdown
        tooltip="Filter services"
        value={filter}
        onChange={(value) => setFilter(value as ServiceFilter)}
      >
        <List.Dropdown.Item value="all" title="All Services" icon={Icon.List} />
        <List.Dropdown.Item
          value="system"
          title="System Services"
          icon={Icon.Gear}
        />
        <List.Dropdown.Item
          value="user"
          title="User Services"
          icon={Icon.Person}
        />
        <List.Dropdown.Item
          value="running"
          title="Running Services"
          icon={Icon.Play}
        />
        <List.Dropdown.Item
          value="stopped"
          title="Stopped Services"
          icon={Icon.Stop}
        />
      </List.Dropdown>
      {filteredServices.map((service) => (
        <ServiceListItem
          key={`${service.name}-${service.type}`}
          service={service}
          showingDetail={showingDetail}
          refreshServices={refreshServices}
          toggleDetails={toggleDetails}
        />
      ))}
    </List>
  );
}
