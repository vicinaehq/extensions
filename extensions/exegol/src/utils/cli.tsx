import { exec } from "child_process";
import { promisify } from "util";
import { ExegolContainer } from "../models/ExegolContainer";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { getPreferenceValues } from "@vicinae/api";
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

export async function listExegolContainers(): Promise<ExegolContainer[]> {
	try {
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
