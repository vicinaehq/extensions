import {
	Action,
	ActionPanel,
	Form,
	Icon,
	showToast,
	Toast,
} from "@vicinae/api";
import { useState } from "react";
import { type PasswordScore, penaltyLabel, scorePassword } from "./pass-cli";

function summary(score: PasswordScore): string {
	const pct = Math.round(score.numericScore);
	const glyph =
		score.label === "Strong"
			? "🟢"
			: score.label === "Good"
				? "🔵"
				: score.label === "Weak"
					? "🟠"
					: score.label === "Vulnerable"
						? "🔴"
						: "⚪";
	return `${glyph} ${score.label} — ${pct}%`;
}

export default function Command() {
	const [score, setScore] = useState<PasswordScore>();
	const [checking, setChecking] = useState(false);
	const [error, setError] = useState<string>();

	async function check(values: { password?: string }): Promise<void> {
		const password = values.password ?? "";
		if (!password) {
			setScore(undefined);
			setError(undefined);
			return;
		}
		setChecking(true);
		setError(undefined);
		try {
			const result = await scorePassword(password);
			setScore(result);
			if (!result) setError("pass-cli returned no score for this password.");
		} catch (reason: unknown) {
			setScore(undefined);
			setError(reason instanceof Error ? reason.message : String(reason));
			await showToast({
				style: Toast.Style.Failure,
				title: "Unable to score password",
				message: reason instanceof Error ? reason.message : String(reason),
			});
		} finally {
			setChecking(false);
		}
	}

	return (
		<Form
			navigationTitle="Check Password Strength"
			isLoading={checking}
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Check Strength"
						icon={Icon.Shield01}
						onSubmit={(values) => void check(values as { password?: string })}
					/>
				</ActionPanel>
			}
		>
			<Form.PasswordField
				id="password"
				title="Password"
				placeholder="Type or paste a password to score"
				info="The password is sent to pass-cli as a command argument to compute the score."
			/>
			{score && (
				<>
					<Form.Separator />
					<Form.Description title="Strength" text={summary(score)} />
					<Form.Description
						title="Weaknesses"
						text={
							score.penalties.length === 0
								? "None detected"
								: score.penalties.map(penaltyLabel).join("\n")
						}
					/>
				</>
			)}
			{error && <Form.Description title="Error" text={error} />}
		</Form>
	);
}
