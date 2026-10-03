import {
	Action,
	ActionPanel,
	Form,
	getPreferenceValues,
	Icon,
	showToast,
	Toast,
} from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { copySecret } from "./actions";
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
		length: Number.isFinite(parsedLength) ? clamp(parsedLength, 8, 128) : 20,
		words: 4,
		includeNumbers: true,
		includeUppercase: true,
		includeSymbols: true,
		separator: "hyphens",
		capitalize: true,
	};
}

function separatorLabel(separator: Separator): string {
	return separator.replace(/-/g, " ");
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

function strengthGlyph(label: PasswordScore["label"]): string {
	switch (label) {
		case "Strong":
			return "🟢";
		case "Good":
			return "🔵";
		case "Weak":
			return "🟠";
		case "Vulnerable":
			return "🔴";
		default:
			return "⚪";
	}
}

function strengthSummary(
	score: PasswordScore | undefined,
	loading: boolean,
): string {
	if (loading) return "Scoring…";
	if (!score) return "Waiting for pass-cli…";
	const pct = Math.round(score.numericScore);
	const base = `${strengthGlyph(score.label)} ${score.label} (${pct}%)`;
	if (score.penalties.length === 0) return base;
	return `${base} — ${score.penalties.map(penaltyLabel).join(", ")}`;
}

export default function Command() {
	const initial = useRef(defaultSettings()).current;
	const [settings, setSettings] = useState(initial);
	const [password, setPassword] = useState("");
	const [score, setScore] = useState<PasswordScore>();
	const [scoring, setScoring] = useState(false);
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
				setError(reason instanceof Error ? reason.message : String(reason));
				setLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		void generate(initial);
	}, [generate, initial]);

	function updateSettings(
		change: (current: GeneratorSettings) => GeneratorSettings,
	): void {
		const next = change(settings);
		setSettings(next);
		void generate(next);
	}

	async function copy(): Promise<void> {
		if (!password) return;
		await copySecret("Password", password, { sensitive: true });
	}

	async function copyAndGenerate(): Promise<void> {
		await copy();
		await generate(settings);
	}

	async function safely(action: () => Promise<void>): Promise<void> {
		try {
			await action();
		} catch (reason: unknown) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Password action failed",
				message: reason instanceof Error ? reason.message : String(reason),
			});
		}
	}

	function updateLength(value: string): void {
		const parsed = Number.parseInt(value, 10);
		if (Number.isFinite(parsed))
			updateSettings((current) => ({
				...current,
				length: clamp(parsed, 8, 128),
			}));
	}

	function updateWords(value: string): void {
		const parsed = Number.parseInt(value, 10);
		if (Number.isFinite(parsed))
			updateSettings((current) => ({
				...current,
				words: clamp(parsed, 3, 10),
			}));
	}

	return (
		<Form
			navigationTitle="Generate Proton Pass Password"
			isLoading={loading}
			actions={
				<ActionPanel>
					<Action
						title="Copy Password"
						icon={Icon.CopyClipboard}
						shortcut={{ key: "return", modifiers: [] }}
						onAction={() => void safely(copy)}
					/>
					<Action
						title="Copy and Generate Next"
						icon={Icon.ArrowClockwise}
						onAction={() => void safely(copyAndGenerate)}
					/>
					<Action
						title="Generate New Password"
						icon={Icon.Shuffle}
						shortcut={{ key: "return", modifiers: ["ctrl"] }}
						onAction={() => void safely(() => generate(settings))}
					/>
				</ActionPanel>
			}
		>
			<Form.Description
				title="Generated password"
				text={password || "Generating password…"}
			/>
			<Form.Description
				title="Strength"
				text={strengthSummary(score, scoring)}
			/>
			<Form.Description
				title="Current settings"
				text={settingsSummary(settings)}
			/>
			{error && <Form.Description title="Error" text={error} />}

			<Form.Separator />
			<Form.Dropdown
				id="type"
				title="Password type"
				value={settings.type}
				onChange={(value) =>
					updateSettings((current) => ({
						...current,
						type: value as PasswordType,
					}))
				}
			>
				<Form.Dropdown.Item title="Random password" value="random" />
				<Form.Dropdown.Item title="Passphrase" value="passphrase" />
			</Form.Dropdown>

			{settings.type === "random" ? (
				<>
					<Form.TextField
						id="length"
						title="Character count"
						defaultValue={String(settings.length)}
						info="8–128 characters; applied when you leave the field"
						onBlur={(event) =>
							updateLength(String(event.target.value ?? settings.length))
						}
					/>
					<Form.Checkbox
						id="uppercase"
						label="Include uppercase letters"
						value={settings.includeUppercase}
						onChange={(value) =>
							updateSettings((current) => ({
								...current,
								includeUppercase: value,
							}))
						}
					/>
					<Form.Checkbox
						id="numbers"
						label="Include numbers"
						value={settings.includeNumbers}
						onChange={(value) =>
							updateSettings((current) => ({
								...current,
								includeNumbers: value,
							}))
						}
					/>
					<Form.Checkbox
						id="symbols"
						label="Include symbols"
						value={settings.includeSymbols}
						onChange={(value) =>
							updateSettings((current) => ({
								...current,
								includeSymbols: value,
							}))
						}
					/>
				</>
			) : (
				<>
					<Form.TextField
						id="words"
						title="Word count"
						defaultValue={String(settings.words)}
						info="3–10 words; applied when you leave the field"
						onBlur={(event) =>
							updateWords(String(event.target.value ?? settings.words))
						}
					/>
					<Form.Dropdown
						id="separator"
						title="Separator"
						value={settings.separator}
						onChange={(value) =>
							updateSettings((current) => ({
								...current,
								separator: value as Separator,
							}))
						}
					>
						{separators.map((separator) => (
							<Form.Dropdown.Item
								key={separator}
								title={separatorLabel(separator)}
								value={separator}
							/>
						))}
					</Form.Dropdown>
					<Form.Checkbox
						id="capitalize"
						label="Capitalise words"
						value={settings.capitalize}
						onChange={(value) =>
							updateSettings((current) => ({ ...current, capitalize: value }))
						}
					/>
					<Form.Checkbox
						id="passphraseNumbers"
						label="Include numbers"
						value={settings.includeNumbers}
						onChange={(value) =>
							updateSettings((current) => ({
								...current,
								includeNumbers: value,
							}))
						}
					/>
				</>
			)}
		</Form>
	);
}
