import { showToast, Toast } from "@vicinae/api";
import { getCalendars } from "./calendar";
import { isLocalPath } from "./localPath";

const validateUrlOrPath = (url: string): boolean => {
  if (isLocalPath(url)) {
    return true;
  }
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

  if (!validateUrlOrPath(url)) {
    await showToast({
      title: "Invalid URL or Path",
      message: "Please enter a valid URL or local directory path.",
      style: Toast.Style.Failure,
    });
    return false;
  }

  const existingResult = getCalendars();
  // If the load failed, skip the dedup check — handleSubmit will surface the
  // load error and refuse to write. The form stays open with the user's input.
  const existingCalendars = existingResult.ok ? existingResult.calendars : [];

  // Check if the URL already exists (and it's not the current one being edited)
  if (
    existingCalendars.some((cal) => cal.url === url) &&
    url !== existingCalendarUrl
  ) {
    await showToast({
      title: existingCalendarUrl
        ? "Calendar Already Exists"
        : "Calendar Already Added",
      message: "This calendar URL is already configured.",
      style: Toast.Style.Failure,
    });
    return false;
  }

  return true;
};
