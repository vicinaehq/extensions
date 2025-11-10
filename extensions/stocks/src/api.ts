import type { StockData, YahooFinanceResponse } from "./types";
import {
  SPARKLINE_DATA_POINTS,
  USER_AGENT,
  YAHOO_FINANCE_BASE_URL,
} from "./constants";

export async function fetchSparklineData(symbol: string): Promise<number[]> {
  try {
    // Get daily data for the last month to ensure consistent data points
    const response = await fetch(
      `${YAHOO_FINANCE_BASE_URL}${symbol.toUpperCase()}?interval=1d&range=1mo`,
      {
        headers: {
          "User-Agent": USER_AGENT,
        },
      },
    );

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as YahooFinanceResponse;

    if (!data.chart?.result?.[0]?.indicators?.quote?.[0]?.close) {
      return [];
    }

    const closes = data.chart.result[0].indicators.quote[0].close.filter(
      (price): price is number => price !== null && !isNaN(price),
    );

    // Take the last N points, pad with the first value if fewer
    if (closes.length >= SPARKLINE_DATA_POINTS) {
      return closes.slice(-SPARKLINE_DATA_POINTS);
    } else {
      const firstPrice = closes[0] || 0;
      const padding = new Array(SPARKLINE_DATA_POINTS - closes.length).fill(
        firstPrice,
      );
      return [...padding, ...closes];
    }
  } catch (error) {
    console.error(`Error fetching sparkline data for ${symbol}:`, error);
    return [];
  }
}

export async function fetchStockData(
  symbol: string,
  range: string = "5d",
): Promise<StockData | null> {
  try {
    let interval = "1d";
    if (range === "ytd") interval = "1wk";
    else if (range === "1y") interval = "1wk";
    else if (range === "5y" || range === "max") interval = "1mo";

    const response = await fetch(
      `${YAHOO_FINANCE_BASE_URL}${symbol.toUpperCase()}?interval=${interval}&range=${range}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as YahooFinanceResponse;

    if (!data.chart?.result?.[0]) {
      return null;
    }

    const result = data.chart.result[0];
    const meta = result.meta;
    const quote = result.indicators.quote[0];
    if (!quote) return null;
    const timestamps = result.timestamp;
    const rawCloses = quote.close.filter(
      (p): p is number => p !== null && !isNaN(p),
    );

    if (!timestamps.length || !quote.close.length) {
      return null;
    }

    // Use filtered closes for consistent calculations
    if (rawCloses.length === 0) {
      return null;
    }

    // Use API-provided values directly
    const currentPrice =
      meta.regularMarketPrice ?? rawCloses[rawCloses.length - 1];
    const previousClose = meta.chartPreviousClose ?? currentPrice;
    const change = currentPrice - previousClose;
    const changePercent =
      previousClose !== 0 ? (change / previousClose) * 100 : 0;

    // Find the latest valid index in original arrays for other fields
    let latestIdx = quote.close.length - 1;
    while (
      latestIdx >= 0 &&
      (quote.close[latestIdx] == null || isNaN(quote.close[latestIdx]!))
    ) {
      latestIdx--;
    }
    if (latestIdx < 0) {
      return null;
    }

    // Fetch consistent sparkline data (last 20 trading days)
    const sparklineData = await fetchSparklineData(symbol);

    return {
      ...result,
      currentPrice,
      previousClose,
      change,
      changePercent,
      open: quote.open[latestIdx] || undefined,
      high: quote.high[latestIdx] || undefined,
      low: quote.low[latestIdx] || undefined,
      volume: quote.volume[latestIdx] || undefined,
      sparklineData,
    };
  } catch (error) {
    console.error(`Error fetching stock data for ${symbol}:`, error);
    return null;
  }
}
