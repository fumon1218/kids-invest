import { useState, useEffect } from 'react';
import { initialStocks, STORAGE_KEY, defaultUserData } from './data';
import type { Stock, UserData, StockPrice, Transaction, Mission, Goal } from './types';
import { fetchStockPrices } from './utils/api';
import { TrendingUp, TrendingDown, DollarSign, PlusCircle, Briefcase, History, RefreshCw, AlertCircle, LogOut, PieChart as PieChartIcon, CheckCircle2, Trophy, Lightbulb, BookOpen, Newspaper, Target, Sparkles, Calculator, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
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
  const [activeTab, setActiveTab] = useState<'portfolio' | 'history' | 'missions' | 'education'>('portfolio');
  const [calcMonthly, setCalcMonthly] = useState(10000);
  const [calcYears, setCalcYears] = useState(10);

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
          const stockInfo = allStocks.find((s: Stock) => s.ticker === item.ticker);
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
      recordAssetHistory();
      checkBadges();
    }
  }, [livePrices, userData.lastDividendMonth, userData.portfolio, allStocks, isAuthChecking, userData.transactions]);

  // 배지 획득 로직
  const checkBadges = () => {
    const newBadges = [...(userData.badges || [])];
    const { currentValue } = calculateTotalReturn();
    const totalAsset = userData.balance + currentValue;
    
    const conditions = [
      { id: 'first_invest', title: '초보 투자자', desc: '첫 주식 매수 성공!', cond: userData.transactions.some(t => t.type === 'BUY') },
      { id: 'saving_king', title: '저축왕', desc: '보유 현금 10만원 돌파!', cond: userData.balance >= 100000 },
      { id: 'dividend_master', title: '배당금 컬렉터', desc: '첫 배당금 수령!', cond: userData.transactions.some(t => t.type === 'DIVIDEND') },
      { id: 'quiz_hero', title: '퀴즈 히어로', desc: '경제 퀴즈 첫 정답!', cond: userData.transactions.some(t => t.description?.includes('퀴즈')) },
      { id: 'asset_rich', title: '꼬마 부자', desc: '총 자산 100만원 돌파!', cond: totalAsset >= 1000000 },
    ];

    let updated = false;
    conditions.forEach(c => {
      if (c.cond && !newBadges.includes(c.id)) {
        newBadges.push(c.id);
        updated = true;
        alert(`🏆 새로운 배지를 획득했습니다: [${c.title}]\n${c.desc}`);
      }
    });

    if (updated) {
      setUserData(prev => ({ ...prev, badges: newBadges }));
    }
  };

  // 목표 추가
  const addGoal = () => {
    const title = prompt('이루고 싶은 목표를 적어주세요! (예: 닌텐도 스위치 사기)', '');
    if (!title) return;
    const amountStr = prompt('목표 금액(원)을 입력하세요', '300000');
    const targetAmount = parseInt(amountStr || '0', 10);
    if (isNaN(targetAmount) || targetAmount <= 0) return;

    const newGoal: Goal = {
      id: Date.now().toString(),
      title,
      targetAmount,
      createdAt: Date.now()
    };
    setUserData(prev => ({ ...prev, goals: [...(prev.goals || []), newGoal] }));
  };

  const deleteGoal = (id: string) => {
    if (confirm('이 목표를 삭제하시겠습니까?')) {
      setUserData(prev => ({ ...prev, goals: (prev.goals || []).filter(g => g.id !== id) }));
    }
  };

  // 자산 히스토리 기록
  const recordAssetHistory = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const { currentValue } = calculateTotalReturn();
    const totalAsset = userData.balance + currentValue;

    const history = userData.assetHistory || [];
    const lastEntry = history[history.length - 1];

    if (!lastEntry || lastEntry.date !== today) {
      setUserData(prev => ({
        ...prev,
        assetHistory: [...(prev.assetHistory || []), { date: today, value: totalAsset }].slice(-30) // 최근 30일만 저장
      }));
    }
  };

  const quizzes = [
    { q: "주식을 사면 그 회사의 주인이 되는 것일까요?", a: true, hint: "주식은 회사의 소유권을 나타내는 증서예요." },
    { q: "은행에 예금을 하면 이자를 받을 수 있나요?", a: true, hint: "은행은 돈을 빌려준 대가로 이자를 줘요." },
    { q: "물가가 오르면 같은 돈으로 더 많은 물건을 살 수 있나요?", a: false, hint: "물가가 오르면 돈의 가치가 떨어져서 더 적게 사게 돼요." },
    { q: "복리란 이자에 또 이자가 붙는 것을 말하나요?", a: true, hint: "복리는 시간이 지날수록 돈이 눈덩이처럼 불어나게 해요." },
    { q: "분산 투자는 '계란을 한 바구니에 담지 마라'는 뜻인가요?", a: true, hint: "위험을 나누기 위해 여러 곳에 나누어 투자하는 것이 좋다는 뜻이에요." }
  ];

  const handleQuizAnswer = (answer: boolean) => {
    const today = new Date().toISOString().split('T')[0];
    const quizIdx = new Date().getDate() % quizzes.length;
    const correct = quizzes[quizIdx].a === answer;

    if (correct) {
      const reward = 1000;
      const newTransaction: Transaction = {
        id: Date.now().toString(),
        date: Date.now(),
        type: 'DEPOSIT',
        amount: reward,
        description: '일일 경제 퀴즈 정답 보상'
      };
      setUserData(prev => ({
        ...prev,
        balance: prev.balance + reward,
        lastQuizDate: today,
        transactions: [newTransaction, ...prev.transactions]
      }));
      alert(`정답입니다! 🎉 보상으로 ${reward.toLocaleString()}원이 지급되었습니다!`);
    } else {
      alert("아쉬워요! 내일 다시 도전해보세요. 💡 힌트: " + quizzes[quizIdx].hint);
      setUserData(prev => ({ ...prev, lastQuizDate: today }));
    }

  };

  const news = [
    "어린이 경제 신문: '용돈 아껴 투자하는 아이들이 늘고 있어요!'",
    "시장 소식: '코스피 지수가 오늘 활짝 웃었습니다.'",
    "전문가 조언: '주식 투자는 공부와 기다림이 가장 중요해요.'",
    "배당금 소식: '꾸준히 배당을 주는 착한 기업들이 주목받고 있습니다.'",
    "경제 상식: '금리가 오르면 은행 예금이 인기를 얻게 됩니다.'"
  ];

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

  // 최대 매수 함수 (All-in)
  const buyMaxStock = (ticker: string, price: number) => {
    const maxShares = Math.floor(userData.balance / price);
    if (maxShares <= 0) {
      alert('보유 현금이 부족하여 1주도 살 수 없습니다.');
      return;
    }
    
    const cost = maxShares * price;
    const stockInfo = allStocks.find((s: Stock) => s.ticker === ticker);
    const note = prompt(`${stockInfo?.name}을(를) ${maxShares}주 최대 매수하는 이유를 적어주세요!`, '') || '';
    
    const newTransaction: Transaction = {
      id: Date.now().toString(),
      date: Date.now(),
      type: 'BUY',
      amount: cost,
      description: `${stockInfo?.name} ${maxShares}주 최대 매수`,
      note: note
    };

    setUserData(prev => {
      const newPortfolio = [...prev.portfolio];
      const existingItemIndex = newPortfolio.findIndex(item => item.ticker === ticker);
      
      if (existingItemIndex >= 0) {
        const item = newPortfolio[existingItemIndex];
        const newTotalCost = (item.shares * item.averagePrice) + cost;
        const newShares = item.shares + maxShares;
        newPortfolio[existingItemIndex] = {
          ...item,
          shares: newShares,
          averagePrice: newTotalCost / newShares
        };
      } else {
        newPortfolio.push({
          ticker,
          shares: maxShares,
          averagePrice: price
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
        saveUserDataToDB(user.uid, { ...defaultUserData, balance: 0, customStocks: [], missions: [], badges: [], goals: [], assetHistory: [] });
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      setUserData({ ...defaultUserData, balance: 0, customStocks: [], missions: [], badges: [], goals: [], assetHistory: [] });
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

  // 미션 추가 함수
  const addMission = () => {
    const title = prompt('자녀에게 줄 새로운 미션 내용을 적어주세요!\n(예: 경제 관련 책 10페이지 읽기)', '');
    if (!title) return;
    
    const rewardStr = prompt('미션 완료 시 지급할 보상 금액(원)을 입력하세요', '1000');
    const reward = parseInt(rewardStr || '0', 10);
    if (isNaN(reward) || reward < 0) return;

    const newMission: Mission = {
      id: Date.now().toString(),
      title,
      reward,
      completed: false,
      createdAt: Date.now()
    };

    setUserData(prev => ({
      ...prev,
      missions: [newMission, ...(prev.missions || [])]
    }));
  };

  // 미션 완료 처리
  const completeMission = (missionId: string) => {
    const mission = userData.missions?.find(m => m.id === missionId);
    if (!mission || mission.completed) return;

    if (!confirm(`'${mission.title}' 미션을 완료하고 ${mission.reward.toLocaleString()}원을 보상으로 받으시겠습니까?`)) return;

    const newTransaction: Transaction = {
      id: Date.now().toString(),
      date: Date.now(),
      type: 'DEPOSIT',
      amount: mission.reward,
      description: `미션 보상: ${mission.title}`
    };

    setUserData(prev => ({
      ...prev,
      balance: prev.balance + mission.reward,
      transactions: [newTransaction, ...prev.transactions],
      missions: (prev.missions || []).map(m => 
        m.id === missionId ? { ...m, completed: true } : m
      )
    }));
    
    alert(`🎉 대단해요! 미션 완료 보상으로 ${mission.reward.toLocaleString()}원이 입금되었습니다!`);
  };

  // 미션 삭제
  const deleteMission = (missionId: string) => {
    if (!confirm('이 미션을 삭제하시겠습니까?')) return;
    setUserData(prev => ({
      ...prev,
      missions: (prev.missions || []).filter(m => m.id !== missionId)
    }));
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

        {/* Risk Education Card */}
        {returns.profitPercent < -5 && (
          <div className="bg-danger/10 border border-danger/20 p-4 rounded-2xl flex gap-3 items-start animate-pulse">
            <ShieldAlert className="w-6 h-6 text-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-danger font-bold text-sm">걱정 마세요! 시장은 원래 오르락내리락해요.</p>
              <p className="text-xs text-danger/80 mt-1 leading-relaxed">
                지금 수익률이 조금 떨어졌지만, 튼튼한 기업에 투자했다면 기다림도 투자의 일부예요. 
                부모님과 함께 이 기업의 미래에 대해 다시 이야기해볼까요?
              </p>
            </div>
          </div>
        )}

        {/* Goals Section */}
        <div className="glass-panel p-5 rounded-3xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm flex items-center gap-2 text-blue-400">
              <Target className="w-4 h-4" /> 나의 꿈 목표함
            </h3>
            <button onClick={addGoal} className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full font-bold">+ 목표 추가</button>
          </div>
          <div className="space-y-4">
            {(userData.goals || []).length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-2">사고 싶은 것이나 이루고 싶은 목표를 등록해봐요!</p>
            ) : (
              (userData.goals || []).map(goal => {
                const total = userData.balance + returns.currentValue;
                const progress = Math.min(100, (total / goal.targetAmount) * 100);
                return (
                  <div key={goal.id} className="space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span>{goal.title}</span>
                      <div className="flex gap-2">
                        <span>{Math.floor(progress)}%</span>
                        <button onClick={() => deleteGoal(goal.id)} className="text-slate-600 hover:text-danger">×</button>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Badges Preview */}
        {(userData.badges || []).length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {userData.badges?.map(badgeId => {
              const badgeIcons: Record<string, any> = {
                'first_invest': '🐣', 'saving_king': '💰', 'dividend_master': '🍯', 'quiz_hero': '🧠', 'asset_rich': '💎'
              };
              return (
                <div key={badgeId} className="shrink-0 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                  <span className="text-sm">{badgeIcons[badgeId] || '🏆'}</span>
                  <span className="text-[10px] font-bold text-slate-300">
                    {badgeId === 'first_invest' ? '초보 투자자' : 
                     badgeId === 'saving_king' ? '저축왕' : 
                     badgeId === 'dividend_master' ? '배당금 컬렉터' : 
                     badgeId === 'quiz_hero' ? '퀴즈 히어로' : '꼬마 부자'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

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
          <button 
            onClick={() => setActiveTab('missions')}
            className={clsx("flex-1 py-3 text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition", activeTab === 'missions' ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200")}
          >
            <Trophy className="w-4 h-4" /> 미션
          </button>
          <button 
            onClick={() => setActiveTab('education')}
            className={clsx("flex-1 py-3 text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition", activeTab === 'education' ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200")}
          >
            <BookOpen className="w-4 h-4" /> 교육
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
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-xl shadow-inner border border-white/5">
                        {stock.icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-lg leading-tight">{stock.name}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{stock.ticker}</p>
                      </div>
                    </div>

                    {/* Mini Sparkline Chart */}
                    <div className="flex-1 h-8 mx-4 hidden sm:block">
                      {live?.history && live.history.length > 0 && (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={live.history.map((val, idx) => ({ idx, val }))}>
                            <Line 
                              type="monotone" 
                              dataKey="val" 
                              stroke={isUp ? "#ef4444" : "#3b82f6"} 
                              strokeWidth={2} 
                              dot={false} 
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
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

                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => live && buyStock(stock.ticker, live.price)}
                        disabled={!live || live.price === 0 || userData.balance < live.price}
                        className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-30 disabled:cursor-not-allowed transition border border-danger/20"
                      >
                        1주 매수
                      </button>
                      <button 
                        onClick={() => live && buyMaxStock(stock.ticker, live.price)}
                        disabled={!live || live.price === 0 || userData.balance < live.price}
                        className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-danger text-white hover:bg-danger-hover disabled:opacity-30 disabled:cursor-not-allowed transition shadow-lg shadow-danger/20"
                      >
                        최대 매수
                      </button>
                    </div>
                    <button 
                      onClick={() => live && sellStock(stock.ticker, live.price)}
                      disabled={!live || live.price === 0 || !portfolioItem || portfolioItem.shares <= 0}
                      className="w-full py-2.5 rounded-xl font-bold text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition border border-blue-500/20"
                    >
                      1주 매도 (팔기)
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

        {activeTab === 'missions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                용돈 벌기 미션 🎯
              </h3>
              <button 
                onClick={addMission}
                className="text-xs bg-primary/20 hover:bg-primary/30 text-primary px-3 py-1.5 rounded-full border border-primary/20 transition flex items-center gap-1 font-bold"
              >
                <PlusCircle className="w-3 h-3" /> 미션 추가
              </button>
            </div>

            {(userData.missions || []).length === 0 ? (
              <div className="text-center py-10 text-slate-500 bg-slate-800/30 rounded-3xl border border-dashed border-white/10">
                <p>아직 등록된 미션이 없습니다.</p>
                <p className="text-xs mt-2">부모님이 미션을 등록해주시면 용돈을 벌 수 있어요!</p>
              </div>
            ) : (
              (userData.missions || []).map(mission => (
                <div key={mission.id} className={clsx("glass-panel p-4 rounded-2xl flex items-center justify-between transition-all", mission.completed ? "opacity-60 grayscale-[0.5]" : "border-r-4 border-r-primary/30")}>
                  <div className="flex items-start gap-3">
                    <div className={clsx("p-2 rounded-xl shrink-0", mission.completed ? "bg-emerald-500/20 text-emerald-500" : "bg-slate-700 text-slate-400")}>
                      {mission.completed ? <CheckCircle2 className="w-6 h-6" /> : <Trophy className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className={clsx("font-bold text-lg leading-tight", mission.completed && "line-through text-slate-500")}>
                        {mission.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold text-blue-400">보상: {mission.reward.toLocaleString()}원</span>
                        {mission.completed && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">완료됨</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {!mission.completed && (
                      <button 
                        onClick={() => completeMission(mission.id)}
                        className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-hover shadow-lg shadow-primary/20 transition"
                      >
                        완료하기
                      </button>
                    )}
                    <button 
                      onClick={() => deleteMission(mission.id)}
                      className="text-[10px] text-slate-500 hover:text-danger transition"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            )}
            
            <div className="p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20 text-xs text-blue-300 leading-relaxed">
              💡 <b>금융 교육 팁:</b> 스스로 용돈을 벌고 그 돈을 투자해보며 돈의 가치를 배워보세요!
            </div>
          </div>
        )}

        {activeTab === 'education' && (
          <div className="space-y-6">
            {/* Daily Quiz Section */}
            <div className="glass-panel p-5 rounded-3xl border-l-4 border-l-yellow-400">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg flex items-center gap-2 text-yellow-400">
                  <Lightbulb className="w-5 h-5" /> 일일 경제 퀴즈
                </h3>
                {userData.lastQuizDate === new Date().toISOString().split('T')[0] ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-bold">오늘 참여 완료</span>
                ) : (
                  <span className="text-[10px] bg-yellow-400/20 text-yellow-400 px-2 py-1 rounded-full font-bold animate-pulse">오늘의 퀴즈 도착!</span>
                )}
              </div>
              
              {userData.lastQuizDate !== new Date().toISOString().split('T')[0] ? (
                <div className="space-y-4">
                  <p className="text-white font-medium text-lg leading-relaxed">
                    {quizzes[new Date().getDate() % quizzes.length].q}
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => handleQuizAnswer(true)} className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold transition shadow-lg shadow-emerald-500/20">O (그렇다)</button>
                    <button onClick={() => handleQuizAnswer(false)} className="flex-1 py-3 bg-danger hover:bg-danger-hover rounded-xl font-bold transition shadow-lg shadow-danger/20">X (아니다)</button>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 text-sm">오늘의 퀴즈를 이미 풀었습니다. 내일 다시 만나요!</p>
              )}
            </div>

            {/* News Feed Section */}
            <div className="glass-panel p-5 rounded-3xl">
              <h3 className="font-bold text-lg flex items-center gap-2 text-blue-400 mb-4">
                <Newspaper className="w-5 h-5" /> 오늘의 경제 소식
              </h3>
              <div className="space-y-3">
                {news.map((n, i) => (
                  <div key={i} className="p-3 bg-white/5 rounded-xl text-sm border border-white/5 hover:bg-white/10 transition cursor-pointer">
                    {n}
                  </div>
                ))}
              </div>
            </div>

            {/* Asset Growth Chart Section */}
            <div className="glass-panel p-5 rounded-3xl overflow-hidden">
              <h3 className="font-bold text-lg flex items-center gap-2 text-emerald-400 mb-4">
                <TrendingUp className="w-5 h-5" /> 내 자산 성장 그래프
              </h3>
              <div className="h-48 w-full -ml-6">
                {(userData.assetHistory || []).length < 2 ? (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs text-center px-10">
                    데이터가 쌓이고 있어요! 매일 앱에 들어와 자산의 변화를 확인해보세요.
                  </div>
                ) : (
                  <ResponsiveContainer width="110%" height="100%">
                    <LineChart data={userData.assetHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        hide 
                      />
                      <YAxis 
                        hide 
                        domain={['auto', 'auto']}
                      />
                      <RechartsTooltip 
                        formatter={(value: any) => [value.toLocaleString() + '원', '총 자산']}
                        labelFormatter={(label) => `날짜: ${label}`}
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#f8fafc' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#10b981" 
                        strokeWidth={3} 
                        dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} 
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Compound Interest Calculator */}
            <div className="glass-panel p-5 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
              <h3 className="font-bold text-lg flex items-center gap-2 text-purple-400 mb-4">
                <Calculator className="w-5 h-5" /> 복리의 마법 계산기
              </h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">매달 저축액</span>
                    <span className="text-white font-bold">{calcMonthly.toLocaleString()}원</span>
                  </div>
                  <input type="range" min="1000" max="100000" step="1000" value={calcMonthly} onChange={(e) => setCalcMonthly(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">투자 기간</span>
                    <span className="text-white font-bold">{calcYears}년</span>
                  </div>
                  <input type="range" min="1" max="30" step="1" value={calcYears} onChange={(e) => setCalcYears(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                </div>
                
                {(() => {
                  const r = 0.08 / 12; // 연 8% 수익률 가정
                  const n = calcYears * 12;
                  const futureValue = calcMonthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
                  const totalInvested = calcMonthly * n;
                  const profit = futureValue - totalInvested;
                  
                  return (
                    <div className="pt-4 border-t border-white/5 space-y-2">
                      <div className="flex justify-between items-end">
                        <span className="text-[10px] text-slate-400">예상 최종 자산 (연 8% 수익 가정)</span>
                        <span className="text-lg font-black text-white">{Math.floor(futureValue).toLocaleString()}원</span>
                      </div>
                      <p className="text-[10px] text-purple-400 text-center">원금 {totalInvested.toLocaleString()}원이 시간이 지나 {Math.floor(profit).toLocaleString()}원의 수익을 만들었어요! ✨</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Achievement Badges Section */}
            <div className="glass-panel p-5 rounded-3xl">
              <h3 className="font-bold text-lg flex items-center gap-2 text-indigo-400 mb-4">
                <Sparkles className="w-5 h-5" /> 나의 성취 배지함
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'first_invest', title: '초보 투자자', icon: '🐣' },
                  { id: 'saving_king', title: '저축왕', icon: '💰' },
                  { id: 'dividend_master', title: '배당금 컬렉터', icon: '🍯' },
                  { id: 'quiz_hero', title: '퀴즈 히어로', icon: '🧠' },
                  { id: 'asset_rich', title: '꼬마 부자', icon: '💎' },
                  { id: 'hidden', title: '준비 중...', icon: '🔒' }
                ].map(b => (
                  <div key={b.id} className={clsx("flex flex-col items-center gap-1 p-2 rounded-2xl border transition", 
                    userData.badges?.includes(b.id) ? "bg-white/5 border-white/10" : "opacity-20 border-transparent grayscale")}>
                    <span className="text-3xl">{b.icon}</span>
                    <span className="text-[10px] font-medium text-slate-400">{b.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 우측 하단 버전 정보 표시 */}
      <div className="fixed bottom-2 right-4 z-0 pointer-events-none">
        <span className="text-[10px] font-medium text-slate-500/50">v2.1.0</span>
      </div>
    </div>
  );
}
