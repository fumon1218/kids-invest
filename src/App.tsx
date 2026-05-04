import { useState, useEffect } from 'react';
import { initialStocks, STORAGE_KEY, STOCKS_STORAGE_KEY, defaultUserData } from './data';
import type { Stock, UserData, StockPrice, Transaction, PortfolioItem } from './types';
import { fetchStockPrices } from './utils/api';
import { TrendingUp, TrendingDown, DollarSign, PlusCircle, Briefcase, History, RefreshCw, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

export default function App() {
  const [userData, setUserData] = useState<UserData>(defaultUserData);
  const [stocks, setStocks] = useState<Stock[]>(initialStocks);
  const [prices, setPrices] = useState<Record<string, StockPrice>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history'>('dashboard');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');

  // 1. 데이터 로드 및 배당금 지급 로직
  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEY);
    const savedStocks = localStorage.getItem(STOCKS_STORAGE_KEY);
    
    let loadedUserData = savedUser ? JSON.parse(savedUser) : defaultUserData;
    if (savedStocks) {
      setStocks(JSON.parse(savedStocks));
    }

    // 월간 배당금 지급 체크
    const currentDate = new Date();
    const currentMonthNum = currentDate.getFullYear() * 100 + (currentDate.getMonth() + 1); // e.g. 202605
    
    if (loadedUserData.lastDividendMonth < currentMonthNum) {
      // 첫 방문이 아닐 때만(포트폴리오가 있거나 지난 달 기록이 있을 때) 배당금 지급
      if (loadedUserData.lastDividendMonth !== 0 && loadedUserData.portfolio.length > 0) {
        let totalDividend = 0;
        const savedStocksList = savedStocks ? JSON.parse(savedStocks) : initialStocks;
        
        loadedUserData.portfolio.forEach((item: PortfolioItem) => {
          const stockInfo = savedStocksList.find((s: Stock) => s.ticker === item.ticker);
          if (stockInfo && stockInfo.dividendYield > 0) {
            // (보유수량 * 평균단가 * 연배당률) / 12개월
            const monthlyDividend = (item.shares * item.averagePrice * (stockInfo.dividendYield / 100)) / 12;
            totalDividend += monthlyDividend;
          }
        });

        if (totalDividend > 0) {
          totalDividend = Math.floor(totalDividend);
          loadedUserData.balance += totalDividend;
          loadedUserData.transactions.unshift({
            id: Date.now().toString(),
            type: 'DIVIDEND',
            amount: totalDividend,
            date: Date.now()
          });
          alert(`🎉 축하합니다! 이번 달 배당금 ${totalDividend.toLocaleString()}원이 입금되었습니다!`);
        }
      }
      
      loadedUserData.lastDividendMonth = currentMonthNum;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loadedUserData));
    }

    setUserData(loadedUserData);
    loadPrices(savedStocks ? JSON.parse(savedStocks) : initialStocks);
  }, []);

  const loadPrices = async (stockList: Stock[]) => {
    setIsLoading(true);
    const tickers = stockList.map(s => s.ticker);
    const fetchedPrices = await fetchStockPrices(tickers);
    setPrices(fetchedPrices);
    setIsLoading(false);
  };

  const refreshData = () => {
    loadPrices(stocks);
  };

  const saveUserData = (newData: UserData) => {
    setUserData(newData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
  };

  const handleDeposit = () => {
    const amount = parseInt(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('올바른 금액을 입력하세요.');
      return;
    }
    const newTransaction: Transaction = {
      id: Date.now().toString(),
      type: 'DEPOSIT',
      amount: amount,
      date: Date.now()
    };
    saveUserData({
      ...userData,
      balance: userData.balance + amount,
      transactions: [newTransaction, ...userData.transactions]
    });
    setDepositAmount('');
    setShowDepositModal(false);
    alert(`${amount.toLocaleString()}원이 입금되었습니다!`);
  };

  const handleBuy = (stock: Stock) => {
    const currentPriceInfo = prices[stock.ticker];
    if (!currentPriceInfo || currentPriceInfo.price === 0) {
      alert('주가 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const price = currentPriceInfo.price;
    const sharesToBuyStr = prompt(`[${stock.name}] 현재가: ${price.toLocaleString()}원\n몇 주를 매수하시겠습니까?\n(현재 잔액: ${userData.balance.toLocaleString()}원)`);
    if (!sharesToBuyStr) return;
    
    const sharesToBuy = parseInt(sharesToBuyStr);
    if (isNaN(sharesToBuy) || sharesToBuy <= 0) return;

    const totalCost = sharesToBuy * price;
    if (userData.balance < totalCost) {
      alert(`잔액이 부족합니다. (필요 금액: ${totalCost.toLocaleString()}원)`);
      return;
    }

    // 포트폴리오 업데이트
    const newPortfolio = [...userData.portfolio];
    const existingItemIndex = newPortfolio.findIndex(item => item.ticker === stock.ticker);

    if (existingItemIndex >= 0) {
      const item = newPortfolio[existingItemIndex];
      const newTotalShares = item.shares + sharesToBuy;
      const newAveragePrice = ((item.shares * item.averagePrice) + totalCost) / newTotalShares;
      newPortfolio[existingItemIndex] = {
        ...item,
        shares: newTotalShares,
        averagePrice: newAveragePrice
      };
    } else {
      newPortfolio.push({
        ticker: stock.ticker,
        shares: sharesToBuy,
        averagePrice: price
      });
    }

    saveUserData({
      ...userData,
      balance: userData.balance - totalCost,
      portfolio: newPortfolio,
      transactions: [{
        id: Date.now().toString(),
        type: 'BUY',
        amount: totalCost,
        ticker: stock.ticker,
        shares: sharesToBuy,
        price: price,
        date: Date.now()
      }, ...userData.transactions]
    });
    alert(`${stock.name} ${sharesToBuy}주 매수 완료!`);
  };

  const handleSell = (stock: Stock) => {
    const portfolioItem = userData.portfolio.find(item => item.ticker === stock.ticker);
    if (!portfolioItem || portfolioItem.shares <= 0) {
      alert('보유 중인 주식이 없습니다.');
      return;
    }

    const currentPriceInfo = prices[stock.ticker];
    if (!currentPriceInfo || currentPriceInfo.price === 0) {
      alert('주가 정보를 불러오지 못했습니다.');
      return;
    }

    const price = currentPriceInfo.price;
    const sharesToSellStr = prompt(`[${stock.name}] 현재가: ${price.toLocaleString()}원\n몇 주를 매도하시겠습니까?\n(보유 수량: ${portfolioItem.shares}주)`);
    if (!sharesToSellStr) return;

    const sharesToSell = parseInt(sharesToSellStr);
    if (isNaN(sharesToSell) || sharesToSell <= 0) return;
    if (sharesToSell > portfolioItem.shares) {
      alert(`보유 수량(${portfolioItem.shares}주)보다 많이 매도할 수 없습니다.`);
      return;
    }

    const totalRevenue = sharesToSell * price;
    const newPortfolio = [...userData.portfolio];
    const itemIndex = newPortfolio.findIndex(item => item.ticker === stock.ticker);

    if (sharesToSell === portfolioItem.shares) {
      newPortfolio.splice(itemIndex, 1);
    } else {
      newPortfolio[itemIndex] = {
        ...portfolioItem,
        shares: portfolioItem.shares - sharesToSell
      };
    }

    saveUserData({
      ...userData,
      balance: userData.balance + totalRevenue,
      portfolio: newPortfolio,
      transactions: [{
        id: Date.now().toString(),
        type: 'SELL',
        amount: totalRevenue,
        ticker: stock.ticker,
        shares: sharesToSell,
        price: price,
        date: Date.now()
      }, ...userData.transactions]
    });
    alert(`${stock.name} ${sharesToSell}주 매도 완료!`);
  };

  // 계산 유틸리티
  const calculateTotalAsset = () => {
    let total = userData.balance;
    userData.portfolio.forEach(item => {
      const priceInfo = prices[item.ticker];
      const currentPrice = priceInfo && priceInfo.price > 0 ? priceInfo.price : item.averagePrice;
      total += currentPrice * item.shares;
    });
    return total;
  };

  const calculateTotalReturn = () => {
    let totalInvested = 0;
    let currentTotalValue = 0;
    userData.portfolio.forEach(item => {
      totalInvested += item.averagePrice * item.shares;
      const priceInfo = prices[item.ticker];
      const currentPrice = priceInfo && priceInfo.price > 0 ? priceInfo.price : item.averagePrice;
      currentTotalValue += currentPrice * item.shares;
    });
    if (totalInvested === 0) return { amount: 0, percent: 0 };
    return {
      amount: currentTotalValue - totalInvested,
      percent: ((currentTotalValue - totalInvested) / totalInvested) * 100
    };
  };

  const handleResetData = () => {
    if (confirm('모든 투자 데이터와 보유 현금을 완전히 초기화(0원)하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      localStorage.removeItem(STORAGE_KEY);
      setUserData({ ...defaultUserData, balance: 0 });
      alert('모든 데이터가 초기화되었습니다. 용돈을 입금하여 투자를 다시 시작하세요!');
    }
  };

  const returns = calculateTotalReturn();

  return (
    <div className="min-h-screen bg-background text-slate-100 font-sans pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 glass-panel border-b-0 border-white/10 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary/20 p-2 rounded-xl">
            <TrendingUp className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            키즈 인베스트
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleResetData} title="모든 데이터 초기화" className="p-2 bg-slate-800 rounded-full hover:bg-danger/20 hover:text-danger transition text-slate-400">
            <AlertCircle className="w-5 h-5" />
          </button>
          <button onClick={refreshData} disabled={isLoading} title="주가 새로고침" className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition">
            <RefreshCw className={clsx("w-5 h-5 text-slate-300", isLoading && "animate-spin")} />
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* 잔고 및 자산 요약 */}
        <section className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-6 shadow-2xl border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <DollarSign className="w-32 h-32" />
          </div>
          <div className="relative z-10">
            <p className="text-slate-400 text-sm font-medium mb-1">총 자산</p>
            <h2 className="text-4xl font-black text-white mb-2">{Math.floor(calculateTotalAsset()).toLocaleString()}원</h2>
            
            <div className="flex items-center gap-4 mt-4">
              <div>
                <p className="text-xs text-slate-400">보유 현금</p>
                <p className="text-lg font-bold text-blue-400">{userData.balance.toLocaleString()}원</p>
              </div>
              <div className="w-px h-8 bg-slate-700"></div>
              <div>
                <p className="text-xs text-slate-400">투자 수익금</p>
                <p className={clsx("text-lg font-bold flex items-center gap-1", returns.amount >= 0 ? "text-success" : "text-danger")}>
                  {returns.amount >= 0 ? '+' : ''}{Math.floor(returns.amount).toLocaleString()}원 
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-white/10 ml-1">
                    {returns.percent > 0 ? '+' : ''}{returns.percent.toFixed(2)}%
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button 
                onClick={() => setShowDepositModal(true)}
                className="flex-1 bg-primary hover:bg-blue-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition"
              >
                <PlusCircle className="w-5 h-5" /> 용돈 입금하기
              </button>
            </div>
          </div>
        </section>

        {/* 메인 탭 */}
        <div className="flex gap-2 p-1 bg-slate-800/50 rounded-2xl border border-white/5">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={clsx("flex-1 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition", activeTab === 'dashboard' ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200")}
          >
            <Briefcase className="w-4 h-4" /> 투자 종목
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={clsx("flex-1 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition", activeTab === 'history' ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200")}
          >
            <History className="w-4 h-4" /> 거래 내역
          </button>
        </div>

        {/* 탭 컨텐츠 */}
        {activeTab === 'dashboard' ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-bold text-lg">실시간 시장 현황</h3>
              <p className="text-xs text-slate-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Yahoo Finance 기준</p>
            </div>

            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                <p className="text-slate-400 text-sm">실시간 주가를 불러오는 중입니다...</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {stocks.map(stock => {
                  const priceInfo = prices[stock.ticker];
                  const portfolioItem = userData.portfolio.find(p => p.ticker === stock.ticker);
                  const currentPrice = priceInfo ? priceInfo.price : 0;
                  const isUp = priceInfo && priceInfo.change >= 0;

                  return (
                    <div key={stock.id} className="bg-card rounded-2xl p-4 border border-slate-700/50 shadow-lg">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="text-3xl">{stock.icon}</div>
                          <div>
                            <h4 className="font-bold text-lg">{stock.name}</h4>
                            <p className="text-xs text-slate-400">{stock.ticker} · 연 배당률 {stock.dividendYield}%</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">{currentPrice > 0 ? currentPrice.toLocaleString() + '원' : '로딩 실패'}</p>
                          {priceInfo && currentPrice > 0 && (
                            <p className={clsx("text-sm font-medium flex items-center justify-end gap-1", isUp ? "text-danger" : "text-primary")}>
                              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {priceInfo.change > 0 ? '+' : ''}{Math.floor(priceInfo.change).toLocaleString()} 
                              ({priceInfo.changePercent > 0 ? '+' : ''}{priceInfo.changePercent.toFixed(2)}%)
                            </p>
                          )}
                        </div>
                      </div>

                      {portfolioItem && portfolioItem.shares > 0 && (
                        <div className="bg-slate-800/50 rounded-xl p-3 mb-4 border border-slate-700/50 flex justify-between items-center">
                          <div>
                            <p className="text-xs text-slate-400 mb-0.5">내 보유 주식</p>
                            <p className="font-bold text-sm">{portfolioItem.shares}주 <span className="text-slate-500 font-normal ml-1">(평단가 {Math.floor(portfolioItem.averagePrice).toLocaleString()}원)</span></p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-400 mb-0.5">평가 손익</p>
                            {(() => {
                              const profit = (currentPrice - portfolioItem.averagePrice) * portfolioItem.shares;
                              const profitPct = ((currentPrice - portfolioItem.averagePrice) / portfolioItem.averagePrice) * 100;
                              return (
                                <p className={clsx("font-bold text-sm", profit >= 0 ? "text-success" : "text-danger")}>
                                  {profit >= 0 ? '+' : ''}{Math.floor(profit).toLocaleString()}원 ({profitPct > 0 ? '+' : ''}{profitPct.toFixed(2)}%)
                                </p>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleBuy(stock)}
                          className="flex-1 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 py-2.5 rounded-xl font-bold transition"
                        >
                          매수 (사기)
                        </button>
                        <button 
                          onClick={() => handleSell(stock)}
                          disabled={!portfolioItem || portfolioItem.shares === 0}
                          className="flex-1 bg-primary/10 hover:bg-primary/20 disabled:opacity-50 disabled:hover:bg-primary/10 text-primary border border-primary/20 py-2.5 rounded-xl font-bold transition"
                        >
                          매도 (팔기)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <h3 className="font-bold text-lg px-1">최근 거래 내역</h3>
            {userData.transactions.length === 0 ? (
              <div className="bg-card rounded-2xl p-8 text-center border border-slate-700/50">
                <History className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">아직 거래 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="bg-card rounded-2xl overflow-hidden border border-slate-700/50 shadow-lg divide-y divide-slate-700/50">
                {userData.transactions.map(tx => {
                  const isPositive = tx.type === 'DEPOSIT' || tx.type === 'SELL' || tx.type === 'DIVIDEND';
                  const dateObj = new Date(tx.date);
                  return (
                    <div key={tx.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={clsx("w-10 h-10 rounded-full flex items-center justify-center", 
                          tx.type === 'DEPOSIT' ? "bg-emerald-500/20 text-emerald-400" :
                          tx.type === 'DIVIDEND' ? "bg-amber-500/20 text-amber-400" :
                          tx.type === 'BUY' ? "bg-danger/20 text-danger" : "bg-primary/20 text-primary"
                        )}>
                          <DollarSign className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">
                            {tx.type === 'DEPOSIT' ? '용돈 입금' :
                             tx.type === 'DIVIDEND' ? '월간 배당금' :
                             tx.type === 'BUY' ? `${stocks.find(s=>s.ticker===tx.ticker)?.name || tx.ticker} 매수` :
                             `${stocks.find(s=>s.ticker===tx.ticker)?.name || tx.ticker} 매도`}
                          </p>
                          <p className="text-xs text-slate-400">{dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={clsx("font-bold text-sm", isPositive ? "text-success" : "text-white")}>
                          {isPositive ? '+' : '-'}{tx.amount.toLocaleString()}원
                        </p>
                        {tx.shares && <p className="text-xs text-slate-400">{tx.shares}주</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-card border border-slate-700 w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold mb-2">용돈 입금하기</h3>
            <p className="text-sm text-slate-400 mb-6">투자할 가상 금액을 입력해주세요.</p>
            
            <div className="relative mb-6">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₩</span>
              <input 
                type="number" 
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                placeholder="예: 50000"
                className="w-full bg-slate-800 border border-slate-600 rounded-xl py-3 pl-10 pr-4 text-white font-bold text-lg focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setShowDepositModal(false)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition"
              >
                취소
              </button>
              <button 
                onClick={handleDeposit}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-primary hover:bg-blue-600 shadow-lg shadow-primary/30 transition"
              >
                입금 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 우측 하단 버전 정보 표시 */}
      <div className="fixed bottom-2 right-4 z-0 pointer-events-none">
        <span className="text-[10px] font-medium text-slate-500/50">v1.0.0</span>
      </div>
    </div>
  );
}
