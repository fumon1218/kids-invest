import type { StockPrice } from '../types';

export const fetchStockPrices = async (tickers: string[]): Promise<Record<string, StockPrice>> => {
  const prices: Record<string, StockPrice> = {};
  
  try {
    const promises = tickers.map(async (ticker) => {
      const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;
      
      // 여러 프록시를 순차적으로 시도합니다.
      const proxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
      ];

      let success = false;
      
      for (const proxyUrl of proxies) {
        if (success) break;
        try {
          const response = await fetch(proxyUrl);
          if (!response.ok) continue;
          
          let data = await response.json();
          // allorigins의 /get 엔드포인트는 contents 안에 원본 텍스트가 있습니다.
          if (data.contents) {
            data = JSON.parse(data.contents);
          }
          
          const result = data.chart?.result?.[0];
          if (!result) continue;

          const meta = result.meta;
          const currentPrice = meta.regularMarketPrice;
          const previousClose = meta.chartPreviousClose;
          const change = currentPrice - previousClose;
          const changePercent = (change / previousClose) * 100;
          
          prices[ticker] = {
            ticker,
            price: currentPrice,
            change: change,
            changePercent: changePercent,
            previousClose: previousClose
          };
          success = true;
        } catch (err) {
          // 다음 프록시 시도
        }
      }

      if (!success) {
        prices[ticker] = {
          ticker, price: 0, change: 0, changePercent: 0, previousClose: 0
        };
      }
    });

    await Promise.all(promises);
    return prices;
  } catch (error) {
    console.error("Failed to fetch stock prices:", error);
    return prices;
  }
};
