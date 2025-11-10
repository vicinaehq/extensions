# Stocks

A [Vicinae](https://github.com/vicinaehq/vicinae) extension for checking real-time stock prices and market data from Yahoo Finance.

## Features

- Real-time stock prices
- Price changes and percentages
- **Color-coded indicators** - green for gains, red for losses, gray for no change
- **Sparkline charts** showing the last 20 trading days
- Market data like open, high, low, volume, and 52-week range
- **Time range picker** - check 1 day, 5 days, 1 month, year-to-date, 1 year, 5 years, or all time
- **Market status** - see if markets are open, closed, pre-market, or after-hours
- **Smart sorting** - winners first, then by biggest changes
- Set how often to refresh data
- Track multiple stocks at once
- Automatic currency formatting
- Exchange info and trading times
- Quick links to Yahoo Finance
- Handles errors for bad stock symbols

## Setup

### Stock Symbols

Add your stocks as a comma-separated list (like `AAPL,MSFT,GOOGL,TSLA`) in the settings.

### Refresh Interval

Pick how often to update prices:

- 30 seconds
- 1 minute (default)
- 5 minutes
- 15 minutes

### Time Range

Choose the default period for price changes:

- 1 day (default)
- 5 days
- 1 month
- Year-to-date
- 1 year
- 5 years
- All available data

## How to Use

1. Install the extension
2. Add your stock symbols in the settings
3. Pick your refresh rate and default time range
4. Run the "Stocks" command to see prices

Data refreshes automatically. Stocks sort with winners on top, then by biggest changes. Change the time range with the dropdown. Switch to detail view for more info like exchange status, volume, and yearly ranges.

## Data

Pulls from Yahoo Finance. Shows:

- Current price and change (based on your time range)
- **Mini chart** of the last 20 trading days
- Open and previous close prices
- Daily highs and lows
- Trading volume
- 52-week highs and lows
- Exchange details and market status

## Development

You can install the required dependencies and run your extension in development mode like so:

```bash
bun install
bun run dev
```

If you want to build the production bundle, simply run:

```bash
bun run build
```
