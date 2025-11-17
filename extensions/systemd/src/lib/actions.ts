import {
  startService,
  stopService,
  restartService,
  reloadService,
  enableService,
  disableService,
} from "./systemctl";
import type { Service } from "../types";

// Action handler factory functions
export function createServiceActionHandler(
  action: string,
  service: Service,
  refreshServices: () => Promise<void>,
) {
  return async () => {
    try {
      switch (action) {
        case "start":
          await startService(service.name, service.type);
          break;
        case "stop":
          await stopService(service.name, service.type);
          break;
        case "restart":
          await restartService(service.name, service.type);
          break;
        case "reload":
          await reloadService(service.name, service.type);
          break;
        case "enable":
          await enableService(service.name, service.type);
          break;
        case "disable":
          await disableService(service.name, service.type);
          break;
        default:
          console.error(`Unknown action: ${action}`);
          break;
      }
    } catch (error) {
      console.error(`Failed to perform ${action} on ${service.name}:`, error);
    } finally {
      // Always refresh to get the latest state
      await refreshServices();
    }
  };
}
