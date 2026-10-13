import { type LaunchProps, showToast, showHUD, Toast } from "@vicinae/api";
import { apply, fail } from "./lib/cli.ts";

export default async function Command(props: LaunchProps<{ arguments: { hold?: string } }>) {
	const raw = props.arguments?.hold?.trim();
	const args = ["reveal"];

	if (raw) {
		const seconds = Number(raw);
		if (!Number.isFinite(seconds) || seconds < 0 || seconds > 300) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Abendrot",
				message: "Hold must be a number from 0 to 300 seconds",
			});
			return;
		}
		args.push("--hold", String(seconds));
	}

	try {
		await apply(args);
		await showHUD(raw ? `Revealing true color for ${Number(raw)}s` : "Revealing true color");
	} catch (error) {
		// `reveal` is live-only: exit 3 arrives as "The Abendrot app is not running".
		await fail(error);
	}
}