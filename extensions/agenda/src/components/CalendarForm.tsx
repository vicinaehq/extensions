import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
  Color,
} from "@vicinae/api";
import { Calendar } from "../lib/types";
import { getCalendars, setCalendars, getCalendarName } from "../lib/calendar";
import { FormValues, colorOptions } from "../lib/forms";
import { validateCalendarForm } from "../lib/validation";

interface CalendarFormProps {
  calendar?: Calendar;
  onSubmit?: () => void;
}

export default function CalendarForm({
  calendar,
  onSubmit,
}: CalendarFormProps) {
  const { pop } = useNavigation();
  const isEditing = !!calendar;

  const handleSubmit = async (values: FormValues) => {
    const { url, name, color } = values;

    if (!(await validateCalendarForm({ url }, calendar?.url))) {
      return;
    }

    const existingCalendars = getCalendars();

    const calendarData = {
      url: url!,
      name: name || (isEditing ? "Updated Calendar" : "New Calendar"),
      color: color || Color.Blue,
    };

    if (isEditing) {
      // Replace the old calendar with the new one
      const updatedCalendars = existingCalendars.map((existingCal) =>
        existingCal.url === calendar.url ? calendarData : existingCal,
      );
      setCalendars(updatedCalendars);
    } else {
      // Add new calendar
      setCalendars([...existingCalendars, calendarData]);
    }

    await showToast({
      title: isEditing ? "Calendar Updated" : "Calendar Added",
      message:
        name ||
        (isEditing
          ? "Calendar has been updated successfully."
          : "New calendar has been added successfully."),
      style: Toast.Style.Success,
    });

    onSubmit?.();
    pop();
  };

  return (
    <Form
      navigationTitle={isEditing ? "Edit Calendar" : "Add Calendar"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={isEditing ? "Update Calendar" : "Add Calendar"}
            icon={isEditing ? Icon.Pencil : Icon.Plus}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Calendar Name"
        defaultValue={isEditing ? getCalendarName(calendar) : undefined}
      />
      <Form.TextField
        id="url"
        title="iCal URL"
        defaultValue={isEditing ? calendar.url : undefined}
      />
      <Form.Dropdown
        id="color"
        title="Calendar Color"
        defaultValue={isEditing ? calendar.color : Color.Blue}
      >
        {colorOptions.map((option) => (
          <Form.Dropdown.Item
            key={option.value}
            value={option.value}
            title={option.title}
            icon={{ source: Icon.Dot, tintColor: option.value }}
          />
        ))}
      </Form.Dropdown>
      {!isEditing && (
        <Form.Description text="Enter the iCal URL from your calendar service. For Google Calendar, go to Settings → [Calendar Name] → Integrate calendar → Public address in iCal format." />
      )}
    </Form>
  );
}
