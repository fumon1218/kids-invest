import type { StockPrice } from '../types';

// 야후 파이낸스 API에서 주가 정보를 가져오는 유틸리티 (CORS 프록시 사용)
export const fetchStockPrices = async (tickers: string[]): Promise<Record<string, StockPrice>> => {
  const prices: Record<string, StockPrice> = {};
  
  try {
    // 병렬로 모든 종목 주가 요청
    const promises = tickers.map(async (ticker) => {
      const targetUrl = encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`);
      // allorigins 프록시를 통해 CORS 우회 (raw 모드)
      const proxyUrl = `https://api.allorigins.win/raw?url=${targetUrl}`;
      
      try {
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const data = await response.json();
        const result = data.chart.result[0];
        
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
      } catch (err) {
        console.error(`Error fetching data for ${ticker}:`, err);
        // 에러 발생 시 임시 데이터 반환 (UI 다운 방지)
        prices[ticker] = {
          ticker,
          price: 0,
          change: 0,
          changePercent: 0,
          previousClose: 0
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
