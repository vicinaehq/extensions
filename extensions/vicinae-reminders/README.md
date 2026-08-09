# Vicinae Reminders

Natural-language one-off and recurring reminders for Vicinae on systemd Linux.

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

Notifications provide **Complete** and **Snooze...** actions. Clicking or closing a notification does not complete it.

## Development

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run lint
npm run build
```

Additional systemd checks are available through `lifecycle:check`, `worker:check`, and `actions:check`.
The bundled PNG icon is rendered from `assets/icon.svg`.

## Uninstalling

Use **Diagnostics → Remove Reminder Infrastructure** before uninstalling. This removes the worker and systemd units but keeps reminder data.
