# Software profiles

Depot software profiles are small, versioned JSON files for reviewing and
reproducing an application setup. They are package lists, not scripts or full
system images.

## Export

Open **Depot Manage**, open the action menu on an application, and choose
**Export Software Profile**. Review the detected software, toggle any entries
you do not want, and choose **Export Selected**. Depot writes a new
`depot-software-profile.json` file to Downloads when that directory exists, or
to the home directory otherwise. Existing files are never overwritten.

APT export starts from `apt-mark showmanual`, then keeps installed packages that
are not marked Essential or assigned required/important priority. Ubuntu's
installer can still mark packages as manual, so the list is explicitly shown
for review. Flatpak exports applications rather than runtimes.

AppImage entries contain only descriptive metadata such as their name,
filename, version, architecture, and whether Depot originally integrated them.
A filename alone is not enough provenance to download the same executable.

## Import

Open **Depot Install**, select **Import Software Profile**, and type a filename
or paste an absolute path. Depot uses Vicinae's file index inside the command,
so no focus-losing system file picker is required.

Before installation, Depot classifies entries as:

- available and selected for installation;
- already installed;
- unavailable from configured sources;
- unsupported because its backend is disabled or unavailable; or
- requiring user action, such as an AppImage without a trusted download source.

Press Enter on the ready row to confirm and install the selected APT and Flatpak
packages. Backends remain independent; Depot does not substitute one source for
another. AppImages already present under `~/Applications` are recognized by
their exact filename. Missing AppImages are never downloaded by guessing.

## Version 1 format

```json
{
  "version": 1,
  "apt": ["git", "curl"],
  "flatpak": ["org.gimp.GIMP"],
  "appimage": [
    {
      "name": "PCSX2",
      "filename": "PCSX2.AppImage",
      "source": "managed",
      "version": "2.0",
      "architecture": "x86_64"
    }
  ]
}
```

All package identifiers are exact. The only AppImage source values are
`managed` and `external`; they describe prior local ownership, not a remote
download source. Unknown fields, duplicate entries, unsupported versions,
symbolic links, oversized files, unsafe identifiers, and path-bearing AppImage
filenames are rejected.

Profiles cannot contain commands, hooks, repository changes, or executable
behavior. Selecting a profile never starts an installation by itself.
