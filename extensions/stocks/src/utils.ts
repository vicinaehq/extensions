import { Color } from "@vicinae/api";
import { CURRENCY_SYMBOLS, SPARKLINE_WIDTH } from "./constants";
import type { StockData } from "./types";

export function getColorForChange(change: number): Color {
  if (change > 0) return Color.Green;
  if (change < 0) return Color.Red;
  return Color.SecondaryText;
}

export function formatPrice(
  price: number | undefined,
  currency: string = "USD",
): string {
  if (price === undefined) return "-";

  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const locale =
    currency === "USD"
      ? "en-US"
      : currency === "EUR"
        ? "de-DE"
        : currency === "GBP"
          ? "en-GB"
          : "en-US";

  // For EUR, put symbol after; for others, before
  const symbolAfter = currency === "EUR";

  const formattedPrice = price.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return symbolAfter
    ? `${formattedPrice} ${symbol}`
    : `${symbol}${formattedPrice}`;
}

export function formatNumber(num: number | undefined): string {
  if (num === undefined) return "-";

  if (Math.abs(num) >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`;
  } else if (Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  } else if (Math.abs(num) >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  } else {
    return num.toFixed(2);
  }
}

export function generateSparkline(
  prices: (number | undefined)[],
  width: number = SPARKLINE_WIDTH,
): string {
  if (!prices || prices.length < 2) return "";

  // Filter out invalid prices
  const validPrices = prices.filter((p): p is number => p != null && !isNaN(p));
  if (validPrices.length < 2) return "";

  const min = Math.min(...validPrices);
  const max = Math.max(...validPrices);
  const range = max - min;

  if (range === 0) return "─".repeat(width); // Flat line

  const sparkChars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

  // Sample prices to fit the width
  const sampledPrices: number[] = [];
  const stepSize = Math.max(1, Math.floor(validPrices.length / width));

  for (let i = 0; i < validPrices.length; i += stepSize) {
    sampledPrices.push(validPrices[i]!);
  }

  // Fill with last value if still short
  while (sampledPrices.length < width && validPrices.length > 0) {
    sampledPrices.push(validPrices[validPrices.length - 1]!);
  }
  sampledPrices.splice(width); // Ensure exactly width

  return sampledPrices
    .map((price) => {
      const normalized = (price - min) / range;
      const index = Math.min(
        sparkChars.length - 1,
        Math.floor(normalized * (sparkChars.length - 1)),
      );
      return sparkChars[index];
    })
    .join("");
}

export function getMarketStatus(stock: StockData): {
  status: string;
  color: Color;
} {
  if (!stock.meta.currentTradingPeriod || !stock.meta.regularMarketTime) {
    return { status: "Unknown", color: Color.SecondaryText };
  }

  const now = Date.now() / 1000; // Convert to seconds

  const pre = stock.meta.currentTradingPeriod.pre;
  const regular = stock.meta.currentTradingPeriod.regular;
  const post = stock.meta.currentTradingPeriod.post;

  if (now >= pre.start && now <= pre.end) {
    return { status: "Pre-Market", color: Color.Orange };
  } else if (now >= regular.start && now <= regular.end) {
    return { status: "Market Open", color: Color.Green };
  } else if (now >= post.start && now <= post.end) {
    return { status: "After-Hours", color: Color.Blue };
  } else {
    return { status: "Market Closed", color: Color.SecondaryText };
  }
}
