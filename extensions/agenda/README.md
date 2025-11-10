# Agenda

A [Vicinae](https://github.com/vicinaehq/vicinae) extension to view calendar events from iCal URLs in a clean agenda format.

## Features

- **Multi-calendar support**: Add multiple iCal calendar URLs with custom names and colors
- **Calendar filtering**: Filter events by specific calendar or view all calendars
- **Day-based organization**: Events grouped by day with smart date labels (Today/Tomorrow)
- **Event URL support**: Open events in browser when URLs are available in iCal data
- **Video conferencing integration**: Automatically detects and opens video meeting links from major platforms commonly found in calendar events (Google Meet, Zoom, Teams, Webex, GoToMeeting)
- **Automatic refresh**: Configurable refresh intervals with cache change detection
- **Event details**: Copy location to clipboard and open event URLs
- **Future events only**: Shows only upcoming events
- **Real-time updates**: Automatically detects calendar changes within 2 seconds
- **Persistent settings**: Remembers your last selected calendar filter

## Setup

1. **Get iCal URLs** from your calendar service:
   - **Google Calendar**: Go to Settings → [Calendar Name] → Integrate calendar → Public address in iCal format
   - **Outlook**: Calendar settings → Shared calendars → Publish calendar → ICS
   - **Apple Calendar**: Calendar app → Share → Public calendar → Copy link
   - **Other services**: Look for "iCal" or "ICS" export options

2. **Add URLs** using the extension commands:
   - Use "Add Calendar" command to add each iCal URL
   - Use "Manage Calendars" to view, edit, or remove configured calendars

## Usage

1. **Add Calendars**: Use the "Add Calendar" command to add iCal URLs from your calendar services
2. **Manage Calendars**: Use "Manage Calendars" to view, remove, or copy calendar URLs
3. **View Events**: Use the "Upcoming Events" command to view your upcoming events organized by day
   - Use the dropdown in the search bar to filter by specific calendar or view all
   - Press `Cmd+R` or use the refresh action to manually update calendars
   - Click on events with URLs to open them in your browser
   - Video call links from Google Meet, Zoom, Teams, Webex, and GoToMeeting in event descriptions are automatically detected and open in your web browser

## Preferences

- **Refresh Interval**: How often to update calendar data (5-60 minutes)

## Development

You can install the required dependencies and run your extension in development mode like so:

```bash
bun install
bun run dev
```

If you want to build the production bundle, simply run:

```bash
bun run build
```
