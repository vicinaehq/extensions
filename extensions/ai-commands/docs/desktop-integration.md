# Desktop integration

Linux commands get desktop entries in `$XDG_DATA_HOME/vicinae-ai-commands/launcher-data/applications`, outside the normal shared application directories. They contain the command name, icon, and Vicinae invocations for Run and Edit with its ID, never the prompt or selected text. Vicinae watches this directory and indexes changes automatically. The entries still belong to Vicinae's **Applications** provider.

This setup is tested on Omarchy with a user-owned shell launcher. It does not support every Vicinae installation method. Commands still work from **AI Commands** without it.

Clone this repository and run `npm ci` if you installed from the Store. From the repository directory, configure the integration once:

```sh
npm run setup:launcher
```

Restart Vicinae through the configured wrapper. If your user service already starts `~/.local/bin/vicinae`, run:

```sh
systemctl --user restart vicinae.service
```

Then open **AI Commands** once. Existing commands are published privately before their owned legacy entries are removed from the shared applications directory. IDs remain unchanged. Subsequent saves, renames, and deletes update the private entries automatically. A migration failure reports the affected command while keeping the management list available.

The setup script targets a user-owned two-line shell launcher at `~/.local/bin/vicinae` that delegates to an absolute executable or a `$HOME` path. Pass `-- --launcher /absolute/path` to use another supported wrapper. It refuses system binaries, symlinks, custom wrapper logic, linked settings files, and an existing custom Applications Launch Prefix. It preserves JSON comments and unrelated settings, backs up the original launcher and settings under `$XDG_DATA_HOME/vicinae-ai-commands/launcher-bin`, and adds the private data path only for `vicinae server` starts. Start Vicinae through that wrapper, including its service; directly running a different binary bypasses this setup. The setup does not restart Vicinae itself or change service definitions. If your installation has only a packaged binary such as `/usr/bin/vicinae`, it is outside the automatic setup's scope. Keep using the internal command list until a suitable launcher is configured.

Applications launched through Vicinae's application provider, including desktop sub-actions and terminal launches, use a wrapper that removes the private path before preserving the normal UWSM or direct-launch behavior. This extension also removes the private path from its AI harness processes. Normal system menus outside that environment do not discover these entries. This is search-path isolation, not a sandbox: Vicinae's separate **Run executable** action in file search and unrelated extensions that spawn processes directly bypass the app launch prefix and may pass the private path to their children.

Before removing the launcher integration, restore the original launcher from `launcher-bin/vicinae-original`, remove only its managed `providers.applications.preferences.launchPrefix` setting, and restart Vicinae. Keep later unrelated settings changes; do not overwrite the current settings file with an old full backup. The original setting is recorded in the settings backup referenced by `launcher-bin/setup.json`.

Deleting a command removes its owned desktop entries from both private and legacy directories. Deletion works even if the Vicinae executable is no longer discoverable. Delete commands before uninstalling the extension if you also want their root-search entries removed.
