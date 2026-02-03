# Home Assistant Extension

A Vicinae extension to control and monitor your Home Assistant entities.

## Features

- Browse and control all Home Assistant entities
- Toggle lights, switches, fans, and other devices
- View entity states with formatted information
- Get appropriate icons for different entity types
- Generate entity-specific actions

## Installation

1. Install the extension via Vicinae
2. Configure your Home Assistant URL and long-lived access token

## Setup

1. Open the extension in Vicinae
2. Enter your Home Assistant instance URL (e.g., `http://homeassistant.local:8123`)
3. Enter your long-lived access token from Home Assistant settings

## Usage

- Browse all entities in your Home Assistant instance
- Click on entities to see their details and available actions
- Toggle entities on/off
- Control covers (open/close/stop)
- View climate temperatures

## Supported Entities

- **Lights**: Toggle on/off with brightness display
- **Switches**: Toggle on/off
- **Fans**: Toggle on/off
- **Covers**: Open, close, or stop
- **Climate**: View temperature settings
- **Sensors**: View state with units
- **Automation**: Toggle on/off
- **Scripts**: Execute scripts

## Requirements

- Home Assistant instance running
- Long-lived access token with sufficient permissions
- Vicinae launcher

## Security

- Your access token is stored locally in your Vicinae configuration
- All API calls are authenticated with your token
- No data is sent to third parties

## Troubleshooting

### Connection Issues
- Verify your Home Assistant URL is correct
- Check network connectivity
- Ensure Home Assistant is running

### Authentication Errors
- Verify your access token is valid
- Ensure the token has sufficient permissions
- Re-generate token if expired

### Entity Not Showing
- Ensure Home Assistant is responsive
- Check entity exists in Home Assistant
- Verify API endpoints are accessible

## API Endpoints

The extension uses the following Home Assistant API endpoints:
- `GET /api/states` - Fetch all entities
- `POST /api/services/{domain}/{service}` - Control entities

## License

MIT

## Author

knoopx
