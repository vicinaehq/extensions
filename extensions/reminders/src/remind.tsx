import { closeMainWindow, Form, type LaunchProps, showToast, Toast } from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import type { ReminderLocale } from "./domain/locale";
import { parseReminderInput } from "./domain/parser";
import Reminders from "./reminders";
import { createReminderFromInput } from "./ui/new-reminder-form";
import { getReminderLocale } from "./ui/reminder-locale";

type RemindArguments = { reminder?: string };

function InlineCapture({ text, locale }: { text: string; locale: ReminderLocale }) {
	const submitted = useRef(false);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		if (submitted.current) return;
		submitted.current = true;
		void (async () => {
			try {
				const parsed = await createReminderFromInput(text, locale);
				await showToast({
					style: Toast.Style.Success,
					title: "Reminder set",
					message: parsed.due.toLocaleString(locale, {
						weekday: "short",
						day: "numeric",
						month: "short",
						hour: "2-digit",
						minute: "2-digit",
					}),
				});
				await closeMainWindow();
			} catch (error) {
				setFailed(true);
				await showToast({
					style: Toast.Style.Failure,
					title: "Reminder not set",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		})();
	}, [locale, text]);
	if (failed) return <Reminders initialSearchText={text} locale={locale} />;
	return (
		<Form navigationTitle="Setting Reminder" isLoading>
			<Form.Description text={text} />
		</Form>
	);
}

export default function Remind(props: LaunchProps<{ arguments: RemindArguments }>) {
	const locale = getReminderLocale();
	const inlineText = props.arguments?.reminder?.trim() ?? "";
	if (!inlineText) return <Reminders locale={locale} />;
	try {
		parseReminderInput(inlineText, new Date(), locale);
		return <InlineCapture text={inlineText} locale={locale} />;
	} catch {
		return <Reminders initialSearchText={inlineText} locale={locale} />;
	}
}
