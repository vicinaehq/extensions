<p align="center">
    <img src="./assets/icon.png" width="128" height="128" alt="Google Calendar Logo" />
</p>

# Google Calendar Vicinae Extension

A [Vicinae](https://github.com/vicinaehq/vicinae) extension for
[Google Calendar](https://calendar.google.com/), letting you browse
calendars, list upcoming events, and create events directly from your Linux
launcher.

Status: four commands implemented (`list-events`, `list-calendars`,
`create-event`, `create-quick-event`), typechecked (`npm run typecheck`),
unit-tested (`npm test`), built cleanly (`npm run build`).

Tested on Linux. The manifest does not declare `platforms`, so the extension
is offered on all platforms Vicinae supports; the loopback OAuth listener
uses Node's standard library and the helper script's browser-opening path
handles Linux, macOS and Windows, so no platform is knowingly excluded — but
only Linux has actually been exercised.

## Features

- **List Events** (`list-events`) — upcoming events across visible
  calendars for the next N days (configurable 1/3/7/14/30), with optional
  location display and an open action that can join the attached meeting.
  De-duplicates the same occurrence seen on several calendars (same
  `iCalUID` + start + summary), keeping the user's default calendar copy.
- **List Calendars** (`list-calendars`) — browse calendars, set the
  default, hide/show calendars from List Events.
- **Create Event** (`create-event`) — explicit title, time, calendar,
  attendees, colour, reminders, optional Google Meet link.
- **Create Quick Event** (`create-quick-event`) — natural-language text
  (e.g. "Lunch tomorrow at noon") via Google's `quickAdd` endpoint, with a
  local chrono-node preview.

## Install / Build / Dev

Prerequisites: Node.js >= 20 and npm.

```bash
npm install
npm run typecheck
npm test
```

To run against a live Vicinae instance with hot reloading:

```bash
npm run dev
```

To build a production package:

```bash
npm run build
```

The compiled output is installed under
`~/.local/share/vicinae/extensions/google-calendar`.

## Setup: Google Cloud OAuth client

The extension uses **your own** Google Cloud OAuth client — there is no
shared client secret shipped with the extension.

1. Create a project in the
   [Google Cloud console](https://console.cloud.google.com/).
2. Enable the **Google Calendar API** for that project
   (APIs & Services > Library).
3. Configure the **OAuth consent screen**: choose **External**, fill in the
   app name, and add yourself as a **test user**. In the current console
   this lives under **Google Auth Platform → Audience**; in the older UI it
   is **APIs & Services → OAuth consent screen**. Apps left in publishing
   status "Testing" only work for listed test users, and their refresh
   tokens expire after ~7 days — re-sign-in is then required.
4. **Publish the app — this is the step that matters most.** Go to
   **Google Auth Platform → Audience → Publish app** (older console UI:
   **APIs & Services → OAuth consent screen → Publish app**). Google states
   it directly: *"Authorizations by a test user will expire seven days from
   the time of consent. If your OAuth client requests an `offline` access
   type and receives a refresh token, that token will also expire."* and
   *"A project's publishing status is considered **In production** after
   selecting the **Publish app** button."*
   ([Manage App Audience](https://support.google.com/cloud/answer/15549945)).
   Publishing moves your own project out of "Testing", which removes that
   7-day refresh-token expiry. The only cost is the unverified-app warning
   during consent: Google *"will display an Unverified apps warning message
   if your project's OAuth clients request authorization of scopes
   considered sensitive or restricted before your project has completed
   verification for those scopes."* Verification is not required to stop the
   expiry — publish and ignore the warning for your own client. The
   basic-identity-scope exception (`openid`, `email`, `profile`) does not
   apply here, because the extension also requests Calendar scopes.
5. Create an OAuth client (APIs & Services > Credentials > Create
   Credentials > OAuth client ID) of type **"Desktop app"**. A Desktop-app
   client needs **no redirect-URI registration**: Google allows the
   loopback redirect on `http://127.0.0.1` with an ephemeral port, which is
   what the extension uses (`http://127.0.0.1:<port>/callback`).
6. Copy the **Client ID** (and secret, if one is issued) into the extension
   preferences (`googleClientId`, `googleClientSecret`).
7. The extension requests only `calendar.events`,
   `calendar.readonly`, `openid`, `email`, `profile`. No Contacts/People
   scopes are requested.

## Authentication

Two paths, both using your own Desktop-app client:

- **Browser (PKCE) flow** — the extension opens Google's consent page in
  your browser and listens on a loopback redirect
  (`http://127.0.0.1:<port>/callback`, always an OS-assigned ephemeral
  port) to complete the code exchange. Nothing is pasted by hand.
- **Paste-refresh-token flow** — mint a refresh token for your own
  Desktop-app client with `scripts/get-refresh-token.mjs` (run
  `node scripts/get-refresh-token.mjs --help`) and paste it into the
  `refreshToken` preference. On the next launch the extension exchanges it
  for a session with no browser interaction; the unauthenticated view also
  offers "Use Refresh Token from Preferences" to retry the exchange, and
  auto-attempts the exchange once on load when a refresh token is
  configured, with failures shown inline in the view (and in a toast).

  Warning: tokens minted for a different client ID — e.g. via the OAuth
  Playground or `gcloud` — do not match your configured Client ID and the
  exchange fails with `invalid_grant`. Always mint with the same Client
  ID/secret stored in the extension preferences.

Note: Vicinae's built-in `OAuth.PKCEClient.authorize` is intentionally
not used for the sign-in itself — its redirect URIs (raycast.com /
`raycast://` / `com.raycast:/`) are not usable with Google's Desktop-app
client type. But tokens ARE kept in Vicinae's secure OAuth credential
store: a stable module-level `OAuth.PKCEClient` persists the token set
via `setTokens` and reads it back via `getTokens` (cleared via
`removeTokens` on sign-out or when Google rejects the refresh token).
The custom loopback flow only performs the authorization; it never
stores tokens itself.

## Troubleshooting

- **`access_denied` in the browser.** Google denied the consent grant.
  The three usual causes: your account is not listed as a test user — add
  it under Google Auth Platform → Audience → Test users (older console UI:
  APIs & Services → OAuth consent screen); the consent screen user type is
  "Internal" and your account is outside that Workspace organization;
  or a Workspace admin policy blocks the unverified app.
- **`Google API error 403 … Calendar API has not been used in project …
  or it is disabled`.** The Google Calendar API is not enabled for your
  project. Enable it at the URL in the error message (APIs & Services >
  Library > Google Calendar API), wait ~1–2 minutes for the change to
  propagate, then retry — no re-sign-in is needed.
- **`insufficient authentication scopes`.** The stored token was issued
  for a different OAuth client or scope set. Sign out (clears stored
  tokens) and sign in again.
- **`invalid_grant` from a pasted refresh token.** The token was minted
  for a different Client ID. Mint it for the same Client ID stored in the
  extension preferences with `node scripts/get-refresh-token.mjs --help`
  — not via the OAuth Playground or `gcloud`. A testing-mode refresh token
  also stops working about 7 days after consent; the fix is to publish the
  app (**Google Auth Platform → Audience → Publish app**) rather than
  re-signing in every week. See setup step 4.
- **Nothing shows up in Vicinae's OAuth store.** Stale entry from before
  the token-storage fix — tokens now live in Vicinae's OAuth credential
  store via `OAuth.PKCEClient.setTokens`/`getTokens`/`removeTokens` (see
  "Authentication" above). If you signed in before this change, sign out
  and sign in again so the session moves to the OAuth store.

## Preferences

- `googleClientId`, `googleClientSecret`, `refreshToken`,
  `defaultCalendarId`, `defaultEventDuration`, `sendInvitations`,
  `addSignature` (extension-level); `daysToShow`, `showLocation`,
  `openCommandJoinsMeeting` (`list-events`-level).
- `addSignature` appends "Created with Vicinae" to the description and
  applies to the **Create Event form only**: the Calendar `quickAdd`
  endpoint accepts no description parameter, so quick add cannot carry the
  signature. Intentional, not a bug.

## Limitations

- No edit/delete of events, no attendee response (accept/decline) actions,
  no recurrence creation.
- No Google Contacts / People API integration (no attendee lookup).
- No AI tools or Raycast AI integration.
- No Google Workspace admin features (no domain-wide delegation, no room
  or resource management).
- Recurring-event listing relies on `singleEvents=true` server-side
  expansion (no separate recurring-master merge).
- Single-account only; no multi-account switching.

## License

MIT.
