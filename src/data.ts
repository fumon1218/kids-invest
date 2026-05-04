import { Stock } from './types';

export const initialStocks: Stock[] = [
  {
    id: 'dream-security',
    name: '드림시큐리티',
    ticker: '203650.KQ',
    dividendYield: 1.0, // 실제 배당률에 가깝게 임의 설정 (후에 수정 가능)
    icon: '🛡️'
  },
  {
    id: 'raon-secure',
    name: '라온시큐어',
    ticker: '042510.KQ',
    dividendYield: 0.8, 
    icon: '🔐'
  }
];

// 로컬 스토리지 키
export const STORAGE_KEY = 'kids_invest_user_data';
export const STOCKS_STORAGE_KEY = 'kids_invest_stocks_data';

// 기본 유저 데이터
export const defaultUserData = {
  balance: 100000, // 기본 지급금 10만원
  portfolio: [],
  transactions: [],
  lastDividendMonth: 0
};
