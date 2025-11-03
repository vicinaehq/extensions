import { exec } from "child_process";
import { promisify } from "util";
import { ExegolContainer } from "../models/ExegolContainer";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { existsSync } from "fs";
import { DEFAULT_CONFIG } from "./config";

const execPromise = promisify(exec);

const EXEGOL_PROFILES_PATH = "/.exegol/profiles.json";

export async function parseExegolProfiles(): Promise<Object> {
	const profileFilename = join(homedir(), EXEGOL_PROFILES_PATH);

	try {
		if (!(await existsSync(profileFilename))) {
			console.log("The 'profiles.json' doesn't exist. Creating it...");
			await writeFile(profileFilename, DEFAULT_CONFIG);
		}

		var profileData = await readFile(profileFilename, "utf-8");

		return JSON.parse(profileData);
	} catch (error) {
		console.log(error);
		return {};
	}
}

export function constructCommandFromExegolProfiles(
	profileData: { [key: string]: any },
	profileName: String,
): String[] {
	var cmd = [];

	for (var parameter in profileData[profileName]) {
		var parameterValue = profileData[profileName][parameter];

		if (parameter === "image") {
			continue;
		}

		if (typeof parameterValue === "string" && parameterValue !== "") {
			cmd.push(` --${parameter.replace(/_/g, "-")} '${parameterValue}'`);
		} else if (typeof parameterValue === "boolean" && parameterValue) {
			cmd.push(` --${parameter.replace(/_/g, "-")}`);
		}
	}

	return cmd;
}

export async function startExegolContainer(
	terminal: String,
	name: String,
	profileNewContainer: String,
	jsonProfileData: any,
) {
	if (profileNewContainer && jsonProfileData) {
		var cmdFromProfile = constructCommandFromExegolProfiles(
			jsonProfileData,
			profileNewContainer,
		);
		var startCmd = `exegol start ${cmdFromProfile.join("")} ${name} ${jsonProfileData[profileNewContainer]["image"]}`;
	} else {
		var startCmd = `exegol start ${name}`;
	}

	try {
		switch (terminal) {
			case "gnome":
				var cmd = `gnome-terminal -- bash -c "${startCmd}; exec bash"`;
				break;
			case "kitty":
				var cmd = `kitty ${startCmd}`;
				break;
			case "alacritty":
			case "ghostty":
			case "konsole":
				var cmd = `${terminal} -e 'exegol' ${startCmd.substring(startCmd.indexOf(" ") + 1)}`;
				break;
			case "custom":
				var { custom } = getPreferenceValues<Preferences>();
				custom = custom.replace("$EXEGOL_CMD$", `${startCmd}`);
				var cmd = `${custom}`;
				break;
			default:
				return;
		}

		await execPromise(cmd);
	} catch (error) {
		console.error("Error running Exegol containers:", error);
	}

	return;
}

export async function isDockerInstalled(): Promise<boolean> {
	try {
		await execPromise("docker -v");
		return true;
	} catch (error) {
		console.log(error);
		await showToast(
			Toast.Style.Failure,
			"Docker is not installed",
			"Docker must be installed in order to use Exegol and this extension",
		);
		return false;
	}
}

export async function isExegolInstalled(): Promise<boolean> {
	try {
		await execPromise("exegol -v");
		return true;
	} catch (error) {
		console.log(error);
		await showToast(
			Toast.Style.Failure,
			"Exegol is not installed",
			"Exegol must be installed in order to use this extension, you can install it from https://exegol.com/install",
		);
		return false;
	}
}

export async function listExegolContainers(): Promise<ExegolContainer[]> {
	try {
		if (!isDockerInstalled()) {
			return [];
		}

		const { stdout } = await execPromise(
			"docker ps --all --format '{{.Names}}' --filter \"name=^exegol-\" | cut -d '-' -f 2",
		);
		const lines = stdout.split("\n").map((l) => l.trim());
		const result: ExegolContainer[] = [];

		for (const line of lines) {
			if (line) {
				result.push({
					name: line,
				});
			}
		}

		return result;
	} catch (error) {
		console.error("Error listing Exegol containers:", error);
		return [];
	}
}
