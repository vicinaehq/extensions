export const isAllDayEvent = (start: Date, end: Date): boolean => {
  return (
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    start.getSeconds() === 0 &&
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getSeconds() === 0 &&
    end.getTime() - start.getTime() === 24 * 60 * 60 * 1000
  );
};

/**
 * Display time using UTC timezone because node-ical/rrule stores
 * local time values in the UTC position internally
 */
export const getDisplayStart = (
  start: Date,
  isAllDay: boolean,
  use24Hour: boolean = false
): string => {
  return isAllDay
    ? ""
    : start.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: !use24Hour,
        timeZone: "UTC",
      });
};

export const getDisplayEnd = (
  end: Date,
  isAllDay: boolean,
  use24Hour: boolean = false
): string | undefined => {
  return isAllDay
    ? undefined
    : end.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: !use24Hour,
        timeZone: "UTC",
      });
};

/**
 * Get the date string for an event (YYYY-MM-DD format)
 * Uses UTC because node-ical stores local time values as UTC internally
 */
export const getLocalDateString = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
