import path from "node:path";
import {
	Action,
	ActionPanel,
	Alert,
	confirmAlert,
	Detail,
	environment,
	Form,
	Icon,
	List,
	showToast,
	Toast,
	useNavigation,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import type { ReminderLocale } from "./domain/locale";
import type { RecurrenceKind, Reminder } from "./domain/model";
import { parseReminderInput } from "./domain/parser";
import {
	completeReminderOccurrence,
	effectiveDueDate,
	recurrenceFromDate,
	setReminderRecurrence,
} from "./domain/recurrence";
import { collectDiagnostics, diagnosticsMarkdown } from "./infrastructure/diagnostics";
import { ensureInfrastructure, stopNotificationHelper } from "./infrastructure/infrastructure";
import { ReminderConflictError, type ReminderScan, ReminderStore } from "./storage/store";
import { createReminderFromInput } from "./ui/new-reminder-form";
import { notificationIconSourcePath } from "./ui/notification-icon";
import { getReminderLocale } from "./ui/reminder-locale";

const store = new ReminderStore();
const RECURRENCE_KINDS = ["daily", "weekly", "fortnightly", "monthly"] as const;
const RECURRENCE_SHORTCUT_KEYS: Record<RecurrenceKind, "1" | "2" | "3" | "4"> = {
	daily: "1",
	weekly: "2",
	fortnightly: "3",
	monthly: "4",
};

function formatTime(date: Date, locale: ReminderLocale): string {
	return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function formatDue(date: Date, locale: ReminderLocale, now = new Date()): string {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
	const time = formatTime(date, locale);
	if (days === 0) return `Today at ${time}`;
	if (days === 1) return `Tomorrow at ${time}`;
	return `${date.toLocaleDateString(locale, {
		weekday: "short",
		day: "numeric",
		month: "short",
		...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const }),
	})} at ${time}`;
}

function recurrenceLabel(kind: RecurrenceKind): string {
	return kind === "fortnightly" ? "Fortnightly" : `${kind[0].toUpperCase()}${kind.slice(1)}`;
}

function sectionTitle(date: Date, locale: ReminderLocale, now = new Date()): string {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
	if (days === 0) return "Today";
	if (days === 1) return "Tomorrow";
	if (days > 1 && days < 7) return date.toLocaleDateString(locale, { weekday: "long" });
	return date.toLocaleDateString(locale, {
		weekday: "short",
		day: "numeric",
		month: "long",
		...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const }),
	});
}

async function toastError(title: string, error: unknown): Promise<void> {
	await showToast({
		style: Toast.Style.Failure,
		title,
		message: error instanceof Error ? error.message : String(error),
	});
}

type EditFormProps = { reminder: Reminder; onSaved: () => Promise<void> };

function EditReminderForm({ reminder, onSaved }: EditFormProps) {
	const { pop } = useNavigation();
	const due = effectiveDueDate(reminder);
	return (
		<Form
			navigationTitle="Edit Reminder"
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Save Reminder"
						shortcut={{ key: "enter", modifiers: [] }}
						onSubmit={async (values) => {
							try {
								const text = String(values.text ?? "").trim();
								const nextDue = values.due instanceof Date ? values.due : null;
								const recurrence = String(values.recurrence ?? "none") as RecurrenceKind | "none";
								if (!text) throw new Error("Reminder text cannot be empty");
								if (!nextDue || nextDue.getTime() <= Date.now())
									throw new Error("Due time must be in the future");
								await store.mutate(reminder.id, reminder.revision, (current) => {
									const base = {
										...current,
										text,
										dueAt: nextDue.toISOString(),
										snoozedUntil: undefined,
										pendingNotification: undefined,
										lastAttemptAt: undefined,
										lastError: undefined,
										failureCount: 0,
									};
									return recurrence === "none"
										? { ...base, recurrence: null }
										: { ...base, recurrence: recurrenceFromDate(recurrence, nextDue) };
								});
								await stopNotificationHelper(reminder.pendingNotification?.unitName);
								await onSaved();
								await showToast({ style: Toast.Style.Success, title: "Reminder updated" });
								pop();
							} catch (error) {
								await toastError("Reminder not updated", error);
							}
						}}
					/>
				</ActionPanel>
			}
		>
			<Form.TextField id="text" title="Reminder" defaultValue={reminder.text} autoFocus />
			<Form.DatePicker
				id="due"
				title="Due"
				type={Form.DatePicker.Type.DateTime}
				defaultValue={due}
			/>
			<Form.Dropdown
				id="recurrence"
				title="Recurrence"
				defaultValue={reminder.recurrence?.kind ?? "none"}
			>
				<Form.Dropdown.Item value="none" title="Does not repeat" />
				<Form.Dropdown.Item value="daily" title="Daily" />
				<Form.Dropdown.Item value="weekly" title="Weekly" />
				<Form.Dropdown.Item value="fortnightly" title="Fortnightly" />
				<Form.Dropdown.Item value="monthly" title="Monthly" />
			</Form.Dropdown>
		</Form>
	);
}

function DiagnosticsView() {
	const [markdown, setMarkdown] = useState("# Reminder diagnostics\n\nLoading…");
	const [loading, setLoading] = useState(true);
	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			setMarkdown(diagnosticsMarkdown(await collectDiagnostics()));
		} catch (error) {
			setMarkdown(`# Reminder diagnostics\n\nCould not collect diagnostics: ${String(error)}`);
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	return (
		<Detail
			navigationTitle="Reminder Diagnostics"
			markdown={markdown}
			actions={
				<ActionPanel>
					<Action
						title={loading ? "Refreshing…" : "Refresh"}
						icon={Icon.RotateClockwise}
						onAction={refresh}
					/>
				</ActionPanel>
			}
		/>
	);
}

type ReminderActionsProps = {
	reminder: Reminder;
	reload: () => Promise<void>;
	locale: ReminderLocale;
};

function ReminderActions({ reminder, reload, locale }: ReminderActionsProps) {
	const mutate = async (operation: (current: Reminder) => Reminder): Promise<boolean> => {
		try {
			await store.mutate(reminder.id, reminder.revision, operation);
			await stopNotificationHelper(reminder.pendingNotification?.unitName);
			await reload();
			return true;
		} catch (error) {
			await toastError(
				error instanceof ReminderConflictError
					? "Reminder changed; list refreshed"
					: "Reminder not updated",
				error,
			);
			await reload();
			return false;
		}
	};
	const snooze = async (target: Date) => {
		const succeeded = await mutate((current) =>
			current.recurrence
				? {
						...current,
						snoozedUntil: target.toISOString(),
						dueAt: target.toISOString(),
						lastAttemptAt: undefined,
						lastError: undefined,
						pendingNotification: undefined,
					}
				: {
						...current,
						dueAt: target.toISOString(),
						lastAttemptAt: undefined,
						lastError: undefined,
						pendingNotification: undefined,
					},
		);
		if (!succeeded) return;
		await showToast({
			style: Toast.Style.Success,
			title: "Reminder snoozed",
			message: formatTime(target, locale),
		});
	};
	const snoozeBy = (milliseconds: number) => {
		const original = effectiveDueDate(reminder).getTime();
		return snooze(new Date(Math.max(Date.now(), original) + milliseconds));
	};
	return (
		<ActionPanel>
			<Action
				title="Complete Reminder"
				icon={Icon.Check}
				shortcut={{ key: "enter", modifiers: [] }}
				onAction={async () => {
					try {
						await store.mutate(reminder.id, reminder.revision, (current) =>
							completeReminderOccurrence(current),
						);
						await stopNotificationHelper(reminder.pendingNotification?.unitName);
						await reload();
						await showToast({ style: Toast.Style.Success, title: "Reminder completed" });
					} catch (error) {
						await toastError("Reminder not completed", error);
						await reload();
					}
				}}
			/>
			<Action.Push
				title="Edit Reminder"
				icon={Icon.Pencil}
				shortcut="edit"
				target={<EditReminderForm reminder={reminder} onSaved={reload} />}
			/>
			<ActionPanel.Submenu
				title="Snooze"
				icon={Icon.Clock}
				shortcut={{ key: "s", modifiers: ["cmd"] }}
			>
				<Action
					title="10 Minutes"
					shortcut={{ key: "1", modifiers: ["cmd"] }}
					onAction={() => snoozeBy(10 * 60_000)}
				/>
				<Action
					title="1 Hour"
					shortcut={{ key: "2", modifiers: ["cmd"] }}
					onAction={() => snoozeBy(60 * 60_000)}
				/>
				<Action
					title="Tomorrow at 09:00"
					shortcut={{ key: "3", modifiers: ["cmd"] }}
					onAction={() => {
						const tomorrow = new Date();
						tomorrow.setDate(tomorrow.getDate() + 1);
						tomorrow.setHours(9, 0, 0, 0);
						return snooze(tomorrow);
					}}
				/>
			</ActionPanel.Submenu>
			<ActionPanel.Submenu
				title="Recurrence"
				icon={Icon.Repeat}
				shortcut={{ key: "r", modifiers: ["cmd"] }}
			>
				{RECURRENCE_KINDS.map((kind) => (
					<Action
						key={kind}
						title={recurrenceLabel(kind)}
						shortcut={{
							key: RECURRENCE_SHORTCUT_KEYS[kind],
							modifiers: ["cmd", "shift"],
						}}
						onAction={() =>
							mutate((current) => {
								const due = effectiveDueDate(current);
								return setReminderRecurrence(current, kind, due);
							})
						}
					/>
				))}
				<Action
					title="Does Not Repeat"
					shortcut={{ key: "0", modifiers: ["cmd", "shift"] }}
					onAction={() => mutate((current) => setReminderRecurrence(current, null))}
				/>
			</ActionPanel.Submenu>
			<Action
				title="Delete Reminder"
				icon={Icon.Trash}
				style="destructive"
				shortcut="remove"
				onAction={async () => {
					if (
						!(await confirmAlert({
							title: "Delete reminder?",
							message: reminder.text,
							primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
						}))
					)
						return;
					try {
						await store.delete(reminder.id, reminder.revision);
						await stopNotificationHelper(reminder.pendingNotification?.unitName);
						await reload();
						await showToast({ style: Toast.Style.Success, title: "Reminder deleted" });
					} catch (error) {
						await toastError("Reminder not deleted", error);
						await reload();
					}
				}}
			/>
		</ActionPanel>
	);
}

type RemindersProps = { initialSearchText?: string; locale?: ReminderLocale };

export default function Reminders({
	initialSearchText = "",
	locale = getReminderLocale(),
}: RemindersProps) {
	const [scan, setScan] = useState<ReminderScan>({ reminders: [], corrupt: [], migratedCount: 0 });
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [searchText, setSearchText] = useState(initialSearchText);
	const [infrastructureError, setInfrastructureError] = useState<string>();
	const reload = useCallback(async () => {
		const next = await store.list();
		next.reminders.sort((a, b) => effectiveDueDate(a).getTime() - effectiveDueDate(b).getTime());
		setScan(next);
	}, []);

	useEffect(() => {
		void (async () => {
			setLoading(true);
			try {
				await ensureInfrastructure({
					workerSourcePath: path.join(environment.assetsPath, "worker.cjs"),
					iconSourcePath: notificationIconSourcePath(),
				});
				setInfrastructureError(undefined);
			} catch (error) {
				setInfrastructureError(error instanceof Error ? error.message : String(error));
			} finally {
				await reload();
				setLoading(false);
			}
		})();
	}, [reload]);

	const sections = new Map<string, Reminder[]>();
	for (const reminder of scan.reminders) {
		const title = sectionTitle(effectiveDueDate(reminder), locale);
		sections.set(title, [...(sections.get(title) ?? []), reminder]);
	}
	const reminderInput = searchText.trim();
	let parsedInput: ReturnType<typeof parseReminderInput> | undefined;
	let reminderInputError: string | undefined;
	if (reminderInput) {
		try {
			parsedInput = parseReminderInput(reminderInput, new Date(), locale);
		} catch (error) {
			reminderInputError = error instanceof Error ? error.message : String(error);
		}
	}
	const createInline = async () => {
		if (!reminderInput) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Type a reminder first",
				message: "Include what you need and when",
			});
			return;
		}
		try {
			parseReminderInput(reminderInput, new Date(), locale);
		} catch (error) {
			await toastError("Add a time to the reminder", error);
			return;
		}
		setCreating(true);
		try {
			const parsed = await createReminderFromInput(reminderInput, locale);
			setSearchText("");
			await reload();
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
		} catch (error) {
			await toastError("Reminder not set", error);
		} finally {
			setCreating(false);
		}
	};
	return (
		<List
			isLoading={loading || creating}
			searchBarPlaceholder="Reminder and time"
			searchText={searchText}
			onSearchTextChange={setSearchText}
			navigationTitle="Reminders"
			actions={
				<ActionPanel>
					<Action.Push
						title="Diagnostics"
						icon={Icon.Info01}
						shortcut={{ key: "d", modifiers: ["cmd", "shift"] }}
						target={<DiagnosticsView />}
					/>
				</ActionPanel>
			}
		>
			<List.Section title="Quick action">
				<List.Item
					id="new-reminder"
					title={parsedInput ? `Create “${parsedInput.text}”` : "Create a reminder"}
					subtitle={
						parsedInput
							? formatDue(parsedInput.due, locale)
							: (reminderInputError ?? "Type what to remember and when it is due")
					}
					icon={reminderInputError ? Icon.Warning : Icon.PlusCircle}
					actions={
						<ActionPanel>
							<Action
								title="Create Reminder"
								icon={Icon.PlusCircle}
								shortcut={{ key: "enter", modifiers: [] }}
								onAction={createInline}
							/>
							<Action.Push
								title="Diagnostics"
								icon={Icon.Info01}
								shortcut={{ key: "d", modifiers: ["cmd", "shift"] }}
								target={<DiagnosticsView />}
							/>
						</ActionPanel>
					}
				/>
			</List.Section>
			{infrastructureError ? (
				<List.Section title="Infrastructure needs attention">
					<List.Item
						title={infrastructureError}
						icon={Icon.Warning}
						actions={
							<ActionPanel>
								<Action.Push title="Open Diagnostics" target={<DiagnosticsView />} />
							</ActionPanel>
						}
					/>
				</List.Section>
			) : null}
			{scan.corrupt.length > 0 ? (
				<List.Section title="Corrupt reminder files">
					{scan.corrupt.map((item) => (
						<List.Item
							key={item.file}
							title={item.file}
							subtitle={item.error}
							icon={Icon.Warning}
						/>
					))}
				</List.Section>
			) : null}
			{[...sections.entries()].map(([title, reminders]) => (
				<List.Section key={title} title={title}>
					{reminders.map((reminder) => {
						const due = effectiveDueDate(reminder);
						return (
							<List.Item
								key={reminder.id}
								id={reminder.id}
								title={reminder.text}
								icon={reminder.recurrence ? Icon.Repeat : Icon.Bell}
								accessories={[
									{ text: formatTime(due, locale) },
									...(reminder.recurrence
										? [{ tag: recurrenceLabel(reminder.recurrence.kind) }]
										: []),
									...(reminder.pendingNotification ? [{ tag: "Awaiting action" }] : []),
								]}
								actions={<ReminderActions reminder={reminder} reload={reload} locale={locale} />}
							/>
						);
					})}
				</List.Section>
			))}
			{!loading && scan.reminders.length === 0 && !infrastructureError ? (
				<List.Section title="Upcoming">
					<List.Item
						title="No upcoming reminders"
						subtitle="Type above to create one"
						icon={Icon.BellDisabled}
					/>
				</List.Section>
			) : null}
		</List>
	);
}
