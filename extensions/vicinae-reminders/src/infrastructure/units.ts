export const SERVICE_NAME = "vicinae-reminders.service";
export const TIMER_NAME = "vicinae-reminders.timer";

function quoteSystemdArgument(value: string): string {
	if (/[\n\r\0]/.test(value))
		throw new Error("Systemd arguments cannot contain newlines or NUL bytes");
	return `"${value.replaceAll("%", "%%").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export type UnitOptions = {
	nodePath: string;
	workerPath: string;
	notificationIconPath: string;
	notifySendPath: string;
	dataDir: string;
	stateDir: string;
};

export function renderServiceUnit(options: UnitOptions): string {
	const args = [
		options.nodePath,
		options.workerPath,
		"--data-dir",
		options.dataDir,
		"--state-dir",
		options.stateDir,
		"--notify-send",
		options.notifySendPath,
		"--icon",
		options.notificationIconPath,
	]
		.map(quoteSystemdArgument)
		.join(" ");
	return `[Unit]
Description=Vicinae Reminders worker

[Service]
Type=oneshot
ExecStart=${args}
NoNewPrivileges=yes
PrivateTmp=yes
UMask=0077
TimeoutStartSec=15min
`;
}

export function renderTimerUnit(serviceName = SERVICE_NAME): string {
	return `[Unit]
Description=Run Vicinae Reminders worker every minute

[Timer]
OnCalendar=*-*-* *:*:00
AccuracySec=1s
RandomizedDelaySec=0
Persistent=true
Unit=${serviceName}

[Install]
WantedBy=timers.target
`;
}
