export type YahooResult = YahooFinanceResponse["chart"]["result"][0];
export type YahooMeta = YahooResult["meta"];
export type YahooIndicators = YahooResult["indicators"];
export type YahooQuote = YahooIndicators["quote"][0];

export type StockData = {
  meta: YahooMeta;
  timestamp: YahooResult["timestamp"];
  indicators: YahooIndicators;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number | undefined;
  high: number | undefined;
  low: number | undefined;
  volume: number | undefined;
  sparklineData: number[];
};

export interface YahooFinanceResponse {
  chart: {
    result: Array<{
      meta: {
        currency: string;
        symbol: string;
        exchangeName: string;
        fullExchangeName: string;
        instrumentType: string;
        firstTradeDate: number;
        regularMarketTime: number;
        hasPrePostMarketData: boolean;
        gmtoffset: number;
        timezone: string;
        exchangeTimezoneName: string;
        regularMarketPrice: number;
        fiftyTwoWeekHigh: number;
        fiftyTwoWeekLow: number;
        regularMarketDayHigh: number;
        regularMarketDayLow: number;
        regularMarketVolume: number;
        longName: string;
        shortName: string;
        chartPreviousClose: number;
        priceHint: number;
        currentTradingPeriod: {
          pre: {
            timezone: string;
            start: number;
            end: number;
            gmtoffset: number;
          };
          regular: {
            timezone: string;
            start: number;
            end: number;
            gmtoffset: number;
          };
          post: {
            timezone: string;
            start: number;
            end: number;
            gmtoffset: number;
          };
        };
        dataGranularity: string;
        range: string;
        validRanges: string[];
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: number[];
          close: number[];
          high: number[];
          low: number[];
          volume: number[];
        }>;
        adjclose: Array<{
          adjclose: number[];
        }>;
      };
    }>;
    error: null;
  };
}

export interface Preferences {
  symbols: string;
  refreshInterval: string;
  range: string;
}
