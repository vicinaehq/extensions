# Vicinae Extensions

This repository hosts all the source code for the Vicinae extensions that can be installed from the Vicinae store.

If you are looking to build your own Vicinae extension, refer to the [Vicinae documentation](https://docs.vicinae.com/extensions/introduction).

## Submit Your Extension

Want to share your extension with the Vicinae community? Follow these steps:

### 1. Read the Guidelines

Review the [extension guidelines](/GUIDELINES.md) and ensure your extension complies with all requirements.

### 2. Prepare Your Extension

- Place your extension in a directory under `extensions/` named after your extension's `name` field
- Ensure your `package.json` follows the [Vicinae extension schema](https://raw.githubusercontent.com/vicinaehq/vicinae/refs/heads/main/extra/schemas/extension.json)
- Validate your extension using `npx vici lint` (requires @vicinae/api v0.16.0+)

### 3. Submit a Pull Request

- Fork this repository
- Add or update your extension under the `extensions/` directory
- Create a pull request with a clear description of your extension
- Wait for a review from the maintainers

### 4. Publication

If your pull request is merged, your extension is automatically built, validated, and made available for download from the Vicinae store.

## Resources

- [Vicinae Documentation](https://docs.vicinae.com/extensions/introduction)
- [Extension Guidelines](/GUIDELINES.md)
- [Extension Schema](https://raw.githubusercontent.com/vicinaehq/vicinae/refs/heads/main/extra/schemas/extension.json)
