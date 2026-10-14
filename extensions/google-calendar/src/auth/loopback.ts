import http from "node:http";

export interface AuthorizationResult {
  code: string;
  state: string;
}

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
// Kept as a literal (same value as GOOGLE_AUTH_ENDPOINT in google-oauth.ts) to
// avoid a circular import: google-oauth.ts imports this module.
const SUCCESS_HTML =
  "<!doctype html><html><body><h1>Signed in</h1><p>You can return to Vicinae.</p></body></html>";
const ERROR_HTML =
  "<!doctype html><html><body><h1>Sign-in failed</h1><p>You can return to Vicinae and try again.</p></body></html>";

export function buildAuthorizationUrl(options: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scopes: string[];
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
    state: options.state,
    // Scopes are space-joined; URLSearchParams percent-encodes the spaces.
    scope: options.scopes.join(" "),
    // Needed so Google returns a refresh token for the installed-app flow.
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

export async function waitForAuthorizationCode(options: {
  expectedState: string;
  timeoutMs?: number;
  preferredPort?: number;
  onListening: (redirectUri: string) => Promise<void> | void;
}): Promise<AuthorizationResult> {
  const { expectedState, timeoutMs = 5 * 60 * 1000, preferredPort, onListening } = options;
  const server = http.createServer();
  let fallbackTried = false;

  return new Promise<AuthorizationResult>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settle(() =>
        reject(new Error(`Timed out waiting for Google authorization after ${timeoutMs}ms`)),
      );
    }, timeoutMs);
    // Don't keep the process alive just for the timeout once the test/host is done.
    timer.unref?.();

    function settle(effect: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      effect();
      server.close();
    }

    function respond(res: http.ServerResponse, status: number, html: string): void {
      res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    }

    server.on("request", (req, res) => {
      let url: URL;
      try {
        url = new URL(req.url ?? "/", "http://127.0.0.1");
      } catch {
        respond(res, 400, ERROR_HTML);
        return;
      }
      if (url.pathname !== "/callback") {
        respond(res, 404, ERROR_HTML);
        return;
      }
      const error = url.searchParams.get("error");
      if (error) {
        const description = url.searchParams.get("error_description");
        const message = description ? `${error}: ${description}` : error;
        respond(res, 400, ERROR_HTML);
        settle(() => reject(new Error(`Google authorization failed: ${message}`)));
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code) {
        respond(res, 400, ERROR_HTML);
        settle(() => reject(new Error("Google authorization response is missing the code parameter")));
        return;
      }
      if (state !== expectedState) {
        respond(res, 400, ERROR_HTML);
        settle(() => reject(new Error("OAuth state mismatch — possible CSRF, rejecting authorization")));
        return;
      }
      respond(res, 200, SUCCESS_HTML);
      settle(() => resolve({ code, state }));
    });

    server.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EADDRINUSE" && preferredPort !== undefined && !fallbackTried) {
        // Preferred port taken (e.g. a stale instance) — fall back to ephemeral.
        fallbackTried = true;
        server.listen(0, "127.0.0.1");
        return;
      }
      settle(() => reject(err));
    });

    const start = (port: number) => {
      server.listen(port, "127.0.0.1", () => {
        const address = server.address();
        const actualPort = typeof address === "object" && address !== null ? address.port : port;
        const redirectUri = `http://127.0.0.1:${actualPort}/callback`;
        Promise.resolve()
          .then(() => onListening(redirectUri))
          .catch((err: unknown) =>
            settle(() => reject(err instanceof Error ? err : new Error(String(err)))),
          );
      });
    };
    start(preferredPort ?? 0);
  });
}
