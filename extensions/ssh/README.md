# SSH Extension for Vicinae

This extension allows you to quickly open a remote host via SSH from Vicinae. It provides a command (`ssh`) that launches an SSH session using your preferred terminal executor.

- **SSH Command**: Easily connect to a remote host using SSH.
- **Customizable terminal**: Configure the terminal used to launch SSH, if empty rollback to default.

## Usage
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the extension in development mode:
   ```bash
   npm run dev
   ```
3. Build the production bundle:
   ```bash
   npm run build
   ```

## Configuration
You can customize the terminal command in the extension preferences. If empty it will use the default (see vicinae doc) but you can use something like  `kitty -1 kitten`, do what suits your workflow.

## License
MIT

