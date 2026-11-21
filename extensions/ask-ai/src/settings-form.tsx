import { Action, ActionPanel, Form, Icon, Toast, showToast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
import { type ProviderId, providerById, providers } from "./providers/index.ts";
import { type OutputStyle, type ProviderSettings, type Settings, loadSettings, saveSettings } from "./settings.ts";

const CLI: Partial<Record<ProviderId, { bin: string; login: string }>> = {
	"claude-code": { bin: "claude", login: "claude auth login" },
	codex: { bin: "codex", login: "codex login" },
	antigravity: { bin: "agy", login: "agy" },
};

const DEFAULT_MODEL: Partial<Record<ProviderId, string>> = {
	anthropic: "claude-opus-5-5",
	openai: "gpt-5.5",
	gemini: "gemini-3.8-flash",
};

/** Provider first; only that provider's fields are shown. */
export function SettingsForm(props: { onSaved?: (settings: Settings) => void }) {
	const { pop } = useNavigation();
	const [settings, setSettings] = useState<Settings>();

	useEffect(() => {
		loadSettings().then(setSettings);
	}, []);

	if (!settings) return <Form isLoading />;

	const id = settings.provider;
	const current = settings.providers[id] ?? {};
	const cli = CLI[id];
	const setField = (field: keyof ProviderSettings) => (value: string) =>
		setSettings({ ...settings, providers: { ...settings.providers, [id]: { ...current, [field]: value } } });

	const save = async () => {
		if (!cli && !current.apiKey?.trim()) {
			await showToast({ style: Toast.Style.Failure, title: "Add an API key first" });
			return;
		}
		await saveSettings(settings);
		await showToast({ style: Toast.Style.Success, title: "Settings saved" });
		props.onSaved?.(settings);
		pop();
	};

	return (
		<Form
			navigationTitle="Ask AI Settings"
			actions={
				<ActionPanel>
					<Action.SubmitForm title="Save Settings" icon={Icon.Check} onSubmit={save} />
				</ActionPanel>
			}
		>
			<Form.Dropdown
				id="provider"
				title="Provider"
				value={id}
				onChange={(value) => setSettings({ ...settings, provider: providerById(value).id })}
			>
				{providers.map((p) => (
					<Form.Dropdown.Item key={p.id} title={p.title} value={p.id} />
				))}
			</Form.Dropdown>

			{cli ? (
				<Form.Description
					title="Sign-in"
					text={`Uses your existing ${providerById(id).title} login. If you're signed out, run \`${cli.login}\` in a terminal.`}
				/>
			) : (
				<Form.PasswordField
					id={`${id}-apiKey`}
					title="API Key"
					value={current.apiKey ?? ""}
					onChange={setField("apiKey")}
				/>
			)}
			{(id === "anthropic" || id === "openai") && (
				<Form.TextField
					id={`${id}-baseUrl`}
					title="Base URL"
					placeholder={id === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com"}
					info={
						id === "anthropic"
							? "Optional. Point at an Anthropic-compatible gateway; the key is then sent as a bearer token."
							: "Optional. Point at a gateway that serves the OpenAI Responses API."
					}
					value={current.baseUrl ?? ""}
					onChange={setField("baseUrl")}
				/>
			)}
			<Form.TextField
				id={`${id}-model`}
				title="Model"
				placeholder={DEFAULT_MODEL[id] ?? `${providerById(id).title} default`}
				value={current.model ?? ""}
				onChange={setField("model")}
			/>
			{cli && (
				<Form.TextField
					id="extraPath"
					title="Extra PATH"
					placeholder="~/.local/bin is always searched"
					info={`Colon-separated folders to search for \`${cli.bin}\` if Vicinae can't find it.`}
					value={settings.extraPath ?? ""}
					onChange={(extraPath) => setSettings({ ...settings, extraPath })}
				/>
			)}

			<Form.Separator />
			<Form.Dropdown
				id="outputStyle"
				title="Output Style"
				value={settings.outputStyle}
				onChange={(value) => setSettings({ ...settings, outputStyle: value as OutputStyle })}
			>
				<Form.Dropdown.Item title="Full" value="full" />
				<Form.Dropdown.Item title="Layman's terms" value="layman" />
				<Form.Dropdown.Item title="Custom" value="custom" />
			</Form.Dropdown>
			<Form.Checkbox
				id="richAnswers"
				title="Rich Answers"
				label="Tables, charts, places and action buttons (OpenUI)"
				value={settings.richAnswers}
				onChange={(richAnswers) => setSettings({ ...settings, richAnswers })}
			/>
			{settings.outputStyle === "custom" && (
				<Form.TextArea
					id="customStyle"
					title="Custom Instructions"
					placeholder="How answers should be written, e.g. 'Answer in Indonesian, max 3 bullet points.'"
					value={settings.customStyle ?? ""}
					onChange={(customStyle) => setSettings({ ...settings, customStyle })}
				/>
			)}
		</Form>
	);
}
