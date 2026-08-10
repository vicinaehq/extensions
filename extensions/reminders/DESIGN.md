# Design

## Runtime

Vicinae's native interval scheduler scans for due reminders once per minute. The notification helper is bundled as CommonJS and runs on Node.js 20+. Executable paths are discovered, validated, and stored as absolute paths.

## Storage

Each reminder is an atomic JSON file under the XDG data directory. Writes use a process lock, temporary file, `fsync`, and rename. Versioned records and infrastructure metadata make upgrades fail safely.

## Scheduling

Recurring reminders store local calendar dates and wall-clock times. This preserves the intended time across DST and timezone changes. Missed occurrences produce one notification before advancing to the next future occurrence.

## Notifications

Each notification runs in its own transient systemd service, so waiting for an action does not block other reminders. The helper watches its bundled extension asset and exits if the extension is removed. Notification text is passed as an argument, never through a shell. Only the explicit **Complete** action completes a reminder.
