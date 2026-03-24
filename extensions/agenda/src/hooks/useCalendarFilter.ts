import { useEffect, useState } from "react";
import { LocalStorage } from "@vicinae/api";

import { Calendar } from "../lib/types";

export function useCalendarFilter(calendars: Calendar[]) {
  const [selectedCalendar, setSelectedCalendar] = useState<string>("all");

  // Load selected calendar filter from local storage
  useEffect(() => {
    const loadSelectedCalendar = async () => {
      const stored = await LocalStorage.getItem("agenda-selected-calendar");
      if (typeof stored === "string") {
        // Validate that the stored calendar still exists
        const calendarExists =
          stored === "all" || calendars.some((cal) => cal.url === stored);
        if (calendarExists) {
          setSelectedCalendar(stored);
        } else {
          // Reset to "all" if the selected calendar no longer exists
          setSelectedCalendar("all");
          await LocalStorage.setItem("agenda-selected-calendar", "all");
        }
      }
    };
    loadSelectedCalendar();
  }, [calendars]);

  // Save selected calendar filter to local storage
  useEffect(() => {
    LocalStorage.setItem("agenda-selected-calendar", selectedCalendar);
  }, [selectedCalendar]);

  return {
    selectedCalendar,
    setSelectedCalendar,
  };
}
