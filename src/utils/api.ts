import type { StockPrice } from '../types';

export const fetchStockPrices = async (tickers: string[]): Promise<Record<string, StockPrice>> => {
  const prices: Record<string, StockPrice> = {};
  if (!tickers || tickers.length === 0) return prices;
  
  try {
    const symbols = tickers.join(',');
    const targetUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
    
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
        // allorigins 처리
        if (data.contents) {
          data = JSON.parse(data.contents);
        }
        
        const results = data.quoteResponse?.result;
        if (!results || !Array.isArray(results)) continue;

        results.forEach((item: any) => {
          prices[item.symbol] = {
            ticker: item.symbol,
            price: item.regularMarketPrice,
            change: item.regularMarketChange,
            changePercent: item.regularMarketChangePercent,
            previousClose: item.regularMarketPreviousClose
          };
        });
        
        success = true;
      } catch (err) {
        // 다음 프록시 시도
      }
    }

    // 실패한 종목은 임시값 0 처리
    tickers.forEach(ticker => {
      if (!prices[ticker]) {
        prices[ticker] = { ticker, price: 0, change: 0, changePercent: 0, previousClose: 0 };
      }
    });

    return prices;
  } catch (error) {
    console.error("Failed to fetch stock prices:", error);
    return prices;
  }
};
