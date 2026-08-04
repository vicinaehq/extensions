/**
 * The extension's user-facing strings, in one place.
 *
 * Every string the commands render goes through `t()`, and every error the user sees goes
 * through `localizeError()`. Keeping them together is what makes the wording consistent
 * across two commands and a dozen protocol modules that all fail in their own way.
 */

type Dict = Record<string, string>;

/**
 * Look up a string, interpolating `{name}` placeholders. Falls back to the key itself, so a
 * missing string is visible during development but never crashes a command.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = strings[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

/**
 * Turn a thrown error into a user-facing message.
 *
 * Errors from the protocol layer carry a stable `code` (or a CTAP `status`); we look up by
 * that, so the wording lives here in one place instead of being spread across the modules
 * that throw. The error's own `.message` is the fallback for anything unmapped.
 */
export function localizeError(err: unknown): string {
  const e = err as { name?: string; code?: string; status?: number; retriesLeft?: number; message?: string };

  if (e?.name === "CtapError" && typeof e.status === "number") {
    const mapped = strings[`err.ctap.${e.status}`];
    if (mapped) return mapped;
    return t("err.ctap.unknown", { status: `0x${e.status.toString(16)}` });
  }

  if (typeof e?.code === "string") {
    const key = `err.${e.code}`;
    const mapped = strings[key];
    if (mapped) return e.retriesLeft != null ? t(key, { retries: e.retriesLeft }) : mapped;
  }

  return e?.message ?? String(err);
}

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

const strings: Dict = {
  // OTP screen
  "otp.nav": "OTP Codes",
  "otp.search": "Search account…",
  "otp.section.codes": "Codes",
  "otp.section.touch": "Touch required",
  "otp.reading": "Reading the YubiKey…",
  "otp.noAccounts": "No OATH accounts",
  "otp.noAccounts.hint": "Add accounts with: ykman oath accounts add <name>",
  "otp.countdown.tooltip": "Time until the code rolls over",
  "otp.action.paste": "Paste into field",
  "otp.action.copy": "Copy (kept out of history)",
  "otp.paste.failed": "Couldn't paste",
  "otp.purge.failed": "Pasted, but the code is still in the clipboard history",

  // Touch flow
  "touch.prompt": "Touch the YubiKey",
  "touch.notReceived": "Touch not received",
  "touch.tag.waiting": "waiting for touch",
  "touch.tag.touch": "touch",
  "touch.tooltip.hotp": "HOTP account: the code is generated on demand",
  "touch.tooltip.touch": "This account requires touching the YubiKey sensor",
  "touch.action.cancel": "Cancel the wait",
  "touch.action.request": "Request touch and paste",
  "busy.title": "The YubiKey is still busy",
  "busy.message": "Wait {s}s: it is finishing the cancelled touch.",
  "busy.section": "YubiKey busy",
  "busy.item.title": "Touch the YubiKey to free it now",
  "busy.item.subtitle": "It is still waiting for the touch you cancelled. On its own, it frees up in {s}s.",

  // Device problems
  "device.busy": "The YubiKey is busy",
  "device.none": "No YubiKey",
  "action.retry": "Try again",
  "action.reload": "Reload",

  // Unlock (OATH password)
  "unlock.failed": "Couldn't unlock",
  "unlock.nav": "OATH locked",
  "unlock.action": "Unlock",
  "unlock.needed.title": "Password required",
  "unlock.needed.text": "The OATH application on this YubiKey is password-protected. The password is used only to unlock the key and is never written to disk.",
  "unlock.field.password": "Password",
  "unlock.field.passwordPlaceholder": "OATH password",
  "unlock.remember.label": "Remember on this machine",
  "unlock.remember.title": "Remember",
  "unlock.remember.info": "Stores the derived key in the same keystore as ykman, encrypted with the system keyring.",
  "unlock.remember.failed": "Couldn't remember the password",
  "unlock.remember.failed.detail": "No Secret Service is running (gnome-keyring or KWallet), so the key is kept only until this command closes.",

  // Keys & certificates screen
  "keys.nav": "Keys & Certificates",
  "keys.search": "Search key, slot or certificate…",
  "keys.fido.section": "FIDO2 · passkeys",
  "keys.fido.slotsFree": "{n} slots free",
  "keys.fido.unavailable": "FIDO2 unavailable",
  "keys.fido.unavailable.detail": "## FIDO2 passkeys\n\nThe FIDO interface could not be read:\n\n> {reason}\n\nFIDO2 uses its own HID interface, so the **OTP codes** and **PIV certificates** do not depend on it.",
  "keys.fido.view": "View passkeys",
  "keys.fido.view.subtitle": "Requires the FIDO2 PIN",
  "keys.fido.pinSet": "PIN set",
  "keys.fido.pinUnset": "no PIN",
  "keys.fido.view.detail": "## FIDO2 passkeys\n\nResident credentials can only be read with the PIN.\n\nThe PIN is entered here and kept only in memory.\n\n> Three wrong PINs in a row lock FIDO2 until you **remove and reinsert** the key.",
  "keys.fido.enterPin": "Enter the PIN",
  "keys.fido.none": "No passkeys",
  "keys.fido.none.subtitle": "No resident credentials on this key",
  "keys.fido.none.detail": "This YubiKey has no resident passkeys.",
  "keys.fido.listFailed": "Couldn't list",
  "keys.fido.count.one": "1 passkey",
  "keys.fido.count.many": "{n} passkeys",
  "keys.fido.unknownRp": "(unknown)",
  "keys.fido.meta.site": "Site",
  "keys.fido.meta.user": "User",
  "keys.fido.meta.displayName": "Display name",
  "keys.fido.meta.credId": "Credential id",
  "keys.fido.copyId": "Copy credential id",
  "keys.fido.delete": "Delete passkey",
  "keys.fido.deleted": "Passkey deleted",
  "keys.fido.deleteFailed": "Couldn't delete",

  // PIV
  "keys.piv.section": "PIV · certificates",
  "keys.piv.pin": "PIN {left}/{total}",
  "keys.piv.slot": "slot {slot}",
  "keys.piv.tag.hasCert": "certificate",
  "keys.piv.tag.empty": "empty",
  "keys.piv.meta.subject": "Subject",
  "keys.piv.meta.issuer": "Issuer",
  "keys.piv.meta.from": "Valid from",
  "keys.piv.meta.until": "Valid until",
  "keys.piv.meta.serial": "Serial",
  "keys.piv.empty.detail": "## Slot {slot} empty\n\nThere is no certificate in this slot.\n\nTo create one, use `ykman`:\n\n```\nykman piv keys generate {slot} pub.pem\nykman piv certificates generate {slot} pub.pem\n```",
  "keys.piv.unavailable": "PIV unavailable",
  "keys.piv.unavailable.detail": "## PIV certificates\n\nThe PIV application could not be read:\n\n> {reason}\n\nPIV goes through the smart-card interface (pcscd), so it can fail while the **FIDO2 passkeys** above, which use their own HID interface, keep working.",
  "keys.piv.export": "Export certificate (.pem)",
  "keys.piv.exported": "Certificate exported",
  "keys.piv.exportFailed": "Couldn't export",

  // Key state
  "keys.state.section": "Key state",
  "keys.state.fidoPin": "FIDO2 PIN",
  "keys.state.set": "set",
  "keys.state.unset": "not set",
  "keys.state.attempts": "{n} attempts",
  "keys.state.detail": "## FIDO2\n\n- PIN: {pin}\n- Attempts left: {retries}\n- Minimum PIN length: {min}\n- Free passkey slots: {slots}\n- AAGUID: `{aaguid}`\n\n> Three wrong PINs **in a row** lock FIDO2. To unlock, remove the key and reinsert it.",

  // PIN form
  "pin.nav": "FIDO2 PIN",
  "pin.description": "The PIN is kept only in memory for as long as this command is open. It is never written to disk.",
  "pin.confirm": "Confirm",
  "pin.attemptsLeft": "Attempts left",
  "pin.field": "PIN",

  // Confirm delete
  "confirm.nav": "Delete passkey",
  "confirm.action": "Delete permanently",
  "confirm.mismatch.title": "Doesn't match",
  "confirm.mismatch.message": "Type exactly: {rpId}",
  "confirm.warn.title": "This cannot be undone",
  "confirm.warn.text": "Deleting the passkey for {rpId} may cost you access to that account, if it is your only login method. Make sure you have another way in first.",
  "confirm.field": "Type the site name",
  "confirm.field.info": "Explicit confirmation to prevent accidental deletion.",

  // Errors (by code)
  "err.no_daemon": "pcscd is not running. Install `pcsc-lite` (or `pcscd` on Debian/Ubuntu) and enable it: sudo systemctl enable --now pcscd.socket",
  "err.not_authorized": "pcscd refused the connection. polkit only grants card access to an active graphical session, so this happens over SSH or on a TTY.",
  "err.no_reader": "No smart-card reader found. If the YubiKey is plugged in, the CCID driver may be missing (package `ccid`), or CCID may be disabled on the key.",
  "err.no_card": "Insert the YubiKey",
  "err.no_such_serial": "The YubiKey set in the preferences is not connected. Plug it in, or clear the `YubiKey serial` preference to use whichever key is present.",
  "err.bad_serial": "The `YubiKey serial` preference is not a serial number. It is the decimal number printed by `ykman list`, digits only.",
  "err.ambiguous_device": "More than one YubiKey is connected. FIDO2 gives no serial number to tell them apart, so leave only the key you want to manage plugged in.",
  "err.busy": "The YubiKey is reserved by another program. It is usually gpg-agent: add `pcsc-shared` to ~/.gnupg/scdaemon.conf so it stops holding it exclusively.",
  "err.card_removed": "The YubiKey was removed",
  "err.locked": "The OATH application is password-protected",
  "err.wrong_password": "Wrong password",
  "err.touch_timeout": "The YubiKey was not touched in time",
  "err.no_applet": "This key does not expose the application. CCID may be disabled on it.",
  "err.pin_invalid": "Wrong PIV PIN. {retries} attempts left.",
  "err.pin_blocked": "PIV PIN blocked. The PUK is required to unblock it.",
  "err.no_cert": "There is no certificate in that slot",
  "err.no_device": "No YubiKey FIDO interface found",
  "err.no_access": "No permission to access the YubiKey over HID. Install the FIDO udev rules (`libfido2` on Fedora/Arch, `libu2f-udev` on Debian/Ubuntu).",
  "err.ctap.49": "Wrong PIN",
  "err.ctap.52": "Too many attempts in a row. Remove the YubiKey and reinsert it.",
  "err.ctap.53": "PIN blocked. Remove the YubiKey and reinsert it.",
  "err.ctap.54": "PIN blocked. It must be reset (FIDO2 reset).",
  "err.ctap.unknown": "The YubiKey refused the request (status {status})",
};
