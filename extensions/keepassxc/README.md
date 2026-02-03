<p align="center">
 <img width="125" src="https://raw.githubusercontent.com/raycast/extensions/main/extensions/keepassxc/assets/keepassxc.png">
</p>

<h1 align="center">KeePassXC for Vicinae</h1>

<b align="center">Search your passwords, usernames, TOTP codes, and more using KeePassXC directly from Vicinae.</b>

## Requirements

To use this extension, you will need:

- Installed [KeePassXC](https://keepassxc.org)
- The `keepassxc-cli` HAVE TO be in the $PATH (Mostly in `/usr/bin` or in `/usr/local/bin`)
- A `.kdbx` file that contains entries

## Installation

The KeePassXC can be installed on linux several ways

#### Fedora

```shell
$ sudo dnf install keepassxc
```

#### Ubuntu and Debian based distros

```shell
$ sudo apt install keepassxc
```

#### Arch based distros

```shell
$ sudo pacman -Sy keepassxc
```

## Security Note

Your credentials required to access your KeePass database, which include a password and an optional key file, are securely stored in [Vicinae's local encrypted database](https://developers.raycast.com/information/security#data-storage). This storage prevents other extensions from accessing the storage of that extension.

## Future

The KeePassXC that is installed from flatpak, snap or AppImage is currently not supported. But after a while maybe will be developed in the extension.
