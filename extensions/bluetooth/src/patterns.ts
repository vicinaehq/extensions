interface BluetoothRegexPatterns {
	// Device validation
	macAddress: RegExp;

	// Device info parsing
	icon: RegExp;

	// Device details parsing
	deviceName: RegExp;
	connectedStatus: RegExp;
	trustedStatus: RegExp;

	// Bluetoothctl output parsing
	deviceLine: RegExp;
	deletedDeviceLine: RegExp;
	changedDeviceLine: RegExp;
	newDeviceLine: RegExp;
	DeviceConnectedYes: RegExp;
	DeviceConnectedNo: RegExp;

	// Pairing flow patterns
	passkeyConfirmation: RegExp;
	requestCancelled: RegExp;
	authorizeService: RegExp;
	pinCodeRequest: RegExp;
	pairingSuccess: RegExp;
	pairingFailure: RegExp;

	// Connection patterns
	connectionSuccess: RegExp;
	connectionFailure: RegExp;

	// Disconnect patterns
	disconnectSuccess: RegExp;
	disconnectFailure: RegExp;

	// Remove patterns
	removeSuccess: RegExp;
	removeFailure: RegExp;

	// Trust patterns
	trustSuccess: RegExp;
	trustFailure: RegExp;

	// Discoverable patterns
	discoverableSuccess: RegExp;
	discoverableFailure: RegExp;
	undiscoverableSuccess: RegExp
	undiscoverableFailure: RegExp;
}

export const BLUETOOTH_REGEX: BluetoothRegexPatterns = {
	// Device validation - checks if string is MAC address format
	macAddress: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,

	icon: /Icon:\s+([^\s\n\r]+)/,

	// Device details parsing - extracts info from bluetoothctl info output
	deviceName: /Name:\s(.+)/,
	connectedStatus: /Connected:\s*yes/i,
	trustedStatus: /Trusted:\s*yes/i,

	// Bluetoothctl output parsing - parses scan output lines
	deviceLine: /Device ([0-9A-Fa-f:]+) (.+)/,
	deletedDeviceLine: /.*DEL.*Device ([0-9A-Fa-f:]+) (.+)/,
	changedDeviceLine: /.*CHG.*Device ([0-9A-Fa-f:]+) (.+)/,
	newDeviceLine: /.*NEW.*Device ([0-9A-Fa-f:]+) (.+)/,
	DeviceConnectedYes: /.*CHG.*Device ([0-9A-Fa-f:]+) Connected: yes/i,
	DeviceConnectedNo: /.*CHG.*Device ([0-9A-Fa-f:]+) Connected: no/i,

	// Pairing flow patterns - handles different pairing scenarios
	passkeyConfirmation: /Confirm passkey (\d+)/,
	requestCancelled: /\rRequest canceled/,
	authorizeService: /Authorize service (.+)/,
	pinCodeRequest: /Enter PIN code:/,
	pairingSuccess: /Pairing successful|Device paired|already paired/,
	pairingFailure: /Failed to pair|AuthenticationFailed|org.bluez.Error/,

	// Connection patterns - handles connection status
	connectionSuccess: /Connection successful|already connected/i,
	connectionFailure: /Failed to connect|not available|not paired|AuthenticationFailed/i,

	// Disconnect patterns
	disconnectSuccess: /Disconnection successful|Device disconnected/i,
	disconnectFailure: /Failed to disconnect|org\.bluez\.Error\.(NotConnected|Failed)/i,

	// Remove patterns
	removeSuccess: /Device has been removed/i,
	removeFailure: /Failed to remove|org\.bluez\.Error\./i,

	// Trust patterns
	trustSuccess: /Changing.*trust succeeded/i,
	trustFailure: /Failed to set trust|org\.bluez\.Error\./i,

	// Discoverable patterns
	discoverableSuccess: /Changing discoverable on succeeded|discoverable on succeeded/i,
	discoverableFailure: /Failed to set discoverable|discoverable on failed/i,
	undiscoverableSuccess: /Changing discoverable off succeeded|discoverable off succeeded/i,
	undiscoverableFailure: /Failed to set discoverable|discoverable off failed/i,
};
