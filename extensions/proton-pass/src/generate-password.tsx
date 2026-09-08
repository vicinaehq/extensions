import {
	Action,
	ActionPanel,
	Clipboard,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { renderErrorView } from "./lib/error-views";
import { generatePassword } from "./lib/pass-cli";
import { PassCliError, PasswordScore, PasswordType } from "./lib/types";
import {
	getPasswordStrengthIcon,
	getPasswordStrengthLabel,
	maskPassword,
	scorePassword,
} from "./lib/utils";

const MIN_RANDOM_LENGTH = 8;
const MAX_RANDOM_LENGTH = 128;
const MIN_PASSPHRASE_WORDS = 3;
const MAX_PASSPHRASE_WORDS = 10;
const DEFAULT_RANDOM_LENGTH = 20;
const DEFAULT_PASSPHRASE_WORDS = 4;

// UI separators map to pass-cli's `--separator` enum values.
const PASSPHRASE_SEPARATORS = ["-", "_", ".", " "] as const;
type PassphraseSeparator = (typeof PASSPHRASE_SEPARATORS)[number];

const SEPARATOR_TO_CLI: Record<PassphraseSeparator, string> = {
	"-": "hyphens",
	_: "underscores",
	".": "periods",
	" ": "spaces",
};

interface GeneratorSettings {
	type: PasswordType;
	length: number;
	words: number;
	includeNumbers: boolean;
	includeUppercase: boolean;
	includeSymbols: boolean;
	separator: PassphraseSeparator;
	capitalize: boolean;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function getInitialSettings(): GeneratorSettings {
	return {
		type: "random",
		length: DEFAULT_RANDOM_LENGTH,
		words: DEFAULT_PASSPHRASE_WORDS,
		includeNumbers: true,
		includeUppercase: true,
		includeSymbols: true,
		separator: "-",
		capitalize: true,
	};
}

function areSettingsEqual(a: GeneratorSettings, b: GeneratorSettings): boolean {
	return (
		a.type === b.type &&
		a.length === b.length &&
		a.words === b.words &&
		a.includeNumbers === b.includeNumbers &&
		a.includeUppercase === b.includeUppercase &&
		a.includeSymbols === b.includeSymbols &&
		a.separator === b.separator &&
		a.capitalize === b.capitalize
	);
}

function getSeparatorLabel(separator: PassphraseSeparator): string {
	return separator === " " ? "space" : separator;
}

function getSettingsSummary(settings: GeneratorSettings): string {
	if (settings.type === "random") {
		return `${settings.length} chars | ${settings.includeUppercase ? "A-Z" : "no A-Z"} | ${settings.includeNumbers ? "0-9" : "no 0-9"} | ${settings.includeSymbols ? "symbols" : "no symbols"}`;
	}

	return `${settings.words} words | ${settings.capitalize ? "capitalize" : "lowercase"} | ${settings.includeNumbers ? "with numbers" : "no numbers"} | separator: ${getSeparatorLabel(settings.separator)}`;
}

function getNextSeparator(separator: PassphraseSeparator): PassphraseSeparator {
	const index = PASSPHRASE_SEPARATORS.indexOf(separator);
	return PASSPHRASE_SEPARATORS[(index + 1) % PASSPHRASE_SEPARATORS.length];
}

export default function Command() {
	const defaultSettingsRef = useRef<GeneratorSettings>(getInitialSettings());
	const [password, setPassword] = useState("");
	const [score, setScore] = useState<PasswordScore | null>(null);
	const [settings, setSettings] = useState<GeneratorSettings>(
		defaultSettingsRef.current,
	);
	const [isLoading, setIsLoading] = useState(true);
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState<PassCliError | null>(null);
	const latestGenerationId = useRef(0);

	const generate = useCallback(async (nextSettings: GeneratorSettings) => {
		const generationId = ++latestGenerationId.current;
		setIsLoading(true);
		setError(null);

		try {
			const newPassword = await generatePassword({
				type: nextSettings.type,
				length:
					nextSettings.type === "random" ? nextSettings.length : undefined,
				words:
					nextSettings.type === "passphrase" ? nextSettings.words : undefined,
				includeNumbers: nextSettings.includeNumbers,
				includeUppercase:
					nextSettings.type === "random"
						? nextSettings.includeUppercase
						: undefined,
				includeSymbols:
					nextSettings.type === "random"
						? nextSettings.includeSymbols
						: undefined,
				separator:
					nextSettings.type === "passphrase"
						? SEPARATOR_TO_CLI[nextSettings.separator]
						: undefined,
				capitalize:
					nextSettings.type === "passphrase"
						? nextSettings.capitalize
						: undefined,
			});

			if (generationId !== latestGenerationId.current) return;

			setPassword(newPassword);
			setScore(scorePassword(newPassword));
		} catch (e) {
			if (generationId !== latestGenerationId.current) return;
			setError(
				e instanceof PassCliError
					? e
					: new PassCliError("Failed to generate password", "unknown"),
			);
		} finally {
			if (generationId === latestGenerationId.current) {
				setIsLoading(false);
			}
		}
	}, []);

	const updateSettings = useCallback(
		(updater: (previous: GeneratorSettings) => GeneratorSettings) => {
			setSettings((previous) => {
				const next = updater(previous);
				if (areSettingsEqual(previous, next)) return previous;
				void generate(next);
				return next;
			});
		},
		[generate],
	);

	useEffect(() => {
		void generate(defaultSettingsRef.current);
	}, [generate]);

	const errorView = renderErrorView(error, () => void generate(settings));
	if (errorView) return errorView;

	async function copyPassword() {
		if (!password) {
			await showToast(Toast.Style.Failure, "No password to copy");
			return;
		}
		await Clipboard.copy(password, { concealed: true });
		await showToast(Toast.Style.Success, "Password copied");
	}

	async function copyAndGenerate() {
		await copyPassword();
		await generate(settings);
	}

	const passwordTypeLabel =
		settings.type === "random" ? "Random" : "Passphrase";
	const generatedSizeLabel =
		settings.type === "random"
			? `${password.length} chars`
			: `${settings.words} words`;
	const strengthLabel = score
		? getPasswordStrengthLabel(score.passwordScore)
		: "Not scored";

	const actionPanel = (
		<ActionPanel>
			<Action
				title="Copy Password"
				icon={Icon.CopyClipboard}
				onAction={copyPassword}
			/>
			<Action
				title="Copy and Generate Next"
				icon={Icon.ArrowClockwise}
				onAction={copyAndGenerate}
			/>
			<Action
				title="Generate New Password"
				icon={Icon.Shuffle}
				shortcut={{ modifiers: ["cmd"], key: "r" }}
				onAction={() => void generate(settings)}
			/>
			<Action
				title={showPassword ? "Hide Password" : "Show Password"}
				icon={showPassword ? Icon.EyeDisabled : Icon.Eye}
				shortcut={{ modifiers: ["cmd"], key: "y" }}
				onAction={() => setShowPassword((visible) => !visible)}
			/>
			<Action
				title={
					settings.type === "random"
						? "Switch to Passphrase"
						: "Switch to Random Password"
				}
				icon={Icon.Switch}
				shortcut={{ modifiers: ["cmd"], key: "t" }}
				onAction={() =>
					updateSettings((previous) => ({
						...previous,
						type: previous.type === "random" ? "passphrase" : "random",
					}))
				}
			/>

			{settings.type === "random" ? (
				<ActionPanel.Section title="Random Password Settings">
					<Action
						title={`Increase Length (${settings.length})`}
						icon={Icon.Plus}
						onAction={() =>
							updateSettings((previous) => ({
								...previous,
								length: clamp(
									previous.length + 1,
									MIN_RANDOM_LENGTH,
									MAX_RANDOM_LENGTH,
								),
							}))
						}
					/>
					<Action
						title={`Decrease Length (${settings.length})`}
						icon={Icon.Minus}
						onAction={() =>
							updateSettings((previous) => ({
								...previous,
								length: clamp(
									previous.length - 1,
									MIN_RANDOM_LENGTH,
									MAX_RANDOM_LENGTH,
								),
							}))
						}
					/>
					<Action
						title={
							settings.includeNumbers ? "Disable Numbers" : "Enable Numbers"
						}
						icon={Icon.Hashtag}
						onAction={() =>
							updateSettings((previous) => ({
								...previous,
								includeNumbers: !previous.includeNumbers,
							}))
						}
					/>
					<Action
						title={
							settings.includeUppercase
								? "Disable Uppercase Letters"
								: "Enable Uppercase Letters"
						}
						icon={Icon.Text}
						onAction={() =>
							updateSettings((previous) => ({
								...previous,
								includeUppercase: !previous.includeUppercase,
							}))
						}
					/>
					<Action
						title={
							settings.includeSymbols ? "Disable Symbols" : "Enable Symbols"
						}
						icon={Icon.Code}
						onAction={() =>
							updateSettings((previous) => ({
								...previous,
								includeSymbols: !previous.includeSymbols,
							}))
						}
					/>
				</ActionPanel.Section>
			) : (
				<ActionPanel.Section title="Passphrase Settings">
					<Action
						title={`Increase Words (${settings.words})`}
						icon={Icon.Plus}
						onAction={() =>
							updateSettings((previous) => ({
								...previous,
								words: clamp(
									previous.words + 1,
									MIN_PASSPHRASE_WORDS,
									MAX_PASSPHRASE_WORDS,
								),
							}))
						}
					/>
					<Action
						title={`Decrease Words (${settings.words})`}
						icon={Icon.Minus}
						onAction={() =>
							updateSettings((previous) => ({
								...previous,
								words: clamp(
									previous.words - 1,
									MIN_PASSPHRASE_WORDS,
									MAX_PASSPHRASE_WORDS,
								),
							}))
						}
					/>
					<Action
						title={
							settings.capitalize
								? "Disable Capitalization"
								: "Enable Capitalization"
						}
						icon={Icon.TextCursor}
						onAction={() =>
							updateSettings((previous) => ({
								...previous,
								capitalize: !previous.capitalize,
							}))
						}
					/>
					<Action
						title={
							settings.includeNumbers ? "Disable Numbers" : "Enable Numbers"
						}
						icon={Icon.Hashtag}
						onAction={() =>
							updateSettings((previous) => ({
								...previous,
								includeNumbers: !previous.includeNumbers,
							}))
						}
					/>
					<Action
						title={`Cycle Separator (${getSeparatorLabel(settings.separator)})`}
						icon={Icon.Minus}
						onAction={() =>
							updateSettings((previous) => ({
								...previous,
								separator: getNextSeparator(previous.separator),
							}))
						}
					/>
				</ActionPanel.Section>
			)}

			<ActionPanel.Section title="Defaults">
				<Action
					title="Reset Generator Settings"
					icon={Icon.ArrowClockwise}
					onAction={() => updateSettings(() => getInitialSettings())}
				/>
			</ActionPanel.Section>
		</ActionPanel>
	);

	const typeSelector = (
		<List.Dropdown
			tooltip="Password Type"
			value={settings.type}
			onChange={(value) =>
				updateSettings((previous) => ({
					...previous,
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
	);

	const penaltiesLabel =
		score && score.penalties && score.penalties.length > 0
			? `${score.penalties.length} ${score.penalties.length === 1 ? "penalty" : "penalties"}`
			: "No penalties";

	return (
		<List isLoading={isLoading} searchBarAccessory={typeSelector}>
			{password ? (
				<>
					<List.Item
						icon={Icon.Key}
						title="Generated Password"
						subtitle={showPassword ? password : maskPassword(password)}
						accessories={[
							{ text: passwordTypeLabel },
							{ text: generatedSizeLabel },
							{ icon: showPassword ? Icon.Eye : Icon.EyeDisabled },
							{
								icon: getPasswordStrengthIcon(strengthLabel),
								text: strengthLabel,
							},
						]}
						actions={actionPanel}
					/>
					<List.Item
						icon={Icon.Cog}
						title="Generation Settings"
						subtitle={getSettingsSummary(settings)}
						actions={actionPanel}
					/>
					{score && (
						<List.Item
							icon={getPasswordStrengthIcon(score.passwordScore)}
							title="Password Strength"
							subtitle={strengthLabel}
							accessories={[
								{ text: String(Math.round(score.numericScore)) },
								{ text: penaltiesLabel },
							]}
							actions={actionPanel}
						/>
					)}
				</>
			) : (
				!isLoading && (
					<List.EmptyView
						icon={Icon.Key}
						title="No Password Generated"
						description="Generate a new password using your selected settings."
						actions={actionPanel}
					/>
				)
			)}
		</List>
	);
}
