# Desktop integration

Linux commands get desktop entries in `$XDG_DATA_HOME/vicinae-ai-commands/launcher-data/applications`, outside the normal shared application directories. They contain the command name, icon, and Vicinae invocations for Run and Edit with its ID, never the prompt or selected text. Vicinae watches this directory and indexes changes automatically. The entries still belong to Vicinae's **Applications** provider.

Setup supports both user-owned shell launchers and standard packaged Vicinae user services. It does not support every Vicinae installation method. Commands still work from **AI Commands** without it.

## Enable root search

1. Install the extension and open **Setup AI Commands** in Vicinae.
2. Select **Enable Root Search**. The screen explains the launcher and settings changes before this action.
3. Select **Restart Vicinae** if offered. Otherwise quit and reopen Vicinae through your usual launcher.

Saved command entries are prepared during setup. After restarting, open Setup AI Commands again to verify the status. Subsequent saves, renames, and deletes update the entries automatically. Running setup again checks the existing files without rewriting them. If setup was interrupted, select **Resume Setup**. The extension validates its saved state and backups before continuing. The extension reports unsupported installations and changed configuration in the setup screen.

Restart is offered only for an active `vicinae.service` whose start command matches the configured launcher. The extension rechecks this immediately before queuing a restart. It does not restart Vicinae without the user's action.

## Supported installations

For an existing user-owned launcher, setup targets a two-line shell launcher at `~/.local/bin/vicinae` that delegates to an absolute executable or a `$HOME` path. It refuses system binaries, symlinks, custom wrapper logic, linked settings files, and an existing custom Applications Launch Prefix. It preserves JSON comments and unrelated settings, backs up the original launcher and settings under `$XDG_DATA_HOME/vicinae-ai-commands/launcher-bin`, and adds the private data path only for `vicinae server` starts. Start Vicinae through that wrapper, including its service; directly running a different binary bypasses this setup. Enabling root search does not restart Vicinae until you select the restart action. If there is no user launcher, setup detects an active `vicinae.service` using `vicinae`, `/usr/bin/vicinae` or `/usr/local/bin/vicinae`, with exactly `server` or `server --replace` as arguments. **Enable Root Search** creates `~/.config/systemd/user/vicinae.service.d/90-ai-commands.conf` (respecting `XDG_CONFIG_HOME`) containing only an `XDG_DATA_DIRS` environment override. It preserves the current search paths, configures the same application launch wrapper, and reloads the user service definitions. It never rewrites the packaged executable or `ExecStart`, and never creates a shadow executable on `PATH`. Restart remains a separate action.

Services with custom commands, environment files, or an `UnsetEnvironment=XDG_DATA_DIRS` setting are not automatically modified. Non-systemd launches, Flatpak and Nix store executables are not covered by this service path. Use the internal command list in those cases. An existing file at the managed drop-in path, symlinked configuration paths, or a custom Applications Launch Prefix is preserved and reported. Merely opening Setup does not create files or reload/restart services.

The saved setup records which method was used. Both methods support resuming an interrupted setup. Service reload or write failures roll back settings and the newly created drop-in; a pending recovery record retains the original settings. Later edits to managed files are reported instead of overwritten.

Applications launched through Vicinae's application provider, including desktop sub-actions and terminal launches, use a wrapper that removes the private path before preserving the normal UWSM or direct-launch behavior. This extension also removes the private path from its AI harness processes. Normal system menus outside that environment do not discover these entries. This is search-path isolation, not a sandbox: Vicinae's separate **Run executable** action in file search and unrelated extensions that spawn processes directly bypass the app launch prefix and may pass the private path to their children.

For service integration, remove only the extension-owned `90-ai-commands.conf`, remove its managed Applications Launch Prefix, run `systemctl --user daemon-reload`, and restart Vicinae. Preserve all other drop-ins and settings. The original settings backup and setup record are under `launcher-bin`. After removing the integration, remove its `launcher-bin` directory to allow a clean setup again.

For shell-launcher integration, restore the original launcher from `launcher-bin/vicinae-original`, remove only its managed `providers.applications.preferences.launchPrefix` setting, and restart Vicinae. Keep later unrelated settings changes; do not overwrite the current settings file with an old full backup. The original setting is recorded in the settings backup referenced by `launcher-bin/setup.json`.

Deleting a command removes its owned desktop entries from both private and legacy directories. Deletion works even if the Vicinae executable is no longer discoverable. Delete commands before uninstalling the extension if you also want their root-search entries removed.

## Command-line setup for development

The optional `npm run setup:launcher` script uses the same setup code. From a source checkout, pass `-- --launcher /absolute/path` to select a supported wrapper at a custom location. Store users do not need this script.
