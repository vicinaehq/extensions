import { closeMainWindow, showToast, Toast } from "@vicinae/api";
import { execSync } from "node:child_process";

function toggleViaGsettings() {
	const uid = process.getuid?.() ?? 1000;
	const env = {
		...process.env,
		DBUS_SESSION_BUS_ADDRESS:
			process.env.DBUS_SESSION_BUS_ADDRESS ??
			`unix:path=/run/user/${uid}/bus`,
	};

	const get = (cmd: string) =>
		execSync(cmd, { env, encoding: "utf-8" }).trim();

	const schema = "org.gnome.desktop.interface";
	const key = "color-scheme";

	const current = get(`gsettings get ${schema} ${key}`);
	const next = current === "'prefer-dark'" ? "prefer-light" : "prefer-dark";

	execSync(`gsettings set ${schema} ${key} ${next}`, { env });

	return next;
}

export default async function ToggleTheme() {
	try {
		const overrideCmd = process.env.VICINAE_TOGGLE_THEME_CMD;
		let newTheme: string;

		if (overrideCmd) {
			execSync(overrideCmd);
			newTheme = "toggled";
		} else {
			newTheme = toggleViaGsettings();
		}

		await showToast({
			title: `Switched to ${newTheme === "prefer-dark" ? "dark" : newTheme === "prefer-light" ? "light" : newTheme} mode`,
			style: Toast.Style.Success,
		});
	} catch (error) {
		await showToast({
			title: "Failed to toggle theme",
			message: error instanceof Error ? error.message : String(error),
			style: Toast.Style.Failure,
		});
	}

	await closeMainWindow();
}
