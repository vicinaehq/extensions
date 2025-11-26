import { execPromise } from "./exec";

export const isRecording = async (): Promise<boolean> => {
	try {
		// Check for wf-recorder processes
		const { stdout: wfRecorder } = await execPromise("pgrep -f wf-recorder");
		if (wfRecorder.trim()) return true;

		// Check for webcam overlay (ffplay with WebcamOverlay window)
		const { stdout: webcamOverlay } = await execPromise(
			"pgrep -f 'WebcamOverlay'",
		);
		if (webcamOverlay.trim()) return true;

		// Check for OBS processes
		const { stdout: obs } = await execPromise("pgrep -f obs");
		if (obs.trim()) return true;

		// Check for other common screen recording tools
		const { stdout: other } = await execPromise(
			"pgrep -f 'ffmpeg.*-f x11grab'",
		);
		if (other.trim()) return true;

		return false;
	} catch {
		return false;
	}
};

export const startRecording = async (
	options: {
		audio?: boolean;
		webcam?: boolean;
		audioDevice?: string;
		cameraDevice?: string;
		output?: string;
		region?: string;
	} = {},
): Promise<string> => {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const defaultOutput = `~/Videos/recording-${timestamp}.mp4`;
	const outputFile = options.output || defaultOutput;

	// If webcam is requested, start webcam overlay first
	if (options.webcam) {
		await startWebcamOverlay(options.cameraDevice);
	}

	let command = "wf-recorder";

	// Add audio support with optional device selection
	if (options.audio) {
		if (options.audioDevice) {
			command += ` --audio=${options.audioDevice}`;
		} else {
			command += " --audio";
		}
	}

	// Add region selection if specified
	if (options.region) {
		command += ` -g ${options.region}`;
	}

	// Add output file
	command += ` -f ${outputFile}`;

	// Start recording in background
	await execPromise(`${command} &`);
	return outputFile;
};

const startWebcamOverlay = async (cameraDevice?: string): Promise<void> => {
	// Clean up any existing webcam overlay
	await execPromise("pkill -f 'WebcamOverlay'").catch(() => {
		// Ignore if no process exists
	});

	const device = cameraDevice || "/dev/video0";

	// Try to get monitor scale (for Hyprland)
	let scale = 1.0;
	try {
		const { stdout } = await execPromise(
			"hyprctl monitors -j | jq -r '.[] | select(.focused == true) | .scale'",
		);
		const parsedScale = parseFloat(stdout.trim());
		if (!isNaN(parsedScale) && parsedScale > 0) {
			scale = parsedScale;
		}
	} catch {
		// If hyprctl/jq not available, use default scale of 1.0
	}

	// Target width (base 360px, scaled to monitor)
	const targetWidth = Math.round(360 * scale);

	// Try to detect available video formats and resolutions
	let videoSizeArg = "";
	try {
		const { stdout } = await execPromise(
			`v4l2-ctl --list-formats-ext -d ${device} 2>/dev/null`,
		);
		const preferredResolutions = ["640x360", "1280x720", "1920x1080"];
		for (const resolution of preferredResolutions) {
			if (stdout.includes(resolution)) {
				videoSizeArg = `-video_size ${resolution}`;
				break;
			}
		}
	} catch {
		// If v4l2-ctl fails, ffplay will auto-detect
	}

	// Start ffplay to show webcam as overlay window
	// The window will be recorded by wf-recorder as part of the screen
	const ffplayArgs = [
		"ffplay",
		"-f v4l2",
		videoSizeArg,
		"-framerate 30",
		device,
		`-vf "scale=${targetWidth}:-1"`,
		'-window_title "WebcamOverlay"',
		"-noborder",
		"-fflags nobuffer -flags low_delay",
		"-probesize 32 -analyzeduration 0",
		"-loglevel quiet",
	].filter((arg) => arg !== "");

	// Run ffplay in background
	await execPromise(`${ffplayArgs.join(" ")} > /dev/null 2>&1 &`);

	// Wait a moment for ffplay to start and show the window
	await new Promise((resolve) => setTimeout(resolve, 1000));
};

export const stopRecording = async (): Promise<void> => {
	try {
		// Try to stop wf-recorder gracefully first
		await execPromise("pkill -SIGINT wf-recorder");

		// Stop webcam overlay (ffplay)
		await execPromise("pkill -f 'WebcamOverlay'").catch(() => {
			// Ignore if no webcam overlay is running
		});

		// Wait a moment for graceful shutdown
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Force kill if still running
		await execPromise("pkill wf-recorder");
		await execPromise("pkill -f 'WebcamOverlay'");
	} catch {
		// If process doesn't exist, that's fine
	}
};

export interface AudioDevice {
	id: string;
	name: string;
}

export interface CameraDevice {
	id: string;
	name: string;
}

export const getAvailableAudioSources = async (): Promise<AudioDevice[]> => {
	try {
		const { stdout } = await execPromise("pactl list sources");
		const devices: AudioDevice[] = [];
		const lines = stdout.split("\n");

		let currentId: string | null = null;
		let currentDescription: string | null = null;

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith("Name: ")) {
				// Save previous device if we have one
				if (currentId && currentDescription) {
					devices.push({
						id: currentId,
						name: currentDescription,
					});
				}
				currentId = trimmed.replace("Name: ", "").trim();
				currentDescription = null;
			} else if (trimmed.startsWith("Description: ")) {
				currentDescription = trimmed.replace("Description: ", "").trim();
			}
		}

		// Don't forget the last device
		if (currentId && currentDescription) {
			devices.push({
				id: currentId,
				name: currentDescription,
			});
		}

		return devices;
	} catch {
		return [];
	}
};

const hasVideoCaptureCapability = async (
	devicePath: string,
): Promise<boolean> => {
	try {
		const { stdout } = await execPromise(
			`v4l2-ctl --device=${devicePath} --all 2>&1`,
		);
		// Check if "Device Caps" section contains "Video Capture"
		const lines = stdout.split("\n");
		let inDeviceCaps = false;
		for (const line of lines) {
			if (line.includes("Device Caps")) {
				inDeviceCaps = true;
			} else if (inDeviceCaps && line.trim().startsWith("Video Capture")) {
				return true;
			} else if (inDeviceCaps && line.trim() && !line.includes("\t")) {
				// Moved to next section
				break;
			}
		}
		return false;
	} catch {
		return false;
	}
};

export const getAvailableCameras = async (): Promise<CameraDevice[]> => {
	try {
		// Try v4l2-ctl first for better names
		try {
			const { stdout } = await execPromise("v4l2-ctl --list-devices");
			const deviceCandidates: Array<{ path: string; name: string }> = [];
			const lines = stdout.split("\n");

			let currentName: string | null = null;

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;

				// Device name line (doesn't start with /dev/)
				if (!trimmed.startsWith("/dev/") && !trimmed.startsWith("\t")) {
					currentName = trimmed.replace(/^(.+?):.*$/, "$1").trim();
				}
				// Device path line
				else if (trimmed.startsWith("/dev/video") && currentName) {
					const devicePath = trimmed.split(/\s+/)[0];
					deviceCandidates.push({
						path: devicePath,
						name: currentName,
					});
				}
			}

			// Filter devices to only include those with Video Capture capability
			const devices: CameraDevice[] = [];
			for (const candidate of deviceCandidates) {
				if (await hasVideoCaptureCapability(candidate.path)) {
					devices.push({
						id: candidate.path,
						name: candidate.name,
					});
				}
			}

			if (devices.length > 0) {
				return devices;
			}
		} catch {
			// Fall through to alternative method
		}

		// Fallback: use /dev/video* with generic names, but still filter by capability
		const { stdout } = await execPromise("ls /dev/video*");
		const allDevices = stdout
			.split("\n")
			.filter((line) => line.startsWith("/dev/video"));

		const devices: CameraDevice[] = [];
		for (const devicePath of allDevices) {
			if (await hasVideoCaptureCapability(devicePath)) {
				devices.push({
					id: devicePath,
					name: `Camera ${devicePath.replace("/dev/video", "")}`,
				});
			}
		}

		return devices;
	} catch {
		return [];
	}
};
