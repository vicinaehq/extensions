import { useEffect, useState } from "react";
import {
	Action,
	ActionPanel,
	Form,
	Icon,
	type LaunchProps,
	popToRoot,
	showHUD,
} from "@vicinae/api";
import { apply, fail } from "./lib/cli.ts";
import { describeWarmth, parseWarmth, warmthArgs } from "./lib/warmth.ts";

const HINT =
	"Strength from 0.0 (none) to 1.0 (warmest), or Kelvin from 500 to 6500. Lower Kelvin is warmer.";
const INVALID = "Enter a strength from 0.0 to 1.0, or Kelvin from 500 to 6500 (e.g. 0.8 or 3000)";

export default function Command(props: LaunchProps<{ arguments: { warmth?: string } }>) {
	const initial = props.arguments?.warmth?.trim() ?? "";
	const [error, setError] = useState<string | undefined>(undefined);
	const [autoSubmitted, setAutoSubmitted] = useState(false);

	const submit = async (raw: string): Promise<void> => {
		const value = parseWarmth(raw);
		if (!value) {
			setError(INVALID);
			return;
		}
		try {
			const result = await apply(warmthArgs(value));
			await showHUD(
				result.appliedLive === false
					? `Warmth saved as ${describeWarmth(value)}; app is not running`
					: `Warmth set to ${describeWarmth(value)}`,
			);
			await popToRoot();
		} catch (cause) {
			await fail(cause);
		}
	};

	// Launched with an argument: apply it directly instead of showing the form.
	useEffect(() => {
		if (!initial || autoSubmitted) return;
		setAutoSubmitted(true);
		void submit(initial);
	}, [initial, autoSubmitted]);

	return (
		<Form
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Set Warmth"
						icon={Icon.Moon}
						onSubmit={async (values) => submit(String(values.warmth ?? ""))}
					/>
				</ActionPanel>
			}
		>
			<Form.TextField
				id="warmth"
				title="Warmth"
				placeholder="0.8 or 3000"
				autoFocus={initial === ""}
				defaultValue={initial}
				error={error}
				onChange={() => setError(undefined)}
			/>
			<Form.Description text={HINT} />
		</Form>
	);
}