import { Color, Icon, List } from "@vicinae/api";
import type { StockData } from "./types";
import {
  formatNumber,
  formatPrice,
  generateSparkline,
  getMarketStatus,
  getColorForChange,
} from "./utils";
import { SPARKLINE_WIDTH } from "./constants";

interface StockDetailProps {
  stock: StockData;
}

export function StockDetail({ stock }: StockDetailProps) {
  const getColorForPriceVsReference = (
    current: number,
    reference: number
  ): Color => {
    if (current > reference) return Color.Green;
    if (current < reference) return Color.Red;
    return Color.SecondaryText;
  };

  const getColorForPriceInRange = (
    current: number,
    low?: number,
    high?: number
  ): Color => {
    if (low === undefined || high === undefined) return Color.SecondaryText;
    const range = high - low;
    if (range === 0) return Color.SecondaryText;
    const position = (current - low) / range;
    if (position > 0.8) return Color.Green; // Near high
    if (position < 0.2) return Color.Red; // Near low
    return Color.SecondaryText; // In middle
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return Icon.ArrowUp;
    if (change < 0) return Icon.ArrowDown;
    return Icon.Minus;
  };

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label
        title="Stock"
        text={`${stock.meta.longName || stock.meta.shortName || "N/A"} (${stock.meta.symbol})`}
      />

      <List.Item.Detail.Metadata.Label
        title="Volume"
        text={formatNumber(stock.volume)}
        icon={Icon.BarChart}
      />

      <List.Item.Detail.Metadata.Label
        title="Exchange"
        text={{
          value: `${stock.meta.fullExchangeName || stock.meta.exchangeName}${
            stock.meta.currentTradingPeriod
              ? ` • ${getMarketStatus(stock).status}`
              : ""
          }`,
          color: getMarketStatus(stock).color,
        }}
        icon={{
          source: Icon.Building,
          tintColor: getMarketStatus(stock).color,
        }}
      />

      <List.Item.Detail.Metadata.Separator />

      <List.Item.Detail.Metadata.Label
        title="Current Price"
        text={{
          value: formatPrice(stock.currentPrice, stock.meta.currency),
          color: getColorForChange(stock.change),
        }}
        icon={{
          source: Icon.Coins,
          tintColor: getColorForChange(stock.change),
        }}
      />

      <List.Item.Detail.Metadata.Label
        title="Change"
        text={{
          value: `${formatPrice(stock.change, stock.meta.currency)} (${stock.changePercent.toFixed(2)}%)`,
          color: getColorForChange(stock.change),
        }}
        icon={{
          source: getChangeIcon(stock.change),
          tintColor: getColorForChange(stock.change),
        }}
      />

      <List.Item.Detail.Metadata.Separator />

      {stock.sparklineData && stock.sparklineData.length > 0 && (
        <List.Item.Detail.Metadata.TagList title="Chart">
          <List.Item.Detail.Metadata.TagList.Item
            text={generateSparkline(stock.sparklineData, SPARKLINE_WIDTH)}
            color={Color.SecondaryText}
          />
        </List.Item.Detail.Metadata.TagList>
      )}

      <List.Item.Detail.Metadata.Separator />

      <List.Item.Detail.Metadata.Label
        title="Close / Open"
        text={{
          value: `${formatPrice(stock.previousClose, stock.meta.currency)} / ${formatPrice(stock.open, stock.meta.currency)}`,
          color:
            stock.open !== undefined
              ? getColorForPriceVsReference(stock.open, stock.previousClose)
              : Color.SecondaryText,
        }}
      />

      <List.Item.Detail.Metadata.Label
        title="Day Range"
        text={{
          value: `${formatPrice(stock.low, stock.meta.currency)} - ${formatPrice(stock.high, stock.meta.currency)}`,
          color: getColorForPriceInRange(
            stock.currentPrice,
            stock.low,
            stock.high
          ),
        }}
      />

      <List.Item.Detail.Metadata.Label
        title="52W Range"
        text={{
          value: `${formatPrice(stock.meta.fiftyTwoWeekLow, stock.meta.currency)} - ${formatPrice(stock.meta.fiftyTwoWeekHigh, stock.meta.currency)}`,
          color: getColorForPriceInRange(
            stock.currentPrice,
            stock.meta.fiftyTwoWeekLow,
            stock.meta.fiftyTwoWeekHigh
          ),
        }}
      />
    </List.Item.Detail.Metadata>
  );
}
