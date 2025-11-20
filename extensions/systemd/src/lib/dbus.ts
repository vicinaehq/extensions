import { systemBus, sessionBus } from "dbus-next";
import { Toast, showToast } from "@vicinae/api";
import {
  parseUnitInfo,
  getSystemdManager,
  fetchAdditionalUnitProperties,
} from "../utils";
import type { Service } from "../types";

// Get list of services using D-Bus
export async function listServicesDBus(
  showAll: boolean = true,
): Promise<Service[]> {
  const services: Service[] = [];

  try {
    // Get system services
    const sysBus = systemBus();
    const systemManager = await getSystemdManager(sysBus);

    const systemUnits = await systemManager.ListUnits();
    for (const unit of systemUnits) {
      const service = parseUnitInfo(unit, "system");

      if (service && (showAll || service.loadStatus === "loaded")) {
        // Fetch additional properties for this unit
        try {
          await fetchAdditionalUnitProperties(service, sysBus, unit[6]); // unit[6] is the unit object path
        } catch (error) {
          console.warn(
            `Failed to fetch additional properties for ${service.name}:`,
            error,
          );
        }
        services.push(service);
      }
    }

    await sysBus.disconnect();

    // Try to get user services
    try {
      const userBus = sessionBus();
      const userManager = await getSystemdManager(userBus);

      const userUnits = await userManager.ListUnits();
      for (const unit of userUnits) {
        const service = parseUnitInfo(unit, "user");

        if (service && (showAll || service.loadStatus === "loaded")) {
          // Fetch additional properties for this unit
          try {
            await fetchAdditionalUnitProperties(service, userBus, unit[6]); // unit[6] is the unit object path
          } catch (error) {
            console.warn(
              `Failed to fetch additional properties for ${service.name}:`,
              error,
            );
          }
          services.push(service);
        }
      }

      await userBus.disconnect();
    } catch (userError) {
      // User services may not be available, that's okay
      console.log("User services not available:", userError);
    }

    return services.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Error listing services via D-Bus:", error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to list services",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}
