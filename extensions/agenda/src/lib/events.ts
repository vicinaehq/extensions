export const isAllDayEvent = (start: Date, end: Date): boolean => {
  const isMidnight = (date: Date): boolean =>
    date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;

  return (
    isMidnight(start) && isMidnight(end) && end.getTime() > start.getTime()
  );
};

export const getDisplayStart = (
  start: Date,
  isAllDay: boolean,
  use24Hour: boolean = false,
): string => {
  return isAllDay
    ? ""
    : start.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: !use24Hour,
      });
};

export const getDisplayEnd = (
  end: Date,
  isAllDay: boolean,
  use24Hour: boolean = false,
): string | undefined => {
  return isAllDay
    ? undefined
    : end.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: !use24Hour,
      });
};

export const getLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
