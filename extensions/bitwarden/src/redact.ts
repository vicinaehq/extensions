import { homedir } from 'node:os';

export function redactSensitive(message: string): string {
  let out = message.replace(/(https?:\/\/[^\s#]+)#\S+/gi, '$1#…');
  const home = homedir();
  if (home && home !== '/') {
    out = out.split(home).join('~');
  }
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>');

  // JSON.parse error patterns can quote the failing input — that input may
  // itself be secret material (keyring blob, session token). Strip the snippet.
  out = out.replace(/"[^"\n]{4,}"(?=\s+is\s+not\s+valid\s+JSON)/g, '"<redacted>"');
  out = out.replace(/Unexpected token\s+\S+\s+in JSON/g, 'Unexpected token <redacted> in JSON');
  out = out.replace(
    /Unexpected token '[^']{1,4}',\s*"[^"\n]+"/g,
    "Unexpected token '?', <redacted>",
  );

  // Credential-like query string params (token=, key=, secret=, etc.)
  out = out.replace(
    /([?&])(token|key|secret|api[_-]?key|access[_-]?token|password|auth)=[^&\s"']+/gi,
    '$1$2=<redacted>',
  );

  return out;
}
