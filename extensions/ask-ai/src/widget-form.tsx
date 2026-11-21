import { Action, ActionPanel, Form, Icon, useNavigation } from "@vicinae/api";
import { useState } from "react";
import { type State, type WidgetSpec, formatValue, parseNumber, widgetFields } from "./openui.ts";
import { ask } from "./session.ts";

/** An answer's interactive tool as a form: results recompute on every change. */
export function WidgetForm(props: { widget: WidgetSpec }) {
	const { pop } = useNavigation();
	const [state, setState] = useState<State>(props.widget.defaults);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const fields = widgetFields(props.widget, state);
	const set = (name: string, value: unknown) => setState((s) => ({ ...s, [name]: value }));

	const summary = fields
		.flatMap((f) =>
			f.kind === "result"
				? [`${f.label}: ${f.value}`]
				: f.kind === "note"
					? []
					: [`${f.label}: ${formatValue(state[f.name], f.kind === "number" ? f.unit : undefined)}`],
		)
		.join("\n");

	return (
		<Form
			navigationTitle={props.widget.title}
			actions={
				<ActionPanel>
					<Action.CopyToClipboard title="Copy Results" content={summary} />
					<Action
						title="Ask About These Values"
						icon={Icon.SpeechBubble}
						onAction={() => {
							ask(`${props.widget.title}, with these values:\n${summary}\n\nWhat does this mean for me?`);
							pop();
						}}
					/>
					<Action
						title="Reset Values"
						icon={Icon.ArrowCounterClockwise}
						onAction={() => {
							setState(props.widget.defaults);
							setDrafts({});
						}}
					/>
				</ActionPanel>
			}
		>
			{fields.map((f, i) => {
				switch (f.kind) {
					case "number":
						return (
							<Form.TextField
								key={f.name}
								id={f.name}
								title={f.unit ? `${f.label} (${f.unit})` : f.label}
								value={drafts[f.name] ?? formatValue(state[f.name])}
								error={drafts[f.name] !== undefined && parseNumber(drafts[f.name]) === null ? "Enter a number" : undefined}
								onChange={(text) => {
									setDrafts((d) => ({ ...d, [f.name]: text }));
									const n = parseNumber(text);
									if (n !== null) set(f.name, n);
								}}
							/>
						);
					case "text":
						return <Form.TextField key={f.name} id={f.name} title={f.label} value={String(state[f.name] ?? "")} onChange={(t) => set(f.name, t)} />;
					case "select":
						return (
							<Form.Dropdown key={f.name} id={f.name} title={f.label} value={String(state[f.name] ?? f.options[0] ?? "")} onChange={(t) => set(f.name, t)}>
								{f.options.map((o) => (
									<Form.Dropdown.Item key={o} title={o} value={o} />
								))}
							</Form.Dropdown>
						);
					case "toggle":
						return <Form.Checkbox key={f.name} id={f.name} label={f.label} value={!!state[f.name]} onChange={(b) => set(f.name, b)} />;
					case "result":
						return <Form.Description key={`r${i}`} title={f.label} text={f.value} />;
					case "note":
						return f.text ? <Form.Description key={`n${i}`} text={f.text} /> : null;
				}
			})}
		</Form>
	);
}
