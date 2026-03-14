# Google Calendar Extension for Vicinae

View and manage your Google Calendar events directly from Vicinae. List upcoming events, join Google Meet calls with one click, and create new events with ease.

## Features

- ✅ **List upcoming events** - View all your calendar events in one place
- ✅ **Join Google Meet** - One-click access to video conferences
- ✅ **Multiple calendars** - Support for all your Google Calendars
- ✅ **Search events** - Quickly find events by title
- ✅ **Create events** - Add new events with Google Meet integration (coming soon)

## Installation

This extension is available in the Vicinae extensions store. Once installed, you'll need to complete the OAuth setup below.

## Setup Instructions

### Prerequisites

- Google account with Google Calendar access
- Google Cloud Console project (free to create)

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter a project name (e.g., "Vicinae Calendar")
4. Click "Create"

### Step 2: Enable Google Calendar API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Google Calendar API"
3. Click on it and click "Enable"

### Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - Choose "External" user type
   - Fill in app name (e.g., "Vicinae Calendar")
   - Add your email as developer contact
   - Click "Save and Continue"
   - Skip scopes (click "Save and Continue")
   - Add yourself as a test user
   - Click "Save and Continue"
4. Back in "Create OAuth client ID":
   - Application type: "Desktop app"
   - Name: "Vicinae Calendar Client"
   - Click "Create"
5. **Important:** Copy your Client ID and Client Secret - you'll need these next!

### Step 4: Configure Redirect URI

1. In the credentials page, click on your newly created OAuth 2.0 Client ID
2. Under "Authorized redirect URIs", click "Add URI"
3. Add: `http://localhost:8080`
4. Click "Save"

### Step 5: Get Your Refresh Token

We've created a helper script to make this easy:

1. Navigate to the extension directory:

   ```bash
   cd extensions/google-calendar
   ```

2. Run the helper script:

   ```bash
   node scripts/get-refresh-token.js
   ```

3. Follow the prompts:
   - Enter your OAuth Client ID (from Step 3)
   - Enter your OAuth Client Secret (from Step 3)
   - A browser window will open automatically
   - Sign in to your Google account
   - Click "Allow" to grant calendar access
   - The script will display your refresh token

4. Copy the three values displayed:
   - OAuth Client ID
   - OAuth Client Secret
   - Refresh Token

### Step 6: Configure Extension Preferences

1. Open Vicinae
2. Go to Extension Settings for Google Calendar
3. Paste your three values:
   - **OAuth Client ID**: Your client ID from Google Cloud Console
   - **OAuth Client Secret**: Your client secret
   - **Refresh Token**: The refresh token from the helper script

4. Save preferences

That's it! You're ready to use the extension.

## Usage

### List Events

Run the "List Events" command to view your upcoming calendar events. Events are grouped by:

- Today
- Tomorrow
- Next Week
- Rest of Month
- Future months

### Create Event

Run the "Create Event" command to add new events to your calendar:

- Set title, date/time, and duration (supports formats like `30m`, `1h`, `1h30m`)
- Choose which calendar to add the event to
- Optionally add Google Meet video conference
- Invite attendees with comma-separated email addresses
- Add location and description

### Actions

For each event, you can:

- **View Details** (`Cmd+D`) - See full event information with attendees and description
- **Join Google Meet** (`Cmd+J`) - Opens video conference in browser (if available)
- **Open in Google Calendar** (`Cmd+O`) - Opens event in browser
- **Copy Meeting Link** (`Cmd+C`) - Copies Google Meet link to clipboard
- **Copy Event Link** (`Cmd+Shift+C`) - Copies Google Calendar event URL
- **Create Event** (`Cmd+N`) - Opens form to create a new event
- **Refresh Events** (`Cmd+R`) - Reloads events from Google Calendar

### Keyboard Shortcuts

#### List Events View

| Shortcut | Action |
|----------|--------|
| `Cmd+D` | View event details |
| `Cmd+J` | Join Google Meet (if available) |
| `Cmd+O` | Open event in Google Calendar |
| `Cmd+C` | Copy meeting/event link |
| `Cmd+Shift+C` | Copy event link (when Meet link present) |
| `Cmd+N` | Create new event |
| `Cmd+R` | Refresh events |
| `↑/↓` | Navigate events |
| `Enter` | View selected event details |

#### Event Detail View

| Shortcut | Action |
|----------|--------|
| `Cmd+J` | Join Google Meet (if available) |
| `Cmd+O` | Open in Google Calendar |
| `Cmd+C` | Copy meeting link |
| `Cmd+R` | Refresh events |
| `Esc` | Return to list view |

#### Create Event Form

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` | Submit form and create event |
| `Esc` | Cancel and return to list |

### Multiple Calendars

Use the dropdown in the search bar to switch between your calendars. The current calendar name and last update time are shown in the navigation title.

**Note**: Currently, the calendar dropdown requires keyboard navigation (arrow keys + Enter) to switch calendars. Mouse clicks don't trigger the onChange event due to a Vicinae platform bug.

### Deeplinks & Sharing

You can easily share calendar events with others:

1. **Copy Event Link** (`Cmd+C` or `Cmd+Shift+C`):
   - Copies the Google Calendar web URL for the event
   - Anyone with access to the calendar can view the event
   - Link format: `https://calendar.google.com/calendar/event?eid=...`

2. **Share via Google Calendar Web**:
   - Use "Open in Google Calendar" (`Cmd+O`)
   - Click "Share" in the web interface for more options

3. **Google Meet Links**:
   - Meet links are automatically included in events
   - Copy with "Copy Meeting Link" action
   - Anyone with the link can join the meeting

**Example deeplink usage:**

- Paste event links in Slack/Discord for team visibility
- Add to project management tools (Jira, Notion, etc.)
- Include in email invitations
- Bookmark important recurring events

## Known Issues

### Calendar Dropdown Mouse Clicks Not Working

**Issue**: Clicking on calendar items in the dropdown with the mouse doesn't switch calendars.

**Workaround**: Use keyboard navigation:

1. Click the dropdown or press Tab to focus it
2. Use arrow keys (↑/↓) to navigate calendar options
3. Press Enter to select

**Status**: This is a bug in Vicinae's `List.Dropdown` component when used in `searchBarAccessory`. The issue has been reported to the Vicinae team. The dropdown works correctly with keyboard navigation.

## Troubleshooting

### "Authentication Failed" Error

**Cause**: Invalid OAuth credentials or expired refresh token.

**Solution**:

1. Verify your Client ID and Secret are correct
2. Re-run `node scripts/get-refresh-token.js` to get a new refresh token
3. Update your extension preferences

### "Token Refresh Failed" Error

**Cause**: The refresh token might be revoked or invalid.

**Solution**:

1. Go to [Google Account Permissions](https://myaccount.google.com/permissions)
2. Revoke access for your Vicinae Calendar app
3. Re-run the setup process from Step 5

### No Events Showing

**Possible causes**:

- You might not have any upcoming events
- The calendar selected in the dropdown might be empty
- Try switching to "All Calendars" in the dropdown

### Port 8080 Already in Use

If you get a "port already in use" error when running the helper script:

**Solution**:

1. Close any applications using port 8080
2. Or manually complete OAuth:
   - Visit the URL printed by the script in your browser
   - After authorizing, you'll be redirected to localhost:8080
   - Copy the `code` parameter from the URL
   - Contact support for help exchanging the code for a refresh token

## Privacy & Security

- All credentials are stored locally in Vicinae
- Refresh tokens are stored securely in your system
- No data is sent to third parties
- OAuth tokens are encrypted during transmission to Google

## Future Enhancements

This extension is designed for easy migration when Vicinae adds native OAuth support. When that happens:

- ✨ One-click OAuth authorization (no manual token setup)
- 🔄 Automatic credential management
- 🚀 Faster setup process

For now, the manual OAuth flow ensures full functionality while we wait for platform OAuth support.

## Support

If you encounter issues:

1. Check the Troubleshooting section above
2. Open an issue on the [nd-vicinae-extensions](https://github.com/YOUR_REPO/nd-vicinae-extensions) repository
3. Include error messages and steps to reproduce

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

## License

MIT
