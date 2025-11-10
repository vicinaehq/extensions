import { showToast, Toast } from "@vicinae/api";
import { getCalendars } from "./calendar";

export const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const validateCalendarForm = async (
  values: { url?: string },
  existingCalendarUrl?: string,
): Promise<boolean> => {
  const { url } = values;

  if (!url) {
    await showToast({
      title: "URL Required",
      message: "Please enter a calendar URL.",
      style: Toast.Style.Failure,
    });
    return false;
  }

  // Basic URL validation
  if (!validateUrl(url)) {
    await showToast({
      title: "Invalid URL",
      message: "Please enter a valid URL.",
      style: Toast.Style.Failure,
    });
    return false;
  }

  const existingCalendars = getCalendars();

  // Check if the URL already exists (and it's not the current one being edited)
  if (
    existingCalendars.some((cal) => cal.url === url) &&
    url !== existingCalendarUrl
  ) {
    await showToast({
      title: existingCalendarUrl ? "Calendar Already Exists" : "Calendar Already Added",
      message: "This calendar URL is already configured.",
      style: Toast.Style.Failure,
    });
    return false;
  }

  return true;
};