import {
	Action,
	ActionPanel,
	getPreferenceValues,
	Icon,
	List,
	LocalStorage,
} from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { copySecret, SHORTCUTS, safely } from "./actions";
import { errorMessage } from "./cli-contract";
import { pasteSecret } from "./clipboard";
import {
	generatePassword,
	type PasswordOptions,
	type PasswordScore,
	penaltyLabel,
	scorePassword,
} from "./pass-cli";

type PasswordType = "random" | "passphrase";
type Separator =
	| "hyphens"
	| "spaces"
	| "periods"
	| "commas"
	| "underscores"
	| "numbers"
	| "numbers-and-symbols";

type Preferences = {
	defaultPasswordLength?: string;
	defaultPasswordType?: string;
};

type GeneratorSettings = {
	type: PasswordType;
	length: number;
	words: number;
	includeNumbers: boolean;
	includeUppercase: boolean;
	includeSymbols: boolean;
	separator: Separator;
	capitalize: boolean;
};

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const MIN_WORDS = 3;
const MAX_WORDS = 10;
const GENERATOR_SETTINGS_KEY = "proton_pass_vicinae_generator_settings_v1";

const separators: Separator[] = [
	"hyphens",
	"spaces",
	"periods",
	"commas",
	"underscores",
	"numbers",
	"numbers-and-symbols",
];

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function defaultSettings(): GeneratorSettings {
	const preferences = getPreferenceValues<Preferences>();
	const parsedLength = Number.parseInt(
		preferences.defaultPasswordLength ?? "20",
		10,
	);
	return {
		type:
			preferences.defaultPasswordType === "passphrase"
				? "passphrase"
				: "random",
		length: Number.isFinite(parsedLength)
			? clamp(parsedLength, MIN_LENGTH, MAX_LENGTH)
			: 20,
		words: 4,
		includeNumbers: true,
		includeUppercase: true,
		includeSymbols: true,
		separator: "hyphens",
		capitalize: true,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function restoreSettingsFromValue(
	fallback: GeneratorSettings,
	saved: unknown,
): GeneratorSettings {
	if (!isRecord(saved)) return fallback;
	const parsedLength = Number(saved.length);
	const parsedWords = Number(saved.words);
	return {
		...fallback,
		type: saved.type === "passphrase" ? "passphrase" : "random",
		length: Number.isFinite(parsedLength)
			? clamp(parsedLength, MIN_LENGTH, MAX_LENGTH)
			: fallback.length,
		words: Number.isFinite(parsedWords)
			? clamp(parsedWords, MIN_WORDS, MAX_WORDS)
			: fallback.words,
		includeNumbers:
			typeof saved.includeNumbers === "boolean"
				? saved.includeNumbers
				: fallback.includeNumbers,
		includeUppercase:
			typeof saved.includeUppercase === "boolean"
				? saved.includeUppercase
				: fallback.includeUppercase,
		includeSymbols:
			typeof saved.includeSymbols === "boolean"
				? saved.includeSymbols
				: fallback.includeSymbols,
		separator: separators.includes(saved.separator as Separator)
			? (saved.separator as Separator)
			: fallback.separator,
		capitalize:
			typeof saved.capitalize === "boolean"
				? saved.capitalize
				: fallback.capitalize,
	};
}

function sameSettings(
	left: GeneratorSettings,
	right: GeneratorSettings,
): boolean {
	return (
		left.type === right.type &&
		left.length === right.length &&
		left.words === right.words &&
		left.includeNumbers === right.includeNumbers &&
		left.includeUppercase === right.includeUppercase &&
		left.includeSymbols === right.includeSymbols &&
		left.separator === right.separator &&
		left.capitalize === right.capitalize
	);
}

function restoreSettings(
	fallback: GeneratorSettings,
	raw: string | undefined,
): GeneratorSettings {
	if (!raw) return fallback;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return fallback;
		const storedDefaults = parsed.defaults;
		if (
			storedDefaults !== undefined &&
			!sameSettings(
				restoreSettingsFromValue(fallback, storedDefaults),
				fallback,
			)
		)
			return fallback;
		return restoreSettingsFromValue(fallback, parsed.settings ?? parsed);
	} catch {
		return fallback;
	}
}

function separatorLabel(separator: Separator): string {
	return separator.replace(/-/g, " ");
}

function nextSeparator(separator: Separator): Separator {
	const index = separators.indexOf(separator);
	return separators[(index + 1) % separators.length];
}

function settingsSummary(settings: GeneratorSettings): string {
	if (settings.type === "random") {
		return `${settings.length} characters · ${settings.includeUppercase ? "A-Z" : "no uppercase"} · ${settings.includeNumbers ? "0-9" : "no numbers"} · ${settings.includeSymbols ? "symbols" : "no symbols"}`;
	}
	return `${settings.words} words · ${settings.capitalize ? "capitalised" : "lowercase"} · ${settings.includeNumbers ? "with numbers" : "no numbers"} · ${separatorLabel(settings.separator)}`;
}

function optionsFor(settings: GeneratorSettings): PasswordOptions {
	return settings.type === "random"
		? {
				type: "random",
				length: settings.length,
				includeNumbers: settings.includeNumbers,
				includeUppercase: settings.includeUppercase,
				includeSymbols: settings.includeSymbols,
			}
		: {
				type: "passphrase",
				words: settings.words,
				includeNumbers: settings.includeNumbers,
				separator: settings.separator,
				capitalize: settings.capitalize,
			};
}

function strengthIcon(label: PasswordScore["label"] | undefined): Icon {
	switch (label) {
		case "Strong":
			return Icon.Shield01;
		case "Good":
			return Icon.CheckCircle;
		case "Weak":
			return Icon.Warning;
		case "Vulnerable":
			return Icon.XMarkCircle;
		default:
			return Icon.QuestionMarkCircle;
	}
}

function strengthSummary(
	score: PasswordScore | undefined,
	scoring: boolean,
): string {
	if (scoring) return "Scoring…";
	if (!score) return "Not scored";
	return `${score.label} (${Math.round(score.numericScore)}%)`;
}

function mask(value: string): string {
	return "•".repeat(Math.min(Math.max(value.length, 8), 24));
}

export default function Command() {
	const initial = useRef(defaultSettings()).current;
	const [settings, setSettings] = useState<GeneratorSettings>(initial);
	const [settingsLoaded, setSettingsLoaded] = useState(false);
	const [password, setPassword] = useState("");
	const [score, setScore] = useState<PasswordScore>();
	const [scoring, setScoring] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(true);
	const generationId = useRef(0);

	const generate = useCallback(async (next: GeneratorSettings) => {
		const currentGeneration = ++generationId.current;
		setLoading(true);
		setError(undefined);
		setScore(undefined);
		try {
			const value = await generatePassword(optionsFor(next));
			if (currentGeneration !== generationId.current) return;
			setPassword(value);
			setLoading(false);
			// Score the generated value with pass-cli; it is already in memory here.
			setScoring(true);
			try {
				const result = await scorePassword(value);
				if (currentGeneration === generationId.current) setScore(result);
			} catch {
				// Scoring is best-effort; a failure must not block generation.
			} finally {
				if (currentGeneration === generationId.current) setScoring(false);
			}
		} catch (reason: unknown) {
			if (currentGeneration === generationId.current) {
				setPassword("");
				setError(errorMessage(reason));
				setLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		let active = true;
		async function loadSettings(): Promise<void> {
			try {
				const raw = await LocalStorage.getItem<string>(GENERATOR_SETTINGS_KEY);
				const restored = restoreSettings(initial, raw);
				if (!active) return;
				setSettings(restored);
				setSettingsLoaded(true);
				void generate(restored);
			} catch {
				if (!active) return;
				setSettingsLoaded(true);
				void generate(initial);
			}
		}
		void loadSettings();
		return () => {
			active = false;
		};
	}, [generate, initial]);

	const updateSettings = useCallback(
		(change: (current: GeneratorSettings) => GeneratorSettings): void => {
			setSettings((current) => {
				const next = change(current);
				void LocalStorage.setItem(
					GENERATOR_SETTINGS_KEY,
					JSON.stringify({ defaults: initial, settings: next }),
				).catch(() => undefined);
				void generate(next);
				return next;
			});
		},
		[generate],
	);

	// The increase/decrease pair for a numeric setting (length or word count).
	// Both modes share this, so the handler and shortcut live in one place.
	const amountActions = (
		field: "length" | "words",
		label: string,
		value: number,
	) => {
		const [min, max] =
			field === "length" ? [MIN_LENGTH, MAX_LENGTH] : [MIN_WORDS, MAX_WORDS];
		const adjust = (delta: number) => () =>
			updateSettings((current) => ({
				...current,
				[field]: clamp(current[field] + delta, min, max),
			}));
		return (
			<>
				<Action
					title={`Increase ${label} (${clamp(value + 1, min, max)})`}
					icon={Icon.Plus}
					shortcut={{ key: "=", modifiers: ["ctrl"] }}
					onAction={adjust(1)}
				/>
				<Action
					title={`Decrease ${label} (${clamp(value - 1, min, max)})`}
					icon={Icon.Minus}
					shortcut={{ key: "-", modifiers: ["ctrl"] }}
					onAction={adjust(-1)}
				/>
			</>
		);
	};

	async function copy(): Promise<void> {
		if (!password) throw new Error("No password has been generated yet.");
		await copySecret("Password", password, { sensitive: true });
	}

	async function paste(): Promise<void> {
		if (!password) throw new Error("No password has been generated yet.");
		await pasteSecret(password);
	}

	async function copyAndGenerateNext(): Promise<void> {
		await copy();
		await generate(settings);
	}

	const penaltiesLabel =
		score && score.penalties.length > 0
			? score.penalties.map(penaltyLabel).join(", ")
			: "No penalties";

	// A List, not a Form: a Form swallows Enter for its own submit and traps
	// focus in its fields, so the action shortcuts never fire. The first action
	// (Paste Password) is the primary one and owns Enter.
	const actionPanel = (
		<ActionPanel>
			<ActionPanel.Section title="Actions">
				<Action
					title="Paste Password"
					icon={Icon.CopyClipboard}
					onAction={() => void safely(paste)}
				/>
				<Action
					title="Copy and Generate Next"
					icon={Icon.ArrowClockwise}
					shortcut={SHORTCUTS.copyAndGenerate}
					onAction={() => void safely(copyAndGenerateNext)}
				/>
				<Action
					title="Generate New Password"
					icon={Icon.Shuffle}
					shortcut={{ key: "r", modifiers: ["ctrl"] }}
					onAction={() => void safely(() => generate(settings))}
				/>
				<Action
					title={showPassword ? "Hide Password" : "Show Password"}
					icon={showPassword ? Icon.EyeDisabled : Icon.Eye}
					shortcut={{ key: "y", modifiers: ["ctrl"] }}
					onAction={() => setShowPassword((value) => !value)}
				/>
				<Action
					title={
						settings.type === "random"
							? "Switch to Passphrase"
							: "Switch to Random Password"
					}
					icon={Icon.Switch}
					shortcut={{ key: "t", modifiers: ["ctrl"] }}
					onAction={() =>
						updateSettings((current) => ({
							...current,
							type: current.type === "random" ? "passphrase" : "random",
						}))
					}
				/>
			</ActionPanel.Section>
			{settings.type === "random" ? (
				<ActionPanel.Section title="Random Password Settings">
					{amountActions("length", "Length", settings.length)}
					<Action
						title={
							settings.includeUppercase
								? "Disable Uppercase Letters"
								: "Enable Uppercase Letters"
						}
						icon={Icon.Text}
						onAction={() =>
							updateSettings((current) => ({
								...current,
								includeUppercase: !current.includeUppercase,
							}))
						}
					/>
					<Action
						title={
							settings.includeNumbers ? "Disable Numbers" : "Enable Numbers"
						}
						icon={Icon.Hashtag}
						onAction={() =>
							updateSettings((current) => ({
								...current,
								includeNumbers: !current.includeNumbers,
							}))
						}
					/>
					<Action
						title={
							settings.includeSymbols ? "Disable Symbols" : "Enable Symbols"
						}
						icon={Icon.Code}
						onAction={() =>
							updateSettings((current) => ({
								...current,
								includeSymbols: !current.includeSymbols,
							}))
						}
					/>
				</ActionPanel.Section>
			) : (
				<ActionPanel.Section title="Passphrase Settings">
					{amountActions("words", "Words", settings.words)}
					<Action
						title={
							settings.capitalize
								? "Disable Capitalisation"
								: "Enable Capitalisation"
						}
						icon={Icon.TextCursor}
						onAction={() =>
							updateSettings((current) => ({
								...current,
								capitalize: !current.capitalize,
							}))
						}
					/>
					<Action
						title={
							settings.includeNumbers ? "Disable Numbers" : "Enable Numbers"
						}
						icon={Icon.Hashtag}
						onAction={() =>
							updateSettings((current) => ({
								...current,
								includeNumbers: !current.includeNumbers,
							}))
						}
					/>
					<Action
						title={`Cycle Separator (${separatorLabel(settings.separator)})`}
						icon={Icon.Minus}
						onAction={() =>
							updateSettings((current) => ({
								...current,
								separator: nextSeparator(current.separator),
							}))
						}
					/>
				</ActionPanel.Section>
			)}
			<ActionPanel.Section title="Defaults">
				<Action
					title="Reset Generator Settings"
					icon={Icon.ArrowClockwise}
					onAction={() => updateSettings(() => defaultSettings())}
				/>
			</ActionPanel.Section>
		</ActionPanel>
	);

	return (
		<List
			isLoading={loading || !settingsLoaded}
			navigationTitle="Generate Proton Pass Password"
			searchBarPlaceholder="Generate a password…"
			searchBarAccessory={
				<List.Dropdown
					id="password-type"
					tooltip="Password type"
					value={settings.type}
					onChange={(value) =>
						updateSettings((current) => ({
							...current,
							type: value as PasswordType,
						}))
					}
				>
					<List.Dropdown.Item
						title="Random Password"
						value="random"
						icon={Icon.Shuffle}
					/>
					<List.Dropdown.Item
						title="Passphrase"
						value="passphrase"
						icon={Icon.Text}
					/>
				</List.Dropdown>
			}
		>
			{error ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="Unable to generate a password"
					description={error}
					actions={actionPanel}
				/>
			) : password ? (
				<>
					<List.Item
						icon={Icon.Key}
						title="Generated Password"
						subtitle={showPassword ? password : mask(password)}
						accessories={[
							{ text: settings.type === "random" ? "Random" : "Passphrase" },
							{
								icon: showPassword ? Icon.Eye : Icon.EyeDisabled,
								tooltip: showPassword ? "Visible" : "Hidden",
							},
						]}
						actions={actionPanel}
					/>
					<List.Item
						icon={strengthIcon(score?.label)}
						title="Password Strength"
						subtitle={penaltiesLabel}
						accessories={[{ text: strengthSummary(score, scoring) }]}
						actions={actionPanel}
					/>
					<List.Item
						icon={Icon.Cog}
						title="Generation Settings"
						subtitle={settingsSummary(settings)}
						actions={actionPanel}
					/>
				</>
			) : (
				!loading && (
					<List.EmptyView
						icon={Icon.Key}
						title="No password generated"
						description="Generate a new password using your selected settings."
						actions={actionPanel}
					/>
				)
			)}
		</List>
	);
}
