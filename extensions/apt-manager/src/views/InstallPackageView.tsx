import {
	Action,
	ActionPanel,
	Form,
	Icon,
	Toast,
	showToast,
	useNavigation,
} from "@vicinae/api";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname } from "node:path";
import { useState } from "react";
import { RunResult } from "../components/RunResult";
import { installAppImage, installDesktopFile } from "../lib/appimage";
import { type OperationResult, runPrivilegedApGet } from "../lib/apt";
import {
	flatpakInstallationFlag,
	hasFlatpakBinary,
	runFlatpakCommand,
} from "../lib/flatpakRemotes";

type PackageFileKind = "appimage" | "deb" | "flatpak";

function expandPath(input: string): string {
	let path = input.trim();
	if (path.startsWith("~/")) path = `${homedir()}${path.slice(1)}`;
	path = path.replace(/^~(?=$|[/])/, homedir());
	return path;
}

function packageKindFromPath(path: string): PackageFileKind | null {
	const ext = extname(path).toLowerCase();
	if (ext === ".appimage") return "appimage";
	if (ext === ".deb") return "deb";
	if (ext === ".flatpak") return "flatpak";
	return null;
}

export function InstallPackageView() {
	const { pop, push } = useNavigation();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [desktopLocation, setDesktopLocation] = useState<"user" | "system">("user");
	const [inputValue, setInputValue] = useState("");
	const [remoteName, setRemoteName] = useState("flathub");

	const input = String(inputValue).trim();
	const kind = packageKindFromPath(expandPath(input)) ?? null;

	const showRunResult = (
		heading: string,
		result: OperationResult,
		sudoArgs?: string[],
		sudoCommand?: string,
	) => {
		push(
			<RunResult
				heading={heading}
				title={heading}
				result={result}
				sudoArgs={sudoArgs}
				sudoCommand={sudoCommand}
			/>,
		);
	};

	const onSubmit = async () => {
		if (!input) {
			await showToast({
				style: Toast.Style.Failure,
				title: "A file path is required",
			});
			return;
		}
		const path = expandPath(input);
		if (!existsSync(path)) {
			await showToast({
				style: Toast.Style.Failure,
				title: "File not found",
				message: path,
			});
			return;
		}
		const fileKind = packageKindFromPath(path);
		if (!fileKind) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Unsupported file type",
				message: "Choose an .AppImage, .deb, or .flatpak file",
			});
			return;
		}
		setIsSubmitting(true);

		if (fileKind === "appimage") {
			const toast = await showToast({
				style: Toast.Style.Animated,
				title: "Installing AppImage",
			});
			const result = await installAppImage(path);
			if (!result.ok) {
				toast.style = Toast.Style.Failure;
				toast.title = "Installation failed";
				toast.message = result.error ?? undefined;
				setIsSubmitting(false);
				return;
			}
			const desktopResult = result.targetPath
				? await installDesktopFile(result.targetPath, desktopLocation, result.info)
				: { ok: false, error: "No target path" };
			if (!desktopResult.ok) {
				toast.style = Toast.Style.Failure;
				toast.title = "AppImage installed but desktop entry failed";
				toast.message = desktopResult.error ?? undefined;
			} else {
				toast.style = Toast.Style.Success;
				toast.title = "AppImage installed";
				if (result.hasMetadata === false) {
					toast.message =
						"Could not read AppImage metadata; icon and update info unavailable";
				} else {
					toast.message = `Installed in ${desktopLocation} desktop entry`;
				}
			}
			setIsSubmitting(false);
			pop();
			return;
		}

		const fileLabel = basename(path);
		if (fileKind === "deb") {
			const label = `Install ${fileLabel}`;
			const toast = await showToast({ style: Toast.Style.Animated, title: label });
			const result = await runPrivilegedApGet(["install", "-y", path], label);
			setIsSubmitting(false);
			if (result.ok) {
				toast.style = Toast.Style.Success;
				toast.title = `${fileLabel} installed`;
			} else {
				toast.style = Toast.Style.Failure;
				toast.title = `${label} failed`;
				toast.message =
					result.stderr.trim().slice(0, 140) ||
					`exit code ${result.code ?? "unknown"}`;
			}
			showRunResult(label, result, ["install", "-y", path]);
			pop();
			return;
		}

		if (!hasFlatpakBinary()) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Flatpak is not installed",
				message: "Install the flatpak package to install .flatpak files",
			});
			setIsSubmitting(false);
			return;
		}
		const remote = String(remoteName).trim() || "flathub";
		const label = `Install ${fileLabel}`;
		const toast = await showToast({ style: Toast.Style.Animated, title: label });
		const result = await runFlatpakCommand(
			"system",
			[
				"install",
				flatpakInstallationFlag("system"),
				"-y",
				remote,
				path,
			],
			label,
		);
		setIsSubmitting(false);
		if (result.ok) {
			toast.style = Toast.Style.Success;
			toast.title = `${fileLabel} installed`;
		} else {
			toast.style = Toast.Style.Failure;
			toast.title = `${label} failed`;
			toast.message =
				result.stderr.trim().slice(0, 140) ||
				`exit code ${result.code ?? "unknown"}`;
		}
		showRunResult(label, result, ["install", "-y", remote, path], "flatpak");
		pop();
	};

	return (
		<Form
			navigationTitle="Install Package"
			isLoading={isSubmitting}
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Install"
						icon={Icon.Plus}
						onSubmit={onSubmit}
					/>
				</ActionPanel>
			}
		>
			<Form.TextField
				id="input"
				title="File Path"
				placeholder="/path/to/MyApp.AppImage"
				info="Path to an .AppImage, .deb, or .flatpak file. The file is installed with the matching method (AppImage copy, apt for .deb, flatpak for .flatpak)."
				value={inputValue}
				onChange={(value) => setInputValue(String(value))}
				autoFocus
			/>
			{kind === "appimage" ? (
				<Form.Dropdown
					id="location"
					title="Desktop Entry Location"
					value={desktopLocation}
					onChange={(value) =>
						setDesktopLocation(String(value) as "user" | "system")
					}
				>
					<Form.Dropdown.Item
						title="User (~/.local/share/applications)"
						value="user"
					/>
					<Form.Dropdown.Item
						title="System (/usr/share/applications)"
						value="system"
					/>
				</Form.Dropdown>
			) : null}
			{kind === "flatpak" ? (
				<Form.TextField
					id="remote"
					title="Flatpak Remote"
					placeholder="flathub"
					info="Remote used to resolve the bundle's dependencies."
					value={remoteName}
					onChange={(value) => setRemoteName(String(value))}
				/>
			) : null}
		</Form>
	);
}