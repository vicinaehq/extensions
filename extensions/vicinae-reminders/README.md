# Vicinae Reminders

One-off and recurring reminders with natural-language dates for Vicinae on systemd Linux.

## Requirements

- Vicinae 0.24+
- Node.js 20+ or `vicinae-node`
- a systemd user session with `systemctl`, `systemd-run`, and `busctl`
- `notify-send` with actions and waiting support
- a graphical notification service with action buttons

Non-systemd, headless, and actionless notification environments are not supported. X11 and Wayland are supported. Reminders due while the notification service is unavailable are delivered when it becomes available again.

## Usage

Run **Remind Me**, then enter the reminder and its time:

```text
check the washing in 30 minutes
call the dentist tomorrow at 10
submit the report Friday at 3pm
renew the certificate on 18 August at 9
```

Date parsing is English; Automatic chooses UK or US numeric date order from the system region. Date-only reminders default to 09:00. Reminders can be completed, edited, snoozed, repeated, or deleted.

Vicinae checks for due reminders once per minute while it is running.

Notifications provide **Complete** and **Snooze...** actions. Clicking or closing a notification does not complete it. Unanswered notifications expire after one hour and are retried.

## Development

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run lint
npm run build
```

Additional integration checks are available through `worker:check` and `actions:check`.
The bundled PNG icon is rendered from `assets/icon.svg`.
