import { useEffect, useState, useCallback } from "react";
import { Toast, showToast } from "@vicinae/api";
import { listServicesDBus } from "../lib/dbus";
import { getServiceIcon } from "../utils";
import type { Service } from "../types";

// Custom hook for managing services
export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchServices = useCallback(async (): Promise<Service[]> => {
    try {
      const services = await listServicesDBus();

      // Add icons to services
      return services.map((service) => ({
        ...service,
        icon: getServiceIcon(),
      }));
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch services",
      });
      console.error(error);
      return [];
    }
  }, []);

  const refreshServices = useCallback(async () => {
    setLoading(true);
    const newServices = await fetchServices();
    setServices(newServices);
    setLoading(false);
  }, [fetchServices]);

  useEffect(() => {
    refreshServices();
  }, [refreshServices]);

  return { services, loading, refreshServices };
}
