# Vicinae Extensions

This repository hosts all the source code for the Vicinae extensions that can be installed from the Vicinae store.

If you are looking to build your own Vicinae extension, refer to the [Vicinae documentation](https://docs.vicinae.com/extensions/introduction).

## Install a vicinae extension

In order to install a vicinae extension that made it to the store, the best way is to use the extension store command from vicinae directly.

If you want to install extensions manually though, here is what you need to do:

Clone the repository. you might want to use [git sparse checkout](https://git-scm.com/docs/git-sparse-checkout) as the repository is growing big:

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
