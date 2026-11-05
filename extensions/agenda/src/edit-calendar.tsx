import { Calendar } from "./lib/types";
import CalendarForm from "./components/CalendarForm";

interface EditCalendarProps {
  calendar: Calendar;
  onSubmit?: () => void;
}

export default function EditCalendar({ calendar, onSubmit }: EditCalendarProps) {
  return <CalendarForm calendar={calendar} onSubmit={onSubmit} />;
}
