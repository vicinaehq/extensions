import { Calendar } from "./types";
import CalendarForm from "./components/CalendarForm";

interface EditCalendarProps {
  calendar: Calendar;
}

export default function EditCalendar({ calendar }: EditCalendarProps) {
  return <CalendarForm calendar={calendar} />;
}
