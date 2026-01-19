import {
	Icon,
} from "@vicinae/api";
import { BLUETOOTH_REGEX } from "@/patterns";
import { Device } from "@/bluetoothctl";

function isMacLike(name: string): boolean {
	return BLUETOOTH_REGEX.macAddress.test(name);
}

export function getIconFromInfo(info: string) {
	const iconMatch = BLUETOOTH_REGEX.icon.exec(info);
	if (iconMatch) {
		const bluezIcon = iconMatch[1].toLowerCase();
		if (bluezIcon.includes('headset')
			|| bluezIcon.includes('headphones')
			|| bluezIcon.includes('audio-card')) {
			return Icon.Headphones;
		}
		if (bluezIcon.includes('keyboard')) {
			return Icon.Keyboard;
		}
		if (bluezIcon.includes('mouse')) {
			return Icon.Mouse;
		}
		if (bluezIcon.includes('phone')
			|| bluezIcon.includes('mobile')) {
			return Icon.Mobile;
		}
		if (bluezIcon.includes('gamepad')
			|| bluezIcon.includes('joystick')
			|| bluezIcon.includes('input-gaming')) {
			return Icon.GameController;
		}
		if (bluezIcon.includes('camera')
			|| bluezIcon.includes('video')) {
			return Icon.Camera;
		}
		if (bluezIcon.includes('printer')) {
			return Icon.Print;
		}
		if (bluezIcon.includes('network')
			|| bluezIcon.includes('wireless')) {
			return Icon.Network;
		}
		if (bluezIcon.includes('computer')
			|| bluezIcon.includes('laptop')) {
			return Icon.Desktop;
		}
	}
	return Icon.Bluetooth;
}

export function getBatteryLevel(info: string): number | undefined {
  const matches = info.match(BLUETOOTH_REGEX.batteryLevel);

  if (matches === null) return;

  return !!matches[1] ? parseInt(matches[1].trim()) : undefined;
}

export function sortDevices(devices: Device[]): Device[] {
	return devices.sort((a, b) => {
		const aIsMacOnly = isMacLike(a.name) || a.name === a.mac;
		const bIsMacOnly = isMacLike(b.name) || b.name === b.mac;

		return aIsMacOnly === bIsMacOnly
			? a.name.localeCompare(b.name)
			: aIsMacOnly
				? 1
				: -1;
	});
}


export function removeFromDeviceList(
	mac: string,
	setDevices: React.Dispatch<React.SetStateAction<Device[]>>
): void {
	setDevices((prev) => prev.filter((d) => d.mac !== mac));
}

export function stripAnsiCodes(text: string): string {
	// Remove ANSI escape sequences (colors, formatting, etc.)
	return text.replace(/\x1b\[[0-9;]*[mGKHF]/g, '');
}
