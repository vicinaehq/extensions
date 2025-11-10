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

export const getDisplayStart = (start: Date, isAllDay: boolean): string => {
  return isAllDay
    ? ""
    : start.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
};

export const getDisplayEnd = (
  end: Date,
  isAllDay: boolean,
): string | undefined => {
  return isAllDay
    ? undefined
    : end.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
};