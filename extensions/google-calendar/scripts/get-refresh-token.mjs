#!/usr/bin/env node
/**
 * get-refresh-token.mjs — mint a Google OAuth refresh token for YOUR
 * "Desktop app" OAuth client and print it to the terminal.
 *
 * An OAuth Playground or `gcloud` token belongs to a DIFFERENT client ID and
 * fails with `invalid_grant` when this extension exchanges it, so use this
 * script: it runs the same PKCE loopback flow as the extension, against the
 * client ID you pass here.
 *
 * PRIVACY: the refresh token is printed ONLY to stdout so you can paste it
 * into the extension's "Refresh Token" preference. It is NEVER written to
 * disk, a log file, or any other persistent store by this script. Terminal
 * scrollback is the only copy — clear it afterwards on a shared machine.
 *
 * Usage:
 *   node scripts/get-refresh-token.mjs --client-id <id> [--client-secret <secret>]
 *   node scripts/get-refresh-token.mjs --help
 *
 * Flags default from the environment when omitted:
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 *
 * Requires Node 20+. Dependency-free: only node:http, node:crypto,
 * node:child_process and the global fetch.
 */

import http from "node:http";
import crypto from "node:crypto";
import { execFile } from "node:child_process";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// Same five calendar-only scopes as src/auth/google-oauth.ts GOOGLE_SCOPES.
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "email",
  "profile",
];

const CALLBACK_PATH = "/callback";
const TIMEOUT_MS = 5 * 60 * 1000;

function usage() {
  return `Usage:
  node scripts/get-refresh-token.mjs --client-id <id> [--client-secret <secret>]
  node scripts/get-refresh-token.mjs --help

Options:
  --client-id <id>        Google Cloud "Desktop app" OAuth client ID.
                          Defaults to $GOOGLE_CLIENT_ID when omitted.
  --client-secret <s>     Client secret (only if your client type requires one).
                          Defaults to $GOOGLE_CLIENT_SECRET when omitted.
  --help, -h              Print this help and exit.

Flow: starts a loopback listener on 127.0.0.1 (ephemeral port), opens the
Google consent page (PKCE S256, access_type=offline, prompt=consent), exchanges
the returned code, and prints the refresh token to stdout with instructions to
paste it into the extension's "Refresh Token" preference. Nothing is written
to disk.`;
}

function fail(message) {
  console.error(`get-refresh-token: error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { clientId: undefined, clientSecret: undefined, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const readValue = (flag) => {
      const eq = arg.indexOf("=");
      if (eq !== -1) return arg.slice(eq + 1);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        fail(`${flag} requires a value. See --help.`);
      }
      i++;
      return next;
    };
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--client-id" || arg.startsWith("--client-id=")) out.clientId = readValue("--client-id");
    else if (arg === "--client-secret" || arg.startsWith("--client-secret=")) out.clientSecret = readValue("--client-secret");
    else fail(`unknown argument ${JSON.stringify(arg)}. See --help.`);
  }
  return out;
}

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function openBrowser(url) {
  const platform = process.platform;
  const target = platform === "win32" ? ["cmd", ["/c", "start", "", url]] : platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    const child = execFile(target[0], target[1], { stdio: "ignore", detached: true }, () => {});
    if (child && typeof child.unref === "function") child.unref();
  } catch {
    // Non-fatal: the URL is printed below, so the user can open it manually.
  }
}

function successHtml() {
  return "<!doctype html><html><body><h1>Signed in</h1><p>Copy the refresh token from your terminal into the extension preferences. You can close this tab.</p></body></html>";
}

function waitForCode(server, expectedState) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out after ${TIMEOUT_MS / 60000} minutes waiting for the Google redirect. Run the script again.`));
    }, TIMEOUT_MS);
    if (typeof timer.unref === "function") timer.unref();
    server.on("request", (req, res) => {
      const respond = (status, html) => {
        res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      };
      let url;
      try {
        url = new URL(req.url ?? "/", "http://127.0.0.1");
      } catch {
        respond(400, "Bad request.");
        return;
      }
      if (url.pathname !== CALLBACK_PATH) {
        respond(404, "Not found.");
        return;
      }
      const params = url.searchParams;
      const error = params.get("error");
      if (error) {
        clearTimeout(timer);
        respond(200, successHtml());
        reject(new Error(`Google returned an error: ${error}${params.get("error_description") ? ` — ${params.get("error_description")}` : ""}.`));
        return;
      }
      const code = params.get("code");
      const state = params.get("state");
      if (!code) {
        respond(400, "Missing authorization code.");
        return;
      }
      if (state !== expectedState) {
        respond(400, "State mismatch — possible cross-site request. Aborting.");
        return;
      }
      clearTimeout(timer);
      respond(200, successHtml());
      resolve(code);
    });
  });
}

async function exchangeCode({ code, clientId, clientSecret, redirectUri, codeVerifier }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  if (clientSecret) body.set("client_secret", clientSecret);
  let res;
  try {
    res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (err) {
    fail(`token request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail(`token endpoint returned a non-JSON response (HTTP ${res.status}).`);
  }
  if (!res.ok || typeof data.access_token !== "string") {
    const detail = data.error_description || data.error || text.slice(0, 500);
    fail(`token exchange failed (HTTP ${res.status}): ${detail}`);
  }
  if (typeof data.refresh_token !== "string" || data.refresh_token === "") {
    fail(
      "Google did not return a refresh token. Revoke this app at https://myaccount.google.com/permissions and run the script again (it always sends prompt=consent, so a missing token means the project is misconfigured).",
    );
  }
  return data.refresh_token;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const clientId = args.clientId ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = args.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
  if (!clientId) {
    fail("no client ID: pass --client-id <id> or set $GOOGLE_CLIENT_ID. See --help.");
  }

  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
  const state = base64url(crypto.randomBytes(16));

  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    fail("could not determine the loopback port.");
  }
  const redirectUri = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;

  const authorizeUrl =
    `${GOOGLE_AUTH_ENDPOINT}?` +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();

  console.log("Opening this URL in your browser (open it manually if needed):");
  console.log(authorizeUrl);
  openBrowser(authorizeUrl);

  let code;
  try {
    code = await waitForCode(server, state);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    server.close();
  }

  const refreshToken = await exchangeCode({ code, clientId, clientSecret, redirectUri, codeVerifier });
  console.log("");
  console.log("Refresh token:");
  console.log(refreshToken);
  console.log("Paste it into the Google Calendar extension preferences (Refresh Token field).");
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
