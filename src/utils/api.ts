import type { StockPrice } from '../types';

// 각 요청 사이에 딜레이를 주기 위한 유틸리티 함수
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchStockPrices = async (tickers: string[]): Promise<Record<string, StockPrice>> => {
  const prices: Record<string, StockPrice> = {};
  if (!tickers || tickers.length === 0) return prices;
  
  try {
    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
      
      const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`
      ];

      let success = false;
      
      for (const proxyUrl of proxies) {
        if (success) break;
        try {
          const response = await fetch(proxyUrl);
          if (!response.ok) continue;
          
          let data = await response.json();
          if (data.contents) {
            data = JSON.parse(data.contents);
          }
          
          const result = data.chart?.result?.[0];
          if (!result) continue;

          const meta = result.meta;
          // regularMarketPrice가 없을 경우 이전 종가나 다른 필드 확인
          const currentPrice = meta.regularMarketPrice || meta.chartPreviousClose || 0;
          if (currentPrice === 0) continue;

          const previousClose = meta.chartPreviousClose || currentPrice;
          const change = currentPrice - previousClose;
          const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;
          
          // 히스토리 데이터 추출 (최근 5일 종가)
          // null 값이나 0원인 데이터 필터링 강화
          const history = result.indicators?.quote?.[0]?.close?.filter((p: any) => p !== null && p > 0) || [];
          
          prices[ticker] = {
            ticker,
            price: currentPrice,
            change: change,
            changePercent: changePercent,
            previousClose: previousClose,
            history: history
          };
          success = true;
        } catch (err) {
          console.warn(`Proxy ${proxyUrl} failed for ${ticker}:`, err);
        }
      }

      if (!success) {
        console.error(`All proxies failed for ${ticker}`);
        prices[ticker] = { ticker, price: 0, change: 0, changePercent: 0, previousClose: 0, history: [] };
      }

      // 프록시 서버의 Rate-limit(동시접속 차단) 방지를 위해 다음 종목 요청 전 1초 대기 (마지막 종목 제외)
      if (i < tickers.length - 1) {
        await delay(1000);
      }
    }

    return prices;
  } catch (error) {
    console.error("Failed to fetch stock prices:", error);
    return prices;
  }
};
