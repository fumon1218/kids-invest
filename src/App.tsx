import { useState, useEffect } from 'react';
import { initialStocks, STORAGE_KEY, defaultUserData } from './data';
import type { Stock, UserData, StockPrice, Transaction } from './types';
import { fetchStockPrices } from './utils/api';
import { TrendingUp, TrendingDown, DollarSign, PlusCircle, Briefcase, History, RefreshCw, AlertCircle, LogOut, PieChart as PieChartIcon } from 'lucide-react';
import clsx from 'clsx';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { auth, googleProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { loadUserDataFromDB, saveUserDataToDB } from './utils/firebaseUtils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const [userData, setUserData] = useState<UserData>(defaultUserData);
  const [livePrices, setLivePrices] = useState<Record<string, StockPrice>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'portfolio' | 'history'>('portfolio');

  // 기본 종목과 사용자 추가 종목 합치기
  const allStocks = [...initialStocks, ...(userData.customStocks || [])];

  // 인증 상태 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // 로그인 성공 시 DB에서 유저 데이터 불러오기
        const data = await loadUserDataFromDB(currentUser.uid);
        setUserData(data);
      } else {
        // 로그아웃 시 로컬 스토리지 데이터 사용 (오프라인/게스트 모드)
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            setUserData(JSON.parse(saved));
          } catch (e) {
            setUserData(defaultUserData);
          }
        } else {
          setUserData(defaultUserData);
        }
      }
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // 로그인 핸들러
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
      alert("로그인에 실패했습니다.");
    }
  };

  // 로그아웃 핸들러
  const handleLogout = async () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      await signOut(auth);
    }
  };

  // 데이터 저장 훅 (Firebase 또는 로컬)
  useEffect(() => {
    if (isAuthChecking) return;
    if (user) {
      saveUserDataToDB(user.uid, userData);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    }
  }, [userData, user, isAuthChecking]);

  // 주가 새로고침
  const refreshData = async () => {
    setIsLoading(true);
    const tickers = allStocks.map(s => s.ticker);
    const prices = await fetchStockPrices(tickers);
    setLivePrices(prices);
    setIsLoading(false);
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 60000);
    return () => clearInterval(interval);
  }, [userData.customStocks]); // 커스텀 종목 추가 시에도 갱신하도록 수정

  // 배당금 로직
  useEffect(() => {
    if (isAuthChecking) return;
    
    const checkAndPayDividends = () => {
      const now = new Date();
      const currentMonth = now.getFullYear() * 12 + now.getMonth();
      
      if (userData.lastDividendMonth < currentMonth && userData.portfolio.length > 0) {
        let totalDividend = 0;
        
        userData.portfolio.forEach(item => {
          const stockInfo = stocks.find(s => s.ticker === item.ticker);
          if (stockInfo && item.shares > 0) {
            const annualYield = stockInfo.dividendYield || 0;
            const livePrice = livePrices[item.ticker]?.price || item.averagePrice;
            const currentTotalValue = item.shares * livePrice;
            const monthlyDividend = Math.floor(currentTotalValue * (annualYield / 100) / 12);
            totalDividend += monthlyDividend;
          }
        });

        if (totalDividend > 0) {
          const newTransaction: Transaction = {
            id: Date.now().toString(),
            date: Date.now(),
            type: 'DIVIDEND',
            amount: totalDividend,
            description: '월간 배당금 지급'
          };

          setUserData(prev => ({
            ...prev,
            balance: prev.balance + totalDividend,
            lastDividendMonth: currentMonth,
            transactions: [newTransaction, ...prev.transactions]
          }));
          alert(`🎉 축하합니다! 이달의 배당금 ${totalDividend.toLocaleString()}원이 지급되었습니다!`);
        } else {
          setUserData(prev => ({ ...prev, lastDividendMonth: currentMonth }));
        }
      } else if (userData.lastDividendMonth === 0) {
        setUserData(prev => ({ ...prev, lastDividendMonth: currentMonth }));
      }
    };

    if (Object.keys(livePrices).length > 0) {
      checkAndPayDividends();
    }
  }, [livePrices, userData.lastDividendMonth, userData.portfolio, allStocks, isAuthChecking]);

  // 매수 함수
  const buyStock = (ticker: string, price: number) => {
    const cost = price;
    if (userData.balance < cost) {
      alert('보유 현금이 부족합니다.');
      return;
    }
    
    const stockInfo = allStocks.find(s => s.ticker === ticker);
    const note = prompt(`${stockInfo?.name}을(를) 매수하는 이유를 적어주세요!`, '') || '';
    
    const newTransaction: Transaction = {
      id: Date.now().toString(),
      date: Date.now(),
      type: 'BUY',
      amount: cost,
      description: `${stockInfo?.name} 1주 매수`,
      note: note
    };

    setUserData(prev => {
      const newPortfolio = [...prev.portfolio];
      const existingItemIndex = newPortfolio.findIndex(item => item.ticker === ticker);
      
      if (existingItemIndex >= 0) {
        const item = newPortfolio[existingItemIndex];
        const newTotalCost = (item.shares * item.averagePrice) + cost;
        const newShares = item.shares + 1;
        newPortfolio[existingItemIndex] = {
          ...item,
          shares: newShares,
          averagePrice: newTotalCost / newShares
        };
      } else {
        newPortfolio.push({
          ticker,
          shares: 1,
          averagePrice: cost
        });
      }

      return {
        ...prev,
        balance: prev.balance - cost,
        portfolio: newPortfolio,
        transactions: [newTransaction, ...prev.transactions]
      };
    });
  };

  // 매도 함수
  const sellStock = (ticker: string, price: number) => {
    const portfolioItem = userData.portfolio.find(item => item.ticker === ticker);
    
    if (!portfolioItem || portfolioItem.shares <= 0) {
      alert('보유한 주식이 없습니다.');
      return;
    }

    const stockInfo = allStocks.find(s => s.ticker === ticker);
    const profit = price - portfolioItem.averagePrice;
    const note = prompt(`${stockInfo?.name}을(를) 매도하는 이유를 적어주세요!`, '') || '';
    
    const newTransaction: Transaction = {
      id: Date.now().toString(),
      date: Date.now(),
      type: 'SELL',
      amount: price,
      description: `${stockInfo?.name} 1주 매도 ${profit > 0 ? '(수익)' : profit < 0 ? '(손실)' : ''}`,
      note: note
    };

    setUserData(prev => {
      let newPortfolio = [...prev.portfolio];
      const existingItemIndex = newPortfolio.findIndex(item => item.ticker === ticker);
      
      if (existingItemIndex >= 0) {
        const item = newPortfolio[existingItemIndex];
        if (item.shares === 1) {
          newPortfolio = newPortfolio.filter(i => i.ticker !== ticker);
        } else {
          newPortfolio[existingItemIndex] = {
            ...item,
            shares: item.shares - 1
          };
        }
      }

      return {
        ...prev,
        balance: prev.balance + price,
        portfolio: newPortfolio,
        transactions: [newTransaction, ...prev.transactions]
      };
    });
  };

  // 용돈 입금
  const depositAllowance = () => {
    const amountStr = prompt('입금할 용돈 금액을 적어주세요 (예: 10000)', '10000');
    if (!amountStr) return;
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      alert('올바른 금액을 입력하세요.');
      return;
    }

    const newTransaction: Transaction = {
      id: Date.now().toString(),
      date: Date.now(),
      type: 'DEPOSIT',
      amount: amount,
      description: '용돈 입금'
    };

    setUserData(prev => ({
      ...prev,
      balance: prev.balance + amount,
      transactions: [newTransaction, ...prev.transactions]
    }));
  };

  const calculateTotalReturn = () => {
    let totalInvested = 0;
    let currentValue = 0;

    userData.portfolio.forEach(item => {
      totalInvested += item.shares * item.averagePrice;
      const livePrice = livePrices[item.ticker]?.price || item.averagePrice;
      currentValue += item.shares * livePrice;
    });

    const profit = currentValue - totalInvested;
    const profitPercent = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    return { profit, profitPercent, currentValue };
  };

  const handleResetData = () => {
    if (confirm('모든 투자 데이터와 보유 현금을 완전히 초기화(0원)하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      if (user) {
        saveUserDataToDB(user.uid, { ...defaultUserData, balance: 0, customStocks: [] });
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      setUserData({ ...defaultUserData, balance: 0, customStocks: [] });
      alert('모든 데이터가 초기화되었습니다. 용돈을 입금하여 투자를 다시 시작하세요!');
    }
  };

  // 새로운 종목 추가 함수
  const addNewStock = () => {
    const name = prompt('추가할 종목 이름을 입력하세요 (예: 삼성전자)', '');
    if (!name) return;
    
    const ticker = prompt('종목의 티커를 입력하세요\n(코스피는 .KS, 코스닥은 .KQ를 붙여주세요)\n예: 005930.KS', '');
    if (!ticker) return;

    if (allStocks.some(s => s.ticker === ticker)) {
      alert('이미 추가된 종목입니다.');
      return;
    }

    const yieldStr = prompt('연 배당률(%)을 입력하세요 (없으면 0)', '0');
    const dividendYield = parseFloat(yieldStr || '0');

    const newStock: Stock = {
      id: Date.now().toString(),
      name,
      ticker,
      dividendYield,
      icon: '📈'
    };

    setUserData(prev => ({
      ...prev,
      customStocks: [...(prev.customStocks || []), newStock]
    }));

    alert(`'${name}' 종목이 추가되었습니다! 주가를 불러오는 중입니다...`);
  };

  const returns = calculateTotalReturn();

  // 포트폴리오 비중 차트 데이터 생성
  const pieData = [
    { name: '현금', value: userData.balance }
  ];
  userData.portfolio.forEach(item => {
    const stockInfo = allStocks.find(s => s.ticker === item.ticker);
    const livePrice = livePrices[item.ticker]?.price || item.averagePrice;
    const currentValue = item.shares * livePrice;
    if (currentValue > 0) {
      pieData.push({ name: stockInfo?.name || item.ticker, value: currentValue });
    }
  });
  
  // 비중이 0인 항목 제외 및 파이 차트 색상 지정
  const activePieData = pieData.filter(d => d.value > 0);
  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

  if (isAuthChecking) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-white">로딩 중...</div>;
  }

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
          {user ? (
            <button onClick={handleLogout} title="로그아웃" className="px-3 py-1.5 bg-slate-800 rounded-full hover:bg-slate-700 transition text-sm flex items-center gap-1 text-slate-300">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          ) : (
            <button onClick={handleLogin} className="px-3 py-1.5 bg-primary/20 text-primary font-medium rounded-full hover:bg-primary/30 transition text-sm">
              로그인
            </button>
          )}
          <button onClick={handleResetData} title="모든 데이터 초기화" className="p-2 bg-slate-800 rounded-full hover:bg-danger/20 hover:text-danger transition text-slate-400">
            <AlertCircle className="w-5 h-5" />
          </button>
          <button onClick={refreshData} disabled={isLoading} title="주가 새로고침" className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition">
            <RefreshCw className={clsx("w-5 h-5 text-slate-300", isLoading && "animate-spin")} />
          </button>
        </div>
      </header>

      {/* Auth Banner */}
      {!user && (
        <div className="bg-blue-500/20 text-blue-300 text-xs px-4 py-2 text-center border-b border-blue-500/20">
          안전하게 데이터를 보관하려면 <b>로그인</b>해 주세요 (현재 게스트 모드)
        </div>
      )}

      <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* Total Assets Dashboard */}
        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 opacity-10">
            <DollarSign className="w-48 h-48" />
          </div>
          
          <div className="relative z-10 space-y-6">
            <div>
              <p className="text-slate-400 text-sm mb-1">총 자산</p>
              <h2 className="text-4xl font-black text-white">
                {(userData.balance + returns.currentValue).toLocaleString()}원
              </h2>
            </div>
            
            <div className="flex gap-6 pt-4 border-t border-white/10">
              <div>
                <p className="text-slate-400 text-xs mb-1">보유 현금</p>
                <p className="text-xl font-bold text-blue-400">
                  {userData.balance.toLocaleString()}원
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-xs mb-1">투자 수익금</p>
                <div className="flex items-end gap-2">
                  <p className={clsx("text-xl font-bold", returns.profit >= 0 ? "text-emerald-400" : "text-danger")}>
                    {returns.profit > 0 ? '+' : ''}{returns.profit.toLocaleString()}원
                  </p>
                  <span className={clsx("text-xs mb-1 px-1.5 rounded-full", returns.profitPercent >= 0 ? "bg-emerald-400/20 text-emerald-400" : "bg-danger/20 text-danger")}>
                    {returns.profitPercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            <button 
              onClick={depositAllowance}
              className="w-full py-3 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
            >
              <PlusCircle className="w-5 h-5" />
              용돈 입금하기
            </button>
          </div>
        </div>

        {/* Portfolio Allocation Chart */}
        {activePieData.length > 0 && (
          <div className="glass-panel p-5 rounded-3xl">
            <h3 className="font-semibold text-sm text-slate-300 flex items-center gap-2 mb-4">
              <PieChartIcon className="w-4 h-4 text-purple-400" />
              내 자산 포트폴리오 비중
            </h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={activePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {activePieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: any) => [value.toLocaleString() + '원', '평가 금액']}
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#f8fafc', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                    itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            {/* 범례 (Legend) */}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-2">
              {activePieData.map((entry, index) => {
                const total = activePieData.reduce((sum, item) => sum + item.value, 0);
                const percent = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0.0';
                
                return (
                  <div key={`legend-${index}`} className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                    {entry.name} ({percent}%)
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-slate-800/50 rounded-2xl">
          <button 
            onClick={() => setActiveTab('portfolio')}
            className={clsx("flex-1 py-3 text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition", activeTab === 'portfolio' ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200")}
          >
            <Briefcase className="w-4 h-4" /> 투자 종목
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={clsx("flex-1 py-3 text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition", activeTab === 'history' ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200")}
          >
            <History className="w-4 h-4" /> 거래 내역
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'portfolio' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                실시간 시장 현황
              </h3>
              <button 
                onClick={addNewStock}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full border border-white/10 transition flex items-center gap-1"
              >
                <PlusCircle className="w-3 h-3" /> 종목 추가
              </button>
            </div>

            {allStocks.map(stock => {
              const live = livePrices[stock.ticker];
              const isUp = live?.change >= 0;
              const portfolioItem = userData.portfolio.find(p => p.ticker === stock.ticker);

              return (
                <div key={stock.ticker} className="glass-panel p-4 rounded-2xl flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-xl shadow-inner border border-white/5">
                        {stock.icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-lg leading-tight">{stock.name}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{stock.ticker} · 연 배당률 {stock.dividendYield}%</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {live ? (
                        <>
                          <p className="font-bold text-lg">{live.price.toLocaleString()}원</p>
                          <p className={clsx("text-sm font-medium flex items-center justify-end gap-0.5", isUp ? "text-danger" : "text-blue-400")}>
                            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {live.change > 0 ? '+' : ''}{live.change.toLocaleString()} ({live.changePercent > 0 ? '+' : ''}{live.changePercent.toFixed(2)}%)
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-slate-500 font-medium">로딩 중...</p>
                      )}
                    </div>
                  </div>

                  {/* 보유 정보 표시 */}
                  {portfolioItem && portfolioItem.shares > 0 && live && (
                    <div className="bg-slate-800/50 rounded-xl p-3 flex justify-between items-center border border-white/5">
                      <div className="flex gap-4">
                        <div>
                          <p className="text-[10px] text-slate-400">보유 수량</p>
                          <p className="font-semibold text-sm">{portfolioItem.shares}주</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">평균단가</p>
                          <p className="font-semibold text-sm">{Math.floor(portfolioItem.averagePrice).toLocaleString()}원</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400">수익률</p>
                        <p className={clsx("font-bold text-sm", live.price >= portfolioItem.averagePrice ? "text-danger" : "text-blue-400")}>
                          {live.price >= portfolioItem.averagePrice ? '+' : ''}
                          {(((live.price - portfolioItem.averagePrice) / portfolioItem.averagePrice) * 100).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button 
                      onClick={() => live && buyStock(stock.ticker, live.price)}
                      disabled={!live || live.price === 0 || userData.balance < live.price}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-30 disabled:cursor-not-allowed transition border border-danger/20"
                    >
                      매수 (사기)
                    </button>
                    <button 
                      onClick={() => live && sellStock(stock.ticker, live.price)}
                      disabled={!live || live.price === 0 || !portfolioItem || portfolioItem.shares <= 0}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition border border-blue-500/20"
                    >
                      매도 (팔기)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            {userData.transactions.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                거래 내역이 없습니다.
              </div>
            ) : (
              userData.transactions.map(tx => (
                <div key={tx.id} className="glass-panel p-4 rounded-2xl flex items-center justify-between border-l-4 border-l-transparent" 
                  style={{ borderLeftColor: tx.type === 'BUY' ? '#ef4444' : tx.type === 'SELL' ? '#3b82f6' : tx.type === 'DIVIDEND' ? '#10b981' : '#8b5cf6' }}>
                  <div>
                    <p className="font-semibold">{tx.description}</p>
                    {tx.note && <p className="text-sm text-slate-300 mt-1 italic">" {tx.note} "</p>}
                    <p className="text-xs text-slate-400 mt-1">{new Date(tx.date).toLocaleString('ko-KR')}</p>
                  </div>
                  <div className="text-right">
                    <p className={clsx("font-bold", 
                      tx.type === 'BUY' ? 'text-danger' : 
                      tx.type === 'SELL' ? 'text-blue-400' : 
                      tx.type === 'DIVIDEND' ? 'text-emerald-400' : 'text-purple-400'
                    )}>
                      {tx.type === 'BUY' ? '-' : '+'}{tx.amount.toLocaleString()}원
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* 우측 하단 버전 정보 표시 */}
      <div className="fixed bottom-2 right-4 z-0 pointer-events-none">
        <span className="text-[10px] font-medium text-slate-500/50">v1.4.0</span>
      </div>
    </div>
  );
}
