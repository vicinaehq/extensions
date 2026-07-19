import { getPreferenceValues } from "@vicinae/api";

/**
 * Minimal i18n. English and Portuguese, chosen by the `language` preference
 * (auto / en / pt). Auto reads the system locale.
 *
 * The manifest strings (command titles, descriptions) are static and stay in English
 * because Vicinae reads them once and has no per-user manifest translation. Everything
 * shown from inside the commands goes through `t()`.
 */

export type Lang = "en" | "pt";

type Prefs = { language?: "auto" | "en" | "pt" };

function detectSystemLang(): Lang {
  const raw =
    process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || process.env.LANGUAGE || "";
  return raw.toLowerCase().startsWith("pt") ? "pt" : "en";
}

let cached: Lang | null = null;

export function lang(): Lang {
  if (cached) return cached;
  let choice: Prefs["language"] = "auto";
  try {
    choice = getPreferenceValues<Prefs>().language ?? "auto";
  } catch {
    choice = "auto";
  }
  cached = choice === "en" || choice === "pt" ? choice : detectSystemLang();
  return cached;
}

/** For tests: force a language and bypass the preference lookup. */
export function setLang(l: Lang) {
  cached = l;
}

type Dict = Record<string, string>;

/**
 * Translate a key, interpolating `{name}` placeholders. Falls back to English, then to
 * the key itself, so a missing translation is visible but never crashes.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const l = lang();
  const template = (dict[l] && dict[l][key]) ?? dict.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

// ---------------------------------------------------------------------------
// Error localization
// ---------------------------------------------------------------------------

/**
 * Turn a thrown error into a localized, user-facing message.
 *
 * Errors from the protocol layer carry a stable `code` (or a CTAP `status`); we translate
 * by that, so the messages live here in one place and stay in sync across languages. The
 * error's own `.message` is an English developer fallback for anything unmapped.
 */
export function localizeError(err: unknown): string {
  const e = err as { name?: string; code?: string; status?: number; retriesLeft?: number; message?: string };

  if (e?.name === "CtapError" && typeof e.status === "number") {
    const key = `err.ctap.${e.status}`;
    const translated = (dict[lang()] && dict[lang()][key]) ?? dict.en[key];
    if (translated) return translated;
    return t("err.ctap.unknown", { status: `0x${e.status.toString(16)}` });
  }

  if (typeof e?.code === "string") {
    const key = `err.${e.code}`;
    const params = e.retriesLeft != null ? { retries: e.retriesLeft } : undefined;
    const translated = (dict[lang()] && dict[lang()][key]) ?? dict.en[key];
    if (translated) return params ? t(key, params) : translated;
  }

  return e?.message ?? String(err);
}

// ---------------------------------------------------------------------------
// Dictionaries
// ---------------------------------------------------------------------------

const en: Dict = {
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

  // Keys & certificates screen
  "keys.nav": "Keys & Certificates",
  "keys.search": "Search key, slot or certificate…",
  "keys.fido.section": "FIDO2 · passkeys",
  "keys.fido.slotsFree": "{n} slots free",
  "keys.fido.unavailable": "FIDO2 unavailable",
  "keys.fido.unavailable.subtitle": "No FIDO authenticator accessible",
  "keys.fido.unavailable.detail": "## FIDO2 passkeys\n\nThe YubiKey's FIDO interface was not found. If the key is plugged in, the udev rule that grants access may be missing (package `libfido2` on Fedora/Arch, `libu2f-udev` on Debian/Ubuntu).\n\n> The **OTP codes** and **PIV certificates** do not depend on this.",
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
  "err.busy": "The YubiKey is reserved by another program. It is usually gpg-agent: add `pcsc-shared` to ~/.gnupg/scdaemon.conf so it stops holding it exclusively.",
  "err.card_removed": "The YubiKey was removed",
  "err.locked": "The OATH application is password-protected",
  "err.wrong_password": "Wrong password",
  "err.touch_timeout": "The YubiKey was not touched in time",
  "err.no_applet": "This key does not expose the application. CCID may be disabled on it.",
  "err.pin_invalid": "Wrong PIV PIN. {retries} attempts left.",
  "err.pin_blocked": "PIV PIN blocked. The PUK is required to unblock it.",
  "err.no_cert": "There is no certificate in that slot",
  "err.no_device": "No FIDO authenticator found",
  "err.no_access": "No permission to access the YubiKey over HID. Install the FIDO udev rules (`libfido2` on Fedora/Arch, `libu2f-udev` on Debian/Ubuntu).",
  "err.ctap.49": "Wrong PIN",
  "err.ctap.52": "Too many attempts in a row. Remove the YubiKey and reinsert it.",
  "err.ctap.53": "PIN blocked. Remove the YubiKey and reinsert it.",
  "err.ctap.54": "PIN blocked. It must be reset (FIDO2 reset).",
  "err.ctap.unknown": "The YubiKey refused the request (status {status})",
};

const pt: Dict = {
  // OTP screen
  "otp.nav": "Códigos OTP",
  "otp.search": "Buscar conta…",
  "otp.section.codes": "Códigos",
  "otp.section.touch": "Exigem toque",
  "otp.reading": "Lendo a YubiKey…",
  "otp.noAccounts": "Nenhuma conta OATH",
  "otp.noAccounts.hint": "Adicione contas com: ykman oath accounts add <nome>",
  "otp.countdown.tooltip": "Tempo até o código virar",
  "otp.action.paste": "Colar no campo",
  "otp.action.copy": "Copiar (sem entrar no histórico)",
  "otp.paste.failed": "Não consegui colar",

  // Touch flow
  "touch.prompt": "Toque na YubiKey",
  "touch.notReceived": "Toque não recebido",
  "touch.tag.waiting": "aguardando toque",
  "touch.tag.touch": "toque",
  "touch.tooltip.hotp": "Conta HOTP: o código só é gerado sob demanda",
  "touch.tooltip.touch": "Esta conta exige tocar no sensor da YubiKey",
  "touch.action.cancel": "Cancelar a espera",
  "touch.action.request": "Pedir o toque e colar",
  "busy.title": "A YubiKey ainda está ocupada",
  "busy.message": "Aguarde {s}s: ela está finalizando o toque cancelado.",
  "busy.section": "YubiKey ocupada",
  "busy.item.title": "Toque na YubiKey para liberá-la agora",
  "busy.item.subtitle": "Ela ficou esperando o toque que você cancelou. Sozinha, se solta em {s}s.",

  // Device problems
  "device.busy": "A YubiKey está ocupada",
  "device.none": "Nenhuma YubiKey",
  "action.retry": "Tentar de novo",
  "action.reload": "Recarregar",

  // Unlock (OATH password)
  "unlock.failed": "Não destravou",
  "unlock.nav": "OATH protegido",
  "unlock.action": "Desbloquear",
  "unlock.needed.title": "Senha necessária",
  "unlock.needed.text": "O OATH desta YubiKey está protegido por senha. Ela é usada apenas para destravar a chave e nunca é gravada em disco.",
  "unlock.field.password": "Senha",
  "unlock.field.passwordPlaceholder": "Senha do OATH",
  "unlock.remember.label": "Lembrar nesta máquina",
  "unlock.remember.title": "Lembrar",
  "unlock.remember.info": "Guarda a chave derivada no mesmo keystore do ykman, cifrada com o keyring do sistema.",

  // Keys & certificates screen
  "keys.nav": "Chaves e Certificados",
  "keys.search": "Buscar chave, slot ou certificado…",
  "keys.fido.section": "FIDO2 · passkeys",
  "keys.fido.slotsFree": "{n} slots livres",
  "keys.fido.unavailable": "FIDO2 indisponível",
  "keys.fido.unavailable.subtitle": "Nenhum autenticador FIDO acessível",
  "keys.fido.unavailable.detail": "## Passkeys FIDO2\n\nNão encontrei a interface FIDO da YubiKey. Se ela está plugada, pode faltar a regra udev que dá acesso ao dispositivo (pacote `libfido2` no Fedora/Arch, `libu2f-udev` no Debian/Ubuntu).\n\n> Os **códigos OTP** e os **certificados PIV** não dependem disto.",
  "keys.fido.view": "Ver as passkeys",
  "keys.fido.view.subtitle": "Precisa do PIN do FIDO2",
  "keys.fido.pinSet": "PIN definido",
  "keys.fido.pinUnset": "sem PIN",
  "keys.fido.view.detail": "## Passkeys FIDO2\n\nAs credenciais residentes só podem ser lidas com o PIN.\n\nO PIN é pedido aqui e mantido apenas em memória.\n\n> Três PINs errados seguidos bloqueiam o FIDO2 até você **retirar e reinserir** a chave.",
  "keys.fido.enterPin": "Digitar o PIN",
  "keys.fido.none": "Nenhuma passkey",
  "keys.fido.none.subtitle": "Nenhuma credencial residente nesta chave",
  "keys.fido.none.detail": "Esta YubiKey não tem passkeys residentes.",
  "keys.fido.listFailed": "Não consegui listar",
  "keys.fido.count.one": "1 passkey",
  "keys.fido.count.many": "{n} passkeys",
  "keys.fido.unknownRp": "(desconhecido)",
  "keys.fido.meta.site": "Site",
  "keys.fido.meta.user": "Usuário",
  "keys.fido.meta.displayName": "Nome exibido",
  "keys.fido.meta.credId": "ID da credencial",
  "keys.fido.copyId": "Copiar ID da credencial",
  "keys.fido.delete": "Apagar passkey",
  "keys.fido.deleted": "Passkey apagada",
  "keys.fido.deleteFailed": "Não apagou",

  // PIV
  "keys.piv.section": "PIV · certificados",
  "keys.piv.pin": "PIN {left}/{total}",
  "keys.piv.slot": "slot {slot}",
  "keys.piv.tag.hasCert": "certificado",
  "keys.piv.tag.empty": "vazio",
  "keys.piv.meta.subject": "Titular",
  "keys.piv.meta.issuer": "Emissor",
  "keys.piv.meta.from": "Válido de",
  "keys.piv.meta.until": "Válido até",
  "keys.piv.meta.serial": "Série",
  "keys.piv.empty.detail": "## Slot {slot} vazio\n\nNão há certificado neste slot.\n\nPara criar um, use o `ykman`:\n\n```\nykman piv keys generate {slot} pub.pem\nykman piv certificates generate {slot} pub.pem\n```",
  "keys.piv.export": "Exportar certificado (.pem)",
  "keys.piv.exported": "Certificado exportado",
  "keys.piv.exportFailed": "Não exportou",

  // Key state
  "keys.state.section": "Estado da chave",
  "keys.state.fidoPin": "PIN do FIDO2",
  "keys.state.set": "definido",
  "keys.state.unset": "não definido",
  "keys.state.attempts": "{n} tentativas",
  "keys.state.detail": "## FIDO2\n\n- PIN: {pin}\n- Tentativas restantes: {retries}\n- Tamanho mínimo do PIN: {min}\n- Slots de passkey livres: {slots}\n- AAGUID: `{aaguid}`\n\n> Três PINs errados **seguidos** bloqueiam o FIDO2. Para destravar, retire a chave e insira de novo.",

  // PIN form
  "pin.nav": "PIN do FIDO2",
  "pin.description": "O PIN é mantido apenas em memória enquanto este comando está aberto. Nunca é gravado em disco.",
  "pin.confirm": "Confirmar",
  "pin.attemptsLeft": "Tentativas restantes",
  "pin.field": "PIN",

  // Confirm delete
  "confirm.nav": "Apagar passkey",
  "confirm.action": "Apagar definitivamente",
  "confirm.mismatch.title": "Não confere",
  "confirm.mismatch.message": "Digite exatamente: {rpId}",
  "confirm.warn.title": "Isto não tem volta",
  "confirm.warn.text": "Apagar a passkey de {rpId} pode custar o acesso à sua conta nesse site, se ela for seu único método de login. Verifique antes que você tem outro caminho de entrada.",
  "confirm.field": "Digite o nome do site",
  "confirm.field.info": "Confirmação explícita para evitar apagar por engano.",

  // Errors (by code)
  "err.no_daemon": "O pcscd não está rodando. Instale o pacote `pcsc-lite` (ou `pcscd` no Debian/Ubuntu) e habilite: sudo systemctl enable --now pcscd.socket",
  "err.not_authorized": "O pcscd recusou a conexão. O polkit só libera o cartão para uma sessão gráfica ativa, então isso acontece via SSH ou num TTY.",
  "err.no_reader": "Nenhum leitor de smartcard encontrado. Se a YubiKey está plugada, pode faltar o driver CCID (pacote `ccid`), ou o CCID pode estar desabilitado na chave.",
  "err.no_card": "Conecte a YubiKey",
  "err.busy": "A YubiKey está reservada por outro programa. Normalmente é o gpg-agent: adicione `pcsc-shared` ao ~/.gnupg/scdaemon.conf para que ele deixe de tomá-la só para si.",
  "err.card_removed": "A YubiKey foi removida",
  "err.locked": "O OATH está protegido por senha",
  "err.wrong_password": "Senha incorreta",
  "err.touch_timeout": "A YubiKey não foi tocada a tempo",
  "err.no_applet": "Esta chave não expõe a aplicação. O CCID pode estar desabilitado nela.",
  "err.pin_invalid": "PIN do PIV incorreto. Restam {retries} tentativas.",
  "err.pin_blocked": "PIN do PIV bloqueado. É preciso o PUK para destravar.",
  "err.no_cert": "Não há certificado nesse slot",
  "err.no_device": "Nenhum autenticador FIDO encontrado",
  "err.no_access": "Sem permissão para acessar a YubiKey via HID. Instale as regras udev do FIDO (`libfido2` no Fedora/Arch, `libu2f-udev` no Debian/Ubuntu).",
  "err.ctap.49": "PIN incorreto",
  "err.ctap.52": "Muitas tentativas seguidas. Retire a YubiKey e insira de novo.",
  "err.ctap.53": "PIN bloqueado. Retire a YubiKey e insira de novo.",
  "err.ctap.54": "PIN bloqueado. É preciso redefini-lo (reset do FIDO2).",
  "err.ctap.unknown": "A YubiKey recusou a requisição (status {status})",
};

const dict: Record<Lang, Dict> = { en, pt };
