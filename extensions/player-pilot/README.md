# Player Pilot

A comprehensive media player controller for Vicinae that provides a beautiful grid interface to view and control all your media players.

## Features

- **Grid View**: See all your media players in a clean, organized grid
- **Smart Filtering**: Filter players by name using preferences (e.g., `spotify,brave,vlc`)
- **Real-time Status**: Shows playing, paused, and stopped states with proper sorting
- **Rich Metadata**: Displays album art, song titles, artists, and album information
- **Individual Controls**: Play/pause, next, previous, and stop for each player
- **Auto-refresh**: Updates every 2 seconds to keep information current

## Usage

1. Run the `Player Pilot` command
2. See all your media players in a grid layout
3. Click on any player to control it
4. Use the action panel for play/pause, skip, and stop controls

## Configuration

Set the `Playerctl Players` preference to filter which players to show:
- `%any` - Show all players (default)
- `spotify,brave` - Show only Spotify and Brave players
- `vlc` - Show only VLC players

## Requirements

- `playerctl` installed on your system
- Media players that support MPRIS (most modern players do)

## Supported Players

Works with any MPRIS-compatible media player including:
- Spotify
- VLC
- Firefox/Chrome/Brave (for web media)
- Rhythmbox
- Audacious
- And many more!