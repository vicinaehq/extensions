# Skate Extension for Vicinae

This extension provides integration with [Skate](https://github.com/charmbracelet/skate), a personal key-value store, directly within Vicinae.

## Features

- **Unified Interface**: Single command to browse and manage all Skate databases and keys
- **Database Filtering**: Dropdown filter to quickly switch between databases
- **Key-Value Management**: View, add, edit, and delete key-value pairs
- **Quick Actions**: Copy values to clipboard, edit keys inline
- **Search**: Filter keys within the selected database
- **Skate Expressions**: Support for `key@database` syntax when adding keys to create them in specific databases

## Commands

### Skate (`skate`)

The unified interface for managing Skate databases and key-value pairs.

**Main Features:**
- **Database Dropdown**: Filter dropdown in the search bar to switch between databases
- **Key Listing**: Browse all keys in the selected database with value previews
- **Search**: Filter keys using the search bar

**ActionPanel Actions:**
- **Add Key** - Create new key-value pairs in the current database (uses search query as initial key). Supports Skate expressions like `key@database` to create keys in specific databases.

**Key Actions:**
- Copy value to clipboard
- Edit value (opens form with current key/value pre-filled)
- Delete key (destructive action)

## Requirements

- [Skate](https://github.com/charmbracelet/skate) must be installed and available in your PATH
- Skate databases are created automatically when you first set a value with a database flag

## Usage Examples

```bash
# Create test data
skate set name "John Doe" @contacts
skate set email "john@example.com" @contacts
skate set api-key "secret123" @config

# Use the extension
# 1. Run "Skate" command - use the database dropdown to select a database
# 2. Browse keys in the selected database
# 3. Search for specific keys using the search bar
# 4. Type a new key name in search, then click "Add Key" to create it
# 5. Use Skate expressions like "mykey@otherdb" to create keys in specific databases
# 6. Add new keys, edit existing ones, or manage databases
```

## Troubleshooting

The extension provides detailed error messages and robust validation:

- **Input Validation**: Keys and values cannot be empty or whitespace-only
- **Detailed Errors**: Specific error messages from Skate commands
- **Console Logging**: Debug information available in terminal/console
- **Installation Check**: Detects when Skate is not installed

**Common Issues:**
- **Empty keys/values**: Form validation prevents submission
- **Permission errors**: Check file permissions for Skate databases
- **Command failures**: Detailed stderr output helps diagnose issues