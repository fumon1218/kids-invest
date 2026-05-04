export interface Stock {
  id: string;
  name: string;
  ticker: string; // e.g., '203650.KQ'
  dividendYield: number; // e.g., 1.5 for 1.5%
  icon?: string;
}

export interface StockPrice {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

export interface PortfolioItem {
  ticker: string;
  shares: number;
  averagePrice: number;
}

export interface Transaction {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAW' | 'BUY' | 'SELL' | 'DIVIDEND';
  amount: number;
  ticker?: string;
  shares?: number;
  price?: number;
  date: number;
}

export interface UserData {
  balance: number;
  portfolio: PortfolioItem[];
  transactions: Transaction[];
  lastDividendMonth: number; // e.g., 202605
}
