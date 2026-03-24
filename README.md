# Vicinae Extensions

This repository hosts the following:

- source code for vicinae extensions published to the official store, directly installable from the store command in the app. These extensions are submitted/updated via pull request and manually approved before each release.
- raycast extension compatibility tracker under `./raycast/compat.json`.
- issue tracking for vicinae extension problems and raycast extension *compatibility* problems.

If you are looking to build your own vicinae extension, we recommend reading the [documentation](https://docs.vicinae.com/extensions/introduction). Once you are done, consider submitting to the store if it's ready for others to use.

## Report a vicinae extension bug / request a feature

If you want to report a problem with a native vicinae extension or request a new feature, use the [GitHub issue tracker](https://github.com/vicinaehq/extensions/issues/new/choose) and select the right template.

## Report a Raycast extension compatibility issue

Some Raycast extensions don't work on vicinae for various reasons. If you want to report a compatibility issue for an extension you would really like to have working, use the [GitHub issue tracker](https://github.com/vicinaehq/extensions/issues/new/choose) and select the right template.

Do _NOT_ use our tracker to report bugs that are also present in the official Raycast. We exclusively track compatibility problems here.

## Install a vicinae extension

In order to install a vicinae extension that made it to the store, the best way is to use the extension store command from vicinae directly.

If you want to install extensions manually though, here is what you need to do:

Clone the repository. You might want to use [git sparse checkout](https://git-scm.com/docs/git-sparse-checkout) as the repository is growing big:

```bash
git clone https://github.com/vicinaehq/extensions
```

Then move to the directory of the extension you are interested in:

```bash
cd extensions/bluetooth
npm install
npm run build
```

If all of the above succeeded, the extension should now be installed and ready to be used. Restarting vicinae is not required.

## Submit Your Extension

If you want to submit your own extension to the vicinae store, make sure you follow these steps:

### 1. Read the Guidelines

Review the [extension guidelines](/GUIDELINES.md) and ensure your extension complies with all requirements.

### 2. Submit a Pull Request

- Fork this repository
- Add or update your extension under the `extensions/` directory
- Create a pull request with a clear description of your extension
- Wait for a review from the maintainers

### 3. Publication

If your pull request is merged, your extension is automatically built, validated, and made available for download from the Vicinae store.
