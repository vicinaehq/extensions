import {
  Action,
  ActionPanel,
  Color,
  getPreferenceValues,
  Icon,
  List,
  LocalStorage,
  showToast,
  Toast,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import type { StockData, Preferences } from "./types";
import { fetchStockData } from "./api";
import { formatPrice, generateSparkline, getColorForChange } from "./utils";
import { StockDetail } from "./stock-detail";
import { SPARKLINE_WIDTH } from "./constants";

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const symbols = preferences.symbols
    .split(",")
    .map((s) => s.trim().toUpperCase());
  const refreshInterval = parseInt(preferences.refreshInterval) * 1000; // Convert to milliseconds

  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showingDetail, setShowingDetail] = useState(false);
  const [selectedRange, setSelectedRangeState] = useState<string>(
    preferences.range || "1d",
  );
  const [rangeLoaded, setRangeLoaded] = useState(false);

  const setSelectedRange = useCallback((range: string) => {
    setSelectedRangeState(range);
    LocalStorage.setItem("stocks-selected-range", range);
  }, []);

  const loadStocks = async () => {
    setLoading(true);
    try {
      const stockPromises = symbols.map((symbol) =>
        fetchStockData(symbol, selectedRange),
      );
      const results = await Promise.all(stockPromises);
      const validStocks = results.filter(
        (stock): stock is StockData => stock !== null,
      );
      // Sort stocks: winners (positive change) first, then by change percentage descending
      const sortedStocks = validStocks.sort((a, b) => {
        // First, separate winners from losers
        const aIsWinner = a.change > 0;
        const bIsWinner = b.change > 0;

        if (aIsWinner && !bIsWinner) return -1;
        if (!aIsWinner && bIsWinner) return 1;

        // If both are winners or both are losers, sort by change percentage descending
        return b.changePercent - a.changePercent;
      });
      setStocks(sortedStocks);
      setLastRefresh(new Date());

      if (validStocks.length !== symbols.length) {
        const failedSymbols = symbols.filter(
          (symbol) =>
            !validStocks.some((stock) => stock.meta.symbol === symbol),
        );
        showToast({
          style: Toast.Style.Failure,
          title: "Some stocks could not be loaded",
          message: `Failed to load: ${failedSymbols.join(", ")}`,
        });
      }
    } catch (error) {
      console.error("Error loading stocks:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load stock data",
        message: "Please check your internet connection and try again",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadStoredRange = async () => {
      const stored = await LocalStorage.getItem("stocks-selected-range");
      if (typeof stored === "string") {
        setSelectedRangeState(stored);
      }
      setRangeLoaded(true);
    };
    loadStoredRange();
  }, []);

  useEffect(() => {
    if (rangeLoaded) {
      loadStocks();
    }

    // Set up auto-refresh
    const interval = setInterval(loadStocks, refreshInterval);
    return () => clearInterval(interval);
  }, [
    preferences.symbols,
    preferences.refreshInterval,
    selectedRange,
    rangeLoaded,
  ]);

  const toggleDetails = useCallback(() => {
    setShowingDetail(!showingDetail);
  }, [showingDetail]);

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search stocks..."
      isShowingDetail={showingDetail}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Select time range"
          value={selectedRange}
          onChange={setSelectedRange}
        >
          <List.Dropdown.Item title="1d" value="1d" />
          <List.Dropdown.Item title="5d" value="5d" />
          <List.Dropdown.Item title="1mo" value="1mo" />
          <List.Dropdown.Item title="ytd" value="ytd" />
          <List.Dropdown.Item title="1y" value="1y" />
          <List.Dropdown.Item title="5y" value="5y" />
          <List.Dropdown.Item title="max" value="max" />
        </List.Dropdown>
      }
    >
      <List.Section
        title="Stocks"
        subtitle={`Last updated: ${lastRefresh.toLocaleTimeString()}`}
      >
        {stocks.map((stock) => (
          <List.Item
            key={stock.meta.symbol}
            title={stock.meta.symbol}
            subtitle={stock.meta.longName || stock.meta.shortName || "N/A"}
            accessories={
              !showingDetail
                ? [
                    {
                      text: {
                        value: formatPrice(
                          stock.currentPrice,
                          stock.meta.currency,
                        ).padStart(10),
                        color: getColorForChange(stock.change),
                      },
                    },

                    {
                      tag: {
                        value: `${
                          stock.changePercent >= 0 ? "+" : ""
                        }${stock.changePercent.toFixed(2)}%`,
                        color: getColorForChange(stock.change),
                      },
                    },
                    ...(stock.sparklineData && stock.sparklineData.length > 0
                      ? [
                          {
                            tag: {
                              value: generateSparkline(
                                stock.sparklineData,
                                SPARKLINE_WIDTH,
                              ),
                              color: Color.SecondaryText,
                            },
                            tooltip: `${selectedRange} price chart`,
                          },
                        ]
                      : []),
                  ]
                : []
            }
            detail={
              <List.Item.Detail metadata={<StockDetail stock={stock} />} />
            }
            actions={
              <ActionPanel>
                <Action
                  title={showingDetail ? "Hide Details" : "Show Details"}
                  icon={showingDetail ? Icon.EyeDisabled : Icon.Eye}
                  onAction={toggleDetails}
                />
                <Action.OpenInBrowser
                  title="Open in TradingView"
                  icon={Icon.BarChart}
                  url={`https://www.tradingview.com/chart/?symbol=${stock.meta.symbol}`}
                />
                <Action.OpenInBrowser
                  title="Open in Yahoo Finance"
                  icon={Icon.Globe}
                  url={`https://finance.yahoo.com/quote/${stock.meta.symbol}`}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
