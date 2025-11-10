# Rodalies Train Departures

A Vicinae extension to check real-time Rodalies train departures in Catalonia, Spain.

## Features

- **Dynamic Station List**: Automatically fetches all Rodalies stations from the official API
- **Real-time Departures**: Shows live train departures from selected stations with delays and platforms
- **Station Selection**: Dropdown populated with all available Rodalies stations (200+ stations)
- **Rich Train Info**: Displays train type, line, destination, platform, and delay information
- **Auto-refresh**: Updates based on your configured interval (default: 5 minutes)
- **Smart Filtering**: Only shows stations with Rodalies train service
- **Smart Error Handling**: Clear messages when no departures are available

## Usage

1. Install the extension
2. Run the "Train Departures" command
3. Use the dropdown in the search bar to select your departure station
4. View real-time departures with destinations, platforms, and delays
5. Copy departure times or refresh data as needed

## Interface

- **Station Dropdown**: Select departure station in the search bar
- **Departure List**: Shows next 10 departures with full details
- **Train Details**: Line, type, destination, platform, delay status
- **Actions**: Copy departure time, copy full info, refresh data
- **Auto-refresh**: Updates every 5 minutes (configurable)

## API

This extension uses the official Rodalies de Catalunya APIs:

- **Stations API**: `https://serveisgrs.rodalies.gencat.cat/api/stations?lang=en` - Fetches all available stations
- **Departures API**: `https://serveisgrs.rodalies.gencat.cat/api/departures?stationId={id}&minute=60&fullResponse=true&lang=en` - Gets real-time departures

The extension automatically filters stations to show only those with Rodalies train service.

## License

MIT