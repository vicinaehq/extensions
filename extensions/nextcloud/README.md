# Nextcloud for Vicinae

Search files, contacts, calendar events, and mail in your Nextcloud instance directly from Vicinae.

## Features

- **Files**: Search files and folders — open in browser or copy the path.
- **Contacts**: Search contacts with lazy-loaded vCard details (email, phone, org, address, birthday, website).
- **Calendar**: Search events with lazy-loaded details (when, location, organizer, status, description). Opens the correct occurrence in Nextcloud Calendar.
- **Mail**: Search emails with full body text loaded on selection (from, to, cc, date, attachments).

## Setup

1. **Nextcloud URL**: Your full instance URL (e.g., `https://cloud.yourdomain.com`).
2. **Username**: Your Nextcloud login name.
3. **App Token**:
   - Log into Nextcloud.
   - Go to **Settings** → **Security**.
   - Scroll down to **Devices & sessions**.
   - Enter "Vicinae" as the app name and click **Create new app password**.
   - Paste the generated token into this extension's settings.

## Actions

| Key | Action |
|-----|--------|
| `Enter` | Open in browser |
| `Cmd+C` | Copy link |
| Additional copy actions available per result type (email, phone, path, etc.) |

## Requirements

Nextcloud apps required for full functionality:

| Feature | App |
|---------|-----|
| Files | Built-in |
| Contacts | Contacts |
| Calendar | Calendar |
| Mail | Mail |

Results only appear for apps that are installed and enabled on your instance.
