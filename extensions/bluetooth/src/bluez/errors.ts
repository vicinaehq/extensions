/**
 * BlueZ D-Bus error handling.
 * Maps org.bluez.Error.* to human-readable messages.
 */

const BLUEZ_ERROR_MAP: Record<string, string> = {
	"org.bluez.Error.Failed": "Operation failed",
	"org.bluez.Error.InProgress": "Operation already in progress",
	"org.bluez.Error.AlreadyExists": "Already exists",
	"org.bluez.Error.NotAvailable":
		"Not available - device may be off or out of range",
	"org.bluez.Error.NotReady": "Bluetooth adapter not ready",
	"org.bluez.Error.NotSupported": "Not supported",
	"org.bluez.Error.NotPaired": "Device is not paired - pair it first",
	"org.bluez.Error.NotConnected": "Device is not connected",
	"org.bluez.Error.AlreadyConnected": "Already connected",
	"org.bluez.Error.AuthenticationCanceled": "Pairing was cancelled",
	"org.bluez.Error.AuthenticationFailed": "Pairing was rejected or failed",
	"org.bluez.Error.AuthenticationRejected": "Pairing was rejected",
	"org.bluez.Error.AuthenticationTimeout": "Pairing timed out",
	"org.bluez.Error.ConnectionAttemptFailed":
		"Device unreachable - ensure it's in pairing mode and in range",
};

export class BlueZError extends Error {
	constructor(
		message: string,
		public readonly dbusError?: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "BlueZError";
		Object.setPrototypeOf(this, BlueZError.prototype);
	}
}

export function wrapDbusError(err: unknown): BlueZError {
	if (err instanceof BlueZError) return err;

	const msg = err instanceof Error ? err.message : String(err);
	const dbusMatch = msg.match(/org\.bluez\.Error\.\w+/);
	const dbusError = dbusMatch ? dbusMatch[0] : undefined;
	const humanMessage =
		(dbusError && BLUEZ_ERROR_MAP[dbusError]) ?? msg ?? "Unknown BlueZ error";

	return new BlueZError(humanMessage, dbusError, err);
}
