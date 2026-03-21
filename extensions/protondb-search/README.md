# ProtonDB Search Extension

Search for Steam games and check their Linux compatibility ratings via ProtonDB directly from Vicinae.

## Features

- **Real-time Steam Search**: Search the entire Steam catalog with instant results
- **Featured Games**: Popular games displayed by default for quick access
- **ProtonDB Ratings**: Automatically fetches compatibility ratings for each game
- **Visual Tier Indicators**: Color-coded badges and emojis for quick compatibility assessment
- **Detailed Preview**: View game details, description, and comprehensive ProtonDB statistics
- **Comprehensive Actions**:
  - Preview game details with ratings and description
  - Open game on ProtonDB to see detailed compatibility reports
  - Open game on Steam Store
  - Copy ProtonDB URL
  - Copy compatibility summary

## Compatibility Tiers

Games are rated on ProtonDB based on community testing:

- 🐧 **Native**: Native Linux support
- 💎 **Platinum**: Runs perfectly out of the box
- 🥇 **Gold**: Runs perfectly after tweaks
- 🥈 **Silver**: Runs with minor issues
- 🥉 **Bronze**: Runs but has significant issues
- ❌ **Borked**: Won't run
- ❓ **Pending**: Not yet tested / No rating available

## Usage

1. Open the extension in Vicinae
2. Browse featured games or type to search for a specific game
3. View real-time ProtonDB compatibility ratings in the list
4. Press `Enter` to see detailed game preview with full statistics
5. Press `Cmd+P` to open the game on ProtonDB
6. Press `Cmd+S` to open the game on Steam

## Data Sources

- **Steam Community API**: For game search results
- **Steam Store API**: For game details and descriptions
- **ProtonDB API**: For Linux compatibility ratings and reports

## Keyboard Shortcuts

- `Enter`: Show game details preview
- `Cmd+P`: Open game on ProtonDB
- `Cmd+S`: Open game on Steam Store
- `Cmd+C`: Copy ProtonDB URL
- `Cmd+Shift+I`: Copy full compatibility info (when available)

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## License

MIT
