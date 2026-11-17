# ArchSeek Vicinae Extension
Welcome to the ArchSeek vicinae extension!

This is an extension for the [vicinae launcher](https://github.com/vicinaehq/vicinae). It allows you to quickly query the Arch Wiki and read wiki pages directly from Vicinae! You can also search packages, both from official repos and the AUR, see their PKGBUILD, and even see the most recent commits/changes!

If you prefer to read the page in your browser, there's an action for that, too.  

![AUR package search results](screenshots/Search-AUR-demo.png)
_Results of an AUR Package search_  


![Choose a commit](screenshots/commits-list.png)
_Choose a commit to see its changes in the AUR PKGBUILD Changes menu_


![colored diffs](screenshots/colored-diffs.png)  
_Colored diffs viewer_


## Usage

This extension has two commands: Search Wiki, which as the name implies, allow to search articles on the Arch Wiki, and Search Packages, which let you search packages both in the Arch packages repositories and the AUR. You can filter for both, or either of those, and have actions, like seeing recent PKGBUILD changes, reading the current PKGBUILD, and install the package on your system.


## Preferences

Currently, ArchSeek provides two settings: 
- "AUR Helper", which sets the path to the AUR helper you want to use when installing an AUR package from the action menu (default: `/usr/bin/yay`).
- "Run Package Database Probing", which enables or disables probing of `pacman`'s installed package database to know if a selected package is installed or not (default: `disabled`).

## Requirements

This extension is made for Arch Linux/Arch based distributions. You need to have `pacman` and an AUR helper installed on your system (`yay`,`paru`,etc) if you want to be able to install AUR packages from the Actions menu.


## Installation
As this extension is currently a work in progress, it is not yet published on the Vicinae extension store. If you want to run it in your system, you need to do the following:

1) Make sure to have `npm` installed on your system
2) clone this repository: 
```bash
git clone https://github.com/Hash-AK/ArchSeek-vicinae
```
3) Go into that newly created directory : 
```bash
cd ArchSeek-vicinae
```
4) run: 
```bash
npm install
```
then:
```bash
npm run build
```
5) Now in Vicinae you should see "ArchSeek"!

## AI Disclosure
During this project, I sometimes used AI to debug/help me find solutions for bugs that were occurring. No code was directly taken from AI, thought.

## License

This project is licensed under the MIT license. You can read more about it in the [LICENSE](LICENSE) file.