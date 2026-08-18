import { showHUD, showToast, Toast } from "@vicinae/api";
import { applySchedules, CaffeinateRequest, caffeinate, currentStatus, decaffeinate, toggle } from "./coffee";
import { Status } from "./types";

let lastApplyError = "";

export function applySchedulesAndNotify(): Status {
  try {
    const status = applySchedules();
    lastApplyError = "";
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastApplyError) {
      lastApplyError = message;
      void fail(error);
    }
    return currentStatus();
  }
}

export async function caffeinateAndNotify(request: CaffeinateRequest, message: string): Promise<Status | null> {
  try {
    const status = caffeinate(request);
    await showHUD(message);
    return status;
  } catch (error) {
    await fail(error);
    return null;
  }
}

export async function decaffeinateAndNotify(): Promise<Status | null> {
  try {
    const status = decaffeinate({ skipActiveSchedule: true });
    await showHUD("Decaffeinated");
    return status;
  } catch (error) {
    await fail(error);
    return null;
  }
}

export async function toggleAndNotify(): Promise<Status | null> {
  try {
    const wasCaffeinated = toggle();
    await showHUD(wasCaffeinated.caffeinated ? wasCaffeinated.summary : "Decaffeinated");
    return wasCaffeinated;
  } catch (error) {
    await fail(error);
    return null;
  }
}

export async function fail(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await showToast({ style: Toast.Style.Failure, title: "Coffee", message });
}
