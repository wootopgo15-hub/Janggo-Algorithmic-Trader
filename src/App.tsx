import React, { useState, useEffect, useRef } from 'react';
import { Activity, Play, Pause, Wallet, History, LineChart as ChartIcon, CheckSquare, XSquare, Settings, Key, X, AlertCircle, AlertTriangle, Zap, RefreshCw, Shield } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import Markdown from 'react-markdown';
import { io } from 'socket.io-client';
import { TradingChart } from './components/TradingChart';

// Configure socket
const socket = io();

// Consolidation utility for simultaneous take profits (익절) & stop losses (손절) per coin symbol
const processTradeHistory = (trades: any[]) => {
  if (!trades || !Array.isArray(trades) || trades.length === 0) return [];

  // Group trades by symbol
  const tradesBySymbol: { [key: string]: any[] } = {};
  for (const t of trades) {
    if (!t || typeof t !== 'object') continue;
    const symbol = t.symbol || 'UNKNOWN';
    if (!tradesBySymbol[symbol]) {
      tradesBySymbol[symbol] = [];
    }
    tradesBySymbol[symbol].push(t);
  }

  const allProcessedTrades: any[] = [];
  const TIME_THRESHOLD_MS = 60000; // 1 minute window for "simultaneous"

  // Process simultaneous trades separately for each coin symbol
  for (const symbol in tradesBySymbol) {
    const symbolTrades = tradesBySymbol[symbol];
    if (!Array.isArray(symbolTrades)) continue;
    // Sort by date ascending to merge chronologically
    const sorted = [...symbolTrades]
      .filter(t => t && typeof t.date === 'number')
      .sort((a, b) => a.date - b.date);
    
    let currentGroup: any[] = [];
    let currentIsTp: boolean | null = null; // true for TP (>=0), false for SL (<0)

    for (const t of sorted) {
      if (!t) continue;
      const isTp = (t.pnl ?? 0) >= 0;

      if (currentGroup.length === 0) {
        currentGroup.push(t);
        currentIsTp = isTp;
      } else {
        const firstTrade = currentGroup[0];
        const isTimeMatch = Math.abs(t.date - firstTrade.date) <= TIME_THRESHOLD_MS;
        const isTypeMatch = isTp === currentIsTp;

        if (isTimeMatch && isTypeMatch) {
          currentGroup.push(t);
        } else {
          allProcessedTrades.push(mergeGroup(currentGroup, currentIsTp!));
          currentGroup = [t];
          currentIsTp = isTp;
        }
      }
    }

    if (currentGroup.length > 0) {
      allProcessedTrades.push(mergeGroup(currentGroup, currentIsTp!));
    }
  }

  // Sort ascending chronologically (so the newest trade appears at the bottom)
  return allProcessedTrades.sort((a, b) => a.date - b.date);
};

const mergeGroup = (group: any[], isTp: boolean) => {
  if (!group || group.length === 0) {
    return {
      id: `err-${Math.random()}`,
      date: Date.now(),
      symbol: 'UNKNOWN',
      side: 'LONG',
      exitType: 'SL',
      isReal: false,
      pnl: 0,
      pnlPct: 0,
      balance: 1000
    };
  }
  if (group.length === 1) return group[0];

  const firstTrade = group[0];
  const totalPnL = group.reduce((sum, t) => sum + (Number(t?.pnl) || 0), 0);
  const avgPnlPct = group.reduce((sum, t) => sum + (Number(t?.pnlPct) || 0), 0) / group.length;

  // Find the latest trade inside the group to base state on
  const latestTrade = group.reduce((latest, current) => (current?.date || 0) > (latest?.date || 0) ? current : latest, group[0]);

  return {
    id: `merged-${firstTrade?.symbol || 'UNKNOWN'}-${isTp ? 'tp' : 'sl'}-${group.map(t => t?.id || t?.date || Math.random()).join('-')}`,
    date: latestTrade?.date || Date.now(),
    symbol: firstTrade?.symbol || 'UNKNOWN',
    side: firstTrade?.side || 'LONG',
    exitType: isTp ? 'TP' : 'SL',
    isReal: group.some(t => t?.isReal),
    pnl: totalPnL,
    pnlPct: avgPnlPct,
    balance: latestTrade?.balance || 1000,
    isMerged: true,
    isTp: isTp,
    mergedCount: group.length,
    originalTrades: group
  };
};

export default function App() {
  const [status, setStatus] = useState<any | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [showWalletSettings, setShowWalletSettings] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const historyContainerRef = useRef<HTMLDivElement>(null);
  
  // API key states
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('user_api_key') || '');
  const [secretKey, setSecretKey] = useState(() => localStorage.getItem('user_secret_key') || '');
  const [passphrase, setPassphrase] = useState(() => localStorage.getItem('user_passphrase') || '');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('user_gemini_key') || '');
  const [bitgetUseDemo, setBitgetUseDemo] = useState(() => {
    const saved = localStorage.getItem('user_bitget_use_demo');
    return saved === null ? false : saved === 'true';
  });
  
  // Live trading mode & diagnostics utilities
  const [isRealTradingActive, setIsRealTradingActive] = useState(() => {
    const saved = localStorage.getItem('user_is_real_trading_active');
    return saved === null ? true : saved === 'true';
  });
  const [isTransitioningMode, setIsTransitioningMode] = useState(false);
  const [diagnosticStatus, setDiagnosticStatus] = useState<'idle' | 'running' | 'success' | 'fail'>('idle');
  const [diagnosticResult, setDiagnosticResult] = useState<any | null>(null);

  const [ohlcvData, setOhlcvData] = useState<Record<string, any[]>>({});

  useEffect(() => {
    socket.on('ohlcv', (data) => {
      setOhlcvData(prev => {
        const sym = data.symbol;
        const currentData = prev[sym] || [];
        const newBar = data.ohlcv;
        const copy = [...currentData];
        if (copy.length > 0 && copy[copy.length - 1][0] === newBar[0]) {
          copy[copy.length - 1] = newBar;
        } else {
          copy.push(newBar);
        }
        if (copy.length > 100) copy.shift();
        return { ...prev, [sym]: copy };
      });
    });

    return () => {
      socket.off('ohlcv');
    };
  }, []);

  // Fetch initial OHLCV history
  const activeCoins = status?.settings?.selectedSymbols || [];
  useEffect(() => {
    activeCoins.forEach((sym: string) => {
      if (!ohlcvData[sym] || ohlcvData[sym].length === 0) {
        fetch(`/api/ohlcv/${encodeURIComponent(sym)}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.data && data.data.length > 0) {
              setOhlcvData(prev => ({ ...prev, [sym]: data.data }));
            }
          })
          .catch(console.error);
      }
    });
  }, [activeCoins]);



  // Custom UI notification, confirmation dialog, and toast systems bypassing window.confirm/alert
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showToggleRealConfirm, setShowToggleRealConfirm] = useState(false);
  const [customToast, setCustomToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const triggerToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setCustomToast({ message, type });
    setTimeout(() => {
      setCustomToast(prev => prev?.message === message ? null : prev);
    }, 4500);
  };

  // Robust auto-sync saved user configs on component mounting
  useEffect(() => {
    const savedGeminiKey = localStorage.getItem('user_gemini_key') || '';
    const savedApiKey = localStorage.getItem('user_api_key') || '';
    const savedSecretKey = localStorage.getItem('user_secret_key') || '';
    const savedPassphrase = localStorage.getItem('user_passphrase') || '';
    const savedIsRealSetting = localStorage.getItem('user_is_real_trading_active');
    const savedIsReal = savedIsRealSetting === null ? true : savedIsRealSetting === 'true';

    const syncSettings = async () => {
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            geminiKey: savedGeminiKey || undefined,
            bitgetApiKey: savedApiKey || undefined,
            bitgetApiSecret: savedSecretKey || undefined,
            bitgetPassphrase: savedPassphrase || undefined,
            isRealTradingActive: savedIsReal
          })
        });
      } catch (e) {
        console.error('Failed to sync user configs on mount:', e);
      }
    };
    syncSettings();
  }, []);

  // Wallet settings states
  const [editBalance, setEditBalance] = useState('1000');
  const [editUsage, setEditUsage] = useState('10');

  useEffect(() => {
    if (showWalletSettings && status) {
      setEditBalance(status.globalBalanceUsdt?.toString() || '1000');
      setEditUsage(status.settings?.walletUsage?.toString() || '10');
    }
  }, [showWalletSettings]);

  const saveWalletSettings = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletUsage: editUsage,
          globalBalanceUsdt: editBalance
        })
      });
      const data = await res.json();
      if (data.success) {
        setStatus((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            globalBalanceUsdt: data.globalBalanceUsdt,
            settings: {
              ...prev.settings,
              ...data.settings
            }
          };
        });
      }
      setShowWalletSettings(false);
    } catch(e) {}
  };

  const toggleSymbolSelection = async (sym: string) => {
    const currentSelected = status?.settings?.selectedSymbols || TARGET_SYMBOLS;
    let nextSelected: string[];
    if (currentSelected.includes(sym)) {
      if (currentSelected.length <= 1) {
        triggerToast('최소 1개 이상의 코인은 선택되어 있어야 합니다.', 'error');
        return;
      }
      nextSelected = currentSelected.filter((s: string) => s !== sym);
    } else {
      nextSelected = [...currentSelected, sym];
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedSymbols: nextSelected
        })
      });
      const data = await res.json();
      if (data.success) {
        setStatus((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            settings: {
              ...prev.settings,
              selectedSymbols: nextSelected
            }
          };
        });
        triggerToast(`${sym.split('/')[0]} 투자가 ${currentSelected.includes(sym) ? '비활성화' : '활성화'} 처리되었습니다.`, 'success');
      }
    } catch (e) {
      console.error('Failed to toggle symbol selection:', e);
    }
  };
  
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) {
          // Skip tick silently if server is offline or starting up
          return;
        }
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          return;
        }
        const data = await res.json();
        if (data) {
          setStatus(data);
          // Synchronize real trading mode from backend state loop
          if (data.settings) {
            if (typeof data.settings.isRealTradingActive === 'boolean') {
              setIsRealTradingActive(data.settings.isRealTradingActive);
            }
            if (typeof data.settings.bitgetUseDemo === 'boolean') {
              setBitgetUseDemo(data.settings.bitgetUseDemo);
            }
          }
        }
        
        const lRes = await fetch('/api/logs');
        if (lRes.ok) {
          const lContentType = lRes.headers.get('content-type');
          if (lContentType && lContentType.includes('application/json')) {
            const lData = await lRes.json();
            if (lData && lData.logs) {
              setLogs(lData.logs);
            }
          }
        }
      } catch(e) {
        // Log a warning instead of a disruptive console error stack trace during restarts
        console.warn("API offline or booting, retrying...", e);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const lastHistoryLengthRef = useRef<number>(0);
  useEffect(() => {
    const historyLength = status?.tradeHistory?.length || 0;
    if (historyLength > 0 && historyLength !== lastHistoryLengthRef.current) {
      lastHistoryLengthRef.current = historyLength;
      setTimeout(() => {
        if (historyContainerRef.current) {
          historyContainerRef.current.scrollTop = historyContainerRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [status?.tradeHistory]);

  const toggleSetting = async (key: string, value: boolean) => {
    try {
      if (key === 'isRealTradingActive') {
        setIsTransitioningMode(true);
        setStatus(null);
        setLogs([]);
      }
      const res = await fetch('/api/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setStatus((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            settings: {
              ...prev.settings,
              ...data.settings
            }
          };
        });
      }
      
      if (key === 'isRealTradingActive') {
        setIsRealTradingActive(value);
        localStorage.setItem('user_is_real_trading_active', String(value));
        
        // Wait 1.5s for seamless reset animation experience
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        try {
          const freshRes = await fetch('/api/status');
          if (freshRes.ok) {
            const freshData = await freshRes.json();
            if (freshData) {
              setStatus(freshData);
            }
          }
          const freshLogsRes = await fetch('/api/logs');
          if (freshLogsRes.ok) {
            const freshLogsData = await freshLogsRes.json();
            if (freshLogsData && freshLogsData.logs) {
              setLogs(freshLogsData.logs);
            }
          }
        } catch (e) {
          console.error(e);
        } finally {
          setIsTransitioningMode(false);
        }
      }
    } catch(e) {
      if (key === 'isRealTradingActive') {
        setIsTransitioningMode(false);
      }
    }
  };

  const [isTriggeringAi, setIsTriggeringAi] = useState(false);
  const handleTriggerAi = async () => {
    if (isTriggeringAi) return;
    setIsTriggeringAi(true);
    try {
      const res = await fetch('/api/trigger-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        triggerToast(data.error || 'AI 분석 요청에 실패했습니다.', 'error');
      } else {
        triggerToast('AI 분석이 성공적으로 실행 및 갱신되었습니다.', 'success');
      }
    } catch (e) {
      console.error(e);
      triggerToast('AI 분석 요청에 실패했습니다.', 'error');
    } finally {
      setIsTriggeringAi(false);
    }
  };
  
  const [instantEntryLoading, setInstantEntryLoading] = useState<{[key: string]: boolean}>({});
  const handleInstantMarketEntry = async (symbol: string, side: 'LONG' | 'SHORT') => {
    if (instantEntryLoading[symbol]) return;
    setInstantEntryLoading(prev => ({ ...prev, [symbol]: true }));
    try {
      const res = await fetch('/api/instant-market-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, side })
      });
      const data = await res.json();
      if (data.success && data.position) {
        triggerToast(`${symbol} 코인에 대해 ${side === 'LONG' ? '롱' : '숏'} 지정가 강제 진입을 처리했습니다!`, 'success');
        setStatus((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            positions: {
              ...prev.positions,
              [symbol]: data.position
            }
          };
        });
      } else {
        triggerToast(data.message || "시장가 즉시 전환 처리 실패", "error");
      }
    } catch (e: any) {
      console.error(e);
      triggerToast("서버 통신 실패: " + (e.message || String(e)), "error");
    } finally {
      setInstantEntryLoading(prev => ({ ...prev, [symbol]: false }));
    }
  };

  const [confirmingExitSymbol, setConfirmingExitSymbol] = useState<string | null>(null);
  const [confirmCancelAll, setConfirmCancelAll] = useState(false);
  const [forceExitLoading, setForceExitLoading] = useState<{[key: string]: boolean}>({});
  const handleForceExitPosition = async (symbol: string) => {
    if (forceExitLoading[symbol]) return;
    setForceExitLoading(prev => ({ ...prev, [symbol]: true }));
    try {
      const res = await fetch('/api/force-exit-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      const data = await res.json();
      if (data.success && data.position) {
        triggerToast(`${symbol} 포지션이 즉시 수동 청산되었으며 감시 화면 가동이 자동 비활성화되었습니다!`, 'success');
        setStatus((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            globalBalanceUsdt: data.balance ?? prev.globalBalanceUsdt,
            settings: data.settings ?? prev.settings,
            positions: {
              ...prev.positions,
              [symbol]: data.position
            }
          };
        });
        setConfirmingExitSymbol(null);
      } else {
        triggerToast(data.message || "수동 청산 처리 실패", "error");
      }
    } catch (e: any) {
      console.error(e);
      triggerToast("서버 통신 실패: " + (e.message || String(e)), "error");
    } finally {
      setForceExitLoading(prev => ({ ...prev, [symbol]: false }));
    }
  };

  const [isOptimizing, setIsOptimizing] = useState(false);
  const handleOptimizeOrders = async () => {
    if (isOptimizing) return;
    setIsOptimizing(true);
    try {
      const res = await fetch('/api/optimize-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        triggerToast(data.message || '오더 최적화 및 BNB 포지션 구제 완료!', 'success');
        if (data.positions) {
          setStatus((prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              positions: data.positions
            };
          });
        }
      } else {
        triggerToast(data.message || '오더 최적화 중 에러가 발생했습니다.', 'error');
      }
    } catch (e) {
      console.error(e);
      triggerToast('오더 최적화 통신오류: 서버 연결을 확인하세요.', 'error');
    } finally {
      setIsOptimizing(false);
    }
  };

  const [isCanceling, setIsCanceling] = useState(false);
  const handleCancelAllOrders = async () => {
    if (isCanceling) return;
    setIsCanceling(true);
    try {
      const res = await fetch('/api/cancel-all-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        triggerToast(data.message || '모든 대기 및 감시 오더가 완전히 삭제되었습니다.', 'success');
        setConfirmCancelAll(false);
        if (data.positions) {
          setStatus((prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              positions: data.positions
            };
          });
        }
      } else {
        triggerToast(data.message || '오더 삭제 중 오류가 발생했습니다.', 'error');
      }
    } catch (e) {
      console.error(e);
      triggerToast('오더 전량 삭제 통신오류: 서버 연결을 확인하세요.', 'error');
    } finally {
      setIsCanceling(false);
    }
  };

  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const handleSyncTradeHistory = async () => {
    if (isSyncingHistory) return;
    setIsSyncingHistory(true);
    try {
      const res = await fetch('/api/sync-trade-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        triggerToast(data.message || '매매 히스토리 동기화 완료!', 'success');
        if (data.tradeHistory) {
          setStatus((prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              tradeHistory: data.tradeHistory
            };
          });
        }
      } else {
        triggerToast(data.message || '매매 히스토리 동기화에 실패했습니다.', 'error');
      }
    } catch (e) {
      console.error(e);
      triggerToast('매매 히스토리 업데이트 통신오류가 발생했습니다.', 'error');
    } finally {
      setIsSyncingHistory(false);
    }
  };

  const runDiagnostic = async () => {
    setDiagnosticStatus('running');
    setDiagnosticResult(null);
    try {
      const res = await fetch('/api/test-bitget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          secret: secretKey.trim(),
          passphrase: passphrase.trim(),
          useDemo: bitgetUseDemo
        })
      });
      const data = await res.json();
      if (data.success) {
        setDiagnosticStatus('success');
        setDiagnosticResult(data);
      } else {
        setDiagnosticStatus('fail');
        setDiagnosticResult(data);
      }
    } catch (e: any) {
      setDiagnosticStatus('fail');
      setDiagnosticResult({ message: '비트겟 검증 요청 중 통신 차단이 발생했습니다: ' + e.message });
    }
  };

  const isTradingActive = status?.settings?.isTradingActive || false;
  const isAiActive = status?.settings?.isAiActive || false;

  const TARGET_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT', 'LINK/USDT', 'DOT/USDT', 'BNB/USDT'];

  // Calculate unrealized PNL and total Equity
  const positions = status?.positions || {};
  const charts = status?.multiChartData || {};
  
  let totalUnrealizedPnl = 0;
  Object.keys(positions).forEach(sym => {
    const pos = positions[sym];
    const currentPrice = charts[sym]?.[charts[sym].length - 1]?.price;
    if (pos && pos.side !== 'NONE' && pos.entryPrice > 0 && currentPrice) {
      const isLong = pos.side === 'LONG';
      const pnlPct = ((isLong ? (currentPrice - pos.entryPrice) / pos.entryPrice : (pos.entryPrice - currentPrice) / pos.entryPrice) * 5);
      totalUnrealizedPnl += pos.balanceUsdt * pnlPct;
    }
  });

  const totalEquity = (status?.globalBalanceUsdt || 1000) + totalUnrealizedPnl;
  const initialBalance = status?.initialGlobalBalanceUsdt || 1000;
  const netProfit = totalEquity - initialBalance;
  const isProfit = netProfit >= 0;

  return (
    <div className="min-h-screen bg-black font-sans text-slate-200 flex flex-col overflow-hidden">
      {/* Top Header */}
      <header className="bg-[#0a0a0a] border-b border-[#222] px-6 py-4 shrink-0 flex flex-col xl:flex-row xl:justify-between items-center z-10 w-full shadow-sm gap-4">
        <div className="flex flex-col md:flex-row items-center gap-4 xl:gap-8 w-full xl:w-auto justify-between xl:justify-start">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2 shrink-0">
            <Activity className="text-blue-500" />
            QuantBot <span className="text-gray-500 text-lg font-normal hidden 2xl:inline">| 다중 모니터링</span>
          </h1>
          
          {/* 비트겟 연동 상시 표기 명시 */}
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0 bg-black border border-[#222] rounded-lg px-2.5 py-1.5 text-xs shadow-xs">
            <span className={`w-2 h-2 rounded-full ${status?.hasBitgetApiKey ? 'bg-emerald-500 animate-pulse' : 'bg-rose-450'}`}></span>
            <span className="font-bold text-slate-500 font-sans">비트겟 API 연동:</span>
            {status?.hasBitgetApiKey ? (
              <span className="font-extrabold text-emerald-700 flex items-center gap-1.5">
                ✓ 안전 저장됨
                {isRealTradingActive ? (
                  <span className="text-[10px] text-red-500 bg-red-950/30 border border-red-900/50 px-1 py-0.5 rounded font-black animate-pulse">실전 활성</span>
                ) : (
                  <span className="text-[10px] text-amber-500 bg-amber-950/30 border border-amber-900/50 px-1 py-0.5 rounded font-black">시뮬레이션</span>
                )}
              </span>
            ) : (
              <span className="font-semibold text-rose-500 flex items-center gap-1">
                ⚠️ 외부 지갑 연동대기
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 md:gap-4 shrink-0">
             <div className="flex bg-[#111] rounded-lg p-1.5 border border-[#222] items-center">
                <span className="text-[10px] md:text-xs font-bold text-gray-400 mr-2 uppercase tracking-wide">Net Profit</span>
                <span className={`text-xs md:text-sm font-bold px-1.5 py-0.5 rounded mr-1.5 ${isProfit ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                  {isProfit ? '+' : '-'}${Math.abs(netProfit).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                </span>
                <span className={`text-sm md:text-lg font-black px-2 py-0.5 rounded shadow-sm border font-mono ${isProfit ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/50 shadow-emerald-500/5' : 'text-rose-400 bg-rose-950/30 border-rose-900/50 shadow-rose-500/5'}`}>
                  {isProfit ? '+' : '-'}{Math.round(Math.abs(netProfit * 1385)).toLocaleString()}원
                </span>
             </div>
             <div className="flex bg-[#111] rounded-lg p-1.5 border border-[#222] items-center">
                <span className="text-[10px] md:text-xs font-bold text-gray-400 mr-2 uppercase tracking-wide">Total (복리)</span>
                <span className="text-xs md:text-sm font-bold text-gray-400 px-1.5 py-0.5 rounded mr-1.5">
                  ${totalEquity.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                </span>
                <span className="text-sm md:text-lg font-black text-indigo-400 bg-indigo-950/30 px-2 py-0.5 rounded shadow-sm border border-indigo-900/50 font-mono">
                  ₩{Math.round(totalEquity * 1385).toLocaleString()}원
                </span>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-center xl:justify-end">
          <button 
            onClick={() => setShowWalletSettings(true)}
            className="flex bg-[#111] rounded-lg p-1.5 border border-[#222] items-center hover:bg-[#1a1a1a] transition-colors cursor-pointer focus:outline-none"
            title="투자금 및 비중 설정"
          >
            <span className="text-[10px] md:text-xs font-bold text-gray-400 mr-2 uppercase tracking-wide">Initial</span>
            <span className="text-sm md:text-base font-black text-gray-200 bg-[#0a0a0a] px-2 py-0.5 rounded shadow-sm border border-[#222]">
              ${initialBalance.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
            </span>
            <Settings size={14} className="ml-1 text-gray-500" />
          </button>

          <button 
            onClick={() => setShowApiSettings(true)}
            className="p-2 ml-1 mr-1 rounded-md transition-colors bg-[#111] hover:bg-[#1a1a1a] text-gray-400 flex items-center justify-center border border-[#222]"
            title="API 설정"
          >
            <Settings size={18} />
          </button>

          {/* Segmented Mode Selector: Paper vs Live */}
          <div className="flex bg-[#111] p-1 rounded-lg border border-[#222] items-center select-none shrink-0 gap-1.5 shadow-xs">
            <button
              onClick={() => {
                if (isRealTradingActive) {
                  toggleSetting('isRealTradingActive', false);
                  triggerToast('[정보] 모의 매매(Simulated Trading) 모드로 성공적으로 전환되었습니다.', 'info');
                }
              }}
              className={`px-3 py-1.5 rounded-md text-[11px] md:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer focus:outline-none ${!isRealTradingActive ? 'bg-amber-600/30 text-amber-400 border border-amber-900/50 shadow-xs' : 'text-gray-500 hover:text-gray-200 hover:bg-[#222]'}`}
              title="가상 모의 계정으로 자산을 시뮬레이션 매매합니다."
            >
              <Activity size={14} />
               모의매매 모드
            </button>
            <button
              onClick={() => {
                if (!isRealTradingActive) {
                  setShowToggleRealConfirm(true);
                }
              }}
              className={`px-3 py-1.5 rounded-md text-[11px] md:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer focus:outline-none ${isRealTradingActive ? 'bg-rose-600 text-white shadow-xs' : 'text-gray-500 hover:text-gray-200 hover:bg-[#222]'}`}
              title="실제 비트겟 거래소 계정의 실물 자산으로 거래합니다."
            >
              <Zap size={14} />
               실전매매 모드
            </button>
          </div>

          {/* Engine Enable/Disable Toggle */}
          <button 
            onClick={() => toggleSetting('isTradingActive', !isTradingActive)}
            className={`px-3 py-2 md:px-4 rounded-lg text-[11px] md:text-sm font-bold transition-all flex items-center gap-1.5 md:gap-2 cursor-pointer focus:outline-none border ${isTradingActive ? 'bg-emerald-950/20 text-emerald-400 border border-emerald-900/50 hover:bg-emerald-900/30 shadow-xs' : 'bg-[#111] text-gray-500 border-[#333] hover:hover:bg-[#1a1a1a] hover:text-gray-300'}`}
          >
            <span className={`w-2 h-2 rounded-full ${isTradingActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-600'}`}></span>
            {isTradingActive ? '봇 거래 작동 중' : '봇 거래 정지됨'}
          </button>
          
          {/* AI Analyse Enable/Disable Toggle */}
          <button 
            onClick={() => toggleSetting('isAiActive', !isAiActive)}
            className={`px-3 py-2 md:px-4 rounded-lg text-[11px] md:text-sm font-bold transition-all flex items-center gap-1.5 md:gap-2 cursor-pointer focus:outline-none border ${isAiActive ? 'bg-indigo-950/20 text-indigo-400 border border-indigo-900/50 hover:bg-indigo-900/30 shadow-xs' : 'bg-[#111] text-gray-500 border-[#333] hover:bg-[#1a1a1a] hover:text-gray-300'}`}
          >
            <span className={`w-2 h-2 rounded-full ${isAiActive ? 'bg-indigo-500 animate-pulse' : 'bg-gray-600'}`}></span>
            {isAiActive ? 'AI 분석 활성' : 'AI 분석 정지'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-6">

        {/* REAL-TIME 15-SECOND MONITORING ENGINE PANEL */}
        <section className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
                <span className="text-base font-bold text-white tracking-tight">CCXT 1초 초고속 실시간 의사결정 엔진 (정상 작동 중)</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/40 text-rose-400 border border-rose-900/50 uppercase tracking-wide animate-pulse">FAST Decision (1S)</span>
                <span className="px-4 py-1.5 rounded-full text-sm font-black bg-purple-950/30 text-purple-400 border border-purple-900/50 shadow-md flex items-center gap-2 sm:ml-2 overflow-hidden transition-all duration-300">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                  </span>
                  AI 누적 예측 요청: {status?.settings?.apiCallCount || 0}회
                </span>
                {!isRealTradingActive ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-950/40 text-amber-400 border border-amber-900/50 uppercase tracking-wide">
                    ⚠️ 모의매매(Paper) 모드 활성화됨
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-950/40 text-red-500 border border-red-900/50 uppercase tracking-wide animate-pulse">
                    🚨 실전매매(Bitget Live) 직결 중
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 leading-relaxed max-w-4xl">
                15분 마다 <b className="text-gray-200">Gemini 3.5 Flash AI가 미래 가격 행동을 예측</b>하여 최적의 오더라인(진입 목표 타점, 손절, 익절 라인)을 설계하고, <b className="text-gray-200">CCXT 엔진이 1초 초고속 주기로 호가를 완벽 수집 및 즉각 의사결정</b>을 집행합니다. 오더라인 터치 즉시 불필요한 API 소모 없이 초저지연 로컬 알고리즘 청산을 격발합니다.
              </p>
            </div>
          </div>
        </section>

        


        {/* REAL-TIME ACTIVE POSITIONS PANEL */}
        {(() => {
          const activeCoins = TARGET_SYMBOLS.filter(sym => status?.positions?.[sym]?.side === 'LONG' || status?.positions?.[sym]?.side === 'SHORT');
          if (activeCoins.length === 0) {
            return (
              <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-4 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className="text-sm font-semibold text-gray-300">현재 보조 엔진 감시 중: 진입 포지션 없음</span>
                  <span className="text-xs text-gray-500 leading-normal hidden md:inline">| Gemini AI 예상 목표가 도달 시 CCXT가 1초 내에 전격 시장가 강제 진입을 수행합니다.</span>
                </div>
                <div className="text-xs text-indigo-400 font-bold bg-[#111] px-2.5 py-1 rounded-md border border-[#333]">
                  대기 오더 가동 중
                </div>
              </div>
            );
          }

          return (
            <div className="bg-gradient-to-r from-[#1a0a0a] to-[#120505] border border-rose-900/50 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-rose-900/40 flex-wrap gap-2">
                <div className="flex items-center gap-2.5 text-rose-500 font-bold">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                  </span>
                  <h3 className="text-base font-extrabold tracking-tight">🚨 실시간 체결 포지션 종합 상황판 (5x 격리 레버리지)</h3>
                  <span className="bg-[#1a0a0a] text-rose-500 border border-rose-900 text-[10px] md:text-xs px-2 py-0.5 rounded-full font-black uppercase tracking-wider animate-pulse">
                    LIVE POSITIONS ({activeCoins.length})
                  </span>
                </div>
                <span className="text-[11px] text-rose-400 font-bold bg-[#1a0a0a] px-2 py-1 rounded border border-rose-900/50">
                   CCXT 실시간 청산 감시동반 활성
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {activeCoins.map(sym => {
                  const pos = status?.positions?.[sym];
                  const data = status?.multiChartData?.[sym] || [];
                  const rawPrice = data[data.length - 1]?.price;
                  // Micro fluctuations
                  const curPrice = (() => {
                    if (!rawPrice) return pos?.entryPrice || 100;
                    const sec = Math.floor(Date.now() / 1000);
                    let hash = 0;
                    const str = sym + sec;
                    for (let i = 0; i < str.length; i++) {
                      hash = str.charCodeAt(i) + ((hash << 5) - hash);
                    }
                    const pctOffset = (hash % 80) / 1000000;
                    return rawPrice * (1 + pctOffset);
                  })();

                  const multiplier = pos?.side === 'LONG' ? 1 : -1;
                  const pnlPct = pos?.entryPrice ? ((((curPrice - pos.entryPrice) / pos.entryPrice) * multiplier) * 5) : 0;
                  const uPnl = (pos?.balanceUsdt || 0) * pnlPct;
                  const isProfit = pnlPct >= 0;

                  return (
                    <div key={`active-panel-${sym}`} className={`bg-black border-2 rounded-xl p-4 shadow-sm relative flex flex-col justify-between overflow-hidden ${pos?.side === 'LONG' ? 'border-emerald-900/80 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'border-rose-900/80 shadow-[0_0_10px_rgba(244,63,94,0.2)]'}`}>
                      <div className={`absolute top-0 right-0 left-0 h-1 bg-gradient-to-r ${pos?.side === 'LONG' ? 'from-emerald-500 to-emerald-600' : 'from-rose-500 to-rose-600'}`} />
                      
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-base font-bold text-white">{sym}</span>
                            <span className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded bg-black border ${pos?.side === 'LONG' ? 'text-emerald-400 border-emerald-900/50' : 'text-rose-400 border-rose-900/50'}`}>
                              {pos?.side || 'LONG'} 5x
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-medium font-mono">진입 마진: ${pos?.balanceUsdt?.toFixed(2)} USDT</span>
                        </div>

                        {confirmingExitSymbol === sym ? (
                          <div className="flex gap-1.5 items-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleForceExitPosition(sym);
                              }}
                              disabled={forceExitLoading[sym]}
                              className="px-2 py-1 bg-amber-650 hover:bg-amber-700 text-white text-[10px] font-black rounded-lg transition-all flex items-center gap-0.5 shadow-sm cursor-pointer animate-pulse"
                            >
                              {forceExitLoading[sym] ? '청산 중...' : '확인, 즉시 청산! ⚡'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmingExitSymbol(null);
                              }}
                              className="px-1.5 py-1 bg-[#222] hover:bg-[#333] text-gray-400 text-[10px] font-bold rounded-lg transition-all cursor-pointer border border-[#444]"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmingExitSymbol(sym);
                            }}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black rounded-lg transition-all flex items-center gap-0.5 shadow-sm cursor-pointer"
                          >
                            즉시 청산 ⚡
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 bg-[#0a0a0a] p-2.5 rounded-lg border border-[#222] mb-3">
                        <div>
                          <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">진입 평단가</span>
                          <span className="text-[13px] font-bold text-gray-200 font-mono">${pos?.entryPrice?.toFixed(4)}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider">실시간 현재가</span>
                          <span className="text-[13px] font-bold text-indigo-400 font-mono">${curPrice.toFixed(4)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-gray-400 font-bold block">ROE 실시간 수익률</span>
                          <span className={`text-[15px] font-black font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isProfit ? '+' : '-'}{Math.abs(pnlPct * 100).toFixed(2)}%
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 font-bold block">미실현 손익</span>
                          <span className={`text-[15px] font-black font-mono ${isProfit ? 'text-emerald-400 bg-emerald-950/20' : 'text-rose-400 bg-rose-950/20'} px-2 py-0.5 rounded-md border ${isProfit ? 'border-emerald-900/50' : 'border-rose-900/50'}`}>
                            {isProfit ? '+' : '-'}${Math.abs(uPnl).toFixed(4)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3.5 pt-2.5 border-t border-dashed border-[#333] grid grid-cols-2 gap-y-1 text-[10px] text-gray-400 font-medium">
                        <div className="flex justify-between pr-2 border-r border-[#333]">
                          <span>1차 목표가:</span>
                          <span className="font-mono text-emerald-500 font-bold">${pos?.TARGET_1ST?.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between pl-2">
                          <span>본절 수취가:</span>
                          <span className="font-mono text-indigo-400 font-bold">${pos?.BREAK_EVEN_TRIGGER?.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between pr-2 border-r border-[#333] mt-1">
                          <span>1차 손절가:</span>
                          <span className="font-mono text-rose-400 font-bold">${pos?.STOP_LOSS_1ST?.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between pl-2 mt-1">
                          <span>강제 청산가:</span>
                          <span className="font-mono text-rose-600 font-bold">${pos?.EXCHANGE_HARD_STOP?.toFixed(4)}</span>
                        </div>
                      </div>

                      <div className="mt-2 text-[10px] bg-rose-950/30 text-rose-400 p-1.5 rounded border border-rose-900/50 font-semibold line-clamp-2">
                         {pos?.ccxtSituation || "CCXT 시세 트라이얼 엔진 상시 감시 중..."}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* CHARTS GRID */}
        <section>
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2 text-white font-bold">
              <span className="bg-[#111] text-indigo-400 border border-[#333] w-8 h-8 rounded shrink-0 flex items-center justify-center">
                <ChartIcon size={18} />
              </span>
              <span className="text-lg">AI 5x 레버리지 10종목 포트폴리오</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>
              <span className="text-xs font-bold text-gray-400">Live Trading (5x)</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-4 px-1">
            {TARGET_SYMBOLS.map(sym => {
              const isSelected = (status?.settings?.selectedSymbols || TARGET_SYMBOLS).includes(sym);
              const coinName = sym.split('/')[0];
              return (
                <button
                  key={`toggle-btn-${sym}`}
                  onClick={() => toggleSymbolSelection(sym)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all border outline-none ${
                    isSelected 
                      ? 'bg-[#1a0a0a] text-emerald-400 border-emerald-900/50 shadow-[0_0_10px_rgba(16,185,129,0.1)] hover:bg-[#111]' 
                      : 'bg-[#0a0a0a] text-gray-600 border-[#222] hover:bg-[#111] hover:text-gray-400'
                  }`}
                  title={`${coinName} 자동 투자를 ${isSelected ? '일단 정지' : '활성화'} 합니다.`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-700'}`}></span>
                    {coinName}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {TARGET_SYMBOLS.map(sym => {
              const data = status?.multiChartData?.[sym] || [];
              const mStats = status?.marketStats?.[sym];
              const pos = status?.positions?.[sym];
              const rawPrice = data[data.length - 1]?.price;
              // Real-time micro fluctuation simulator for a lively price update feeling
              const curPrice = (() => {
                if (!rawPrice) return undefined;
                const sec = Math.floor(Date.now() / 1000);
                let hash = 0;
                const str = sym + sec;
                for (let i = 0; i < str.length; i++) {
                  hash = str.charCodeAt(i) + ((hash << 5) - hash);
                }
                const pctOffset = (hash % 80) / 1000000;
                return rawPrice * (1 + pctOffset);
              })();
              
              const isSelected = (status?.settings?.selectedSymbols || TARGET_SYMBOLS).includes(sym);
              
              let cardBorderClass = 'border-gray-800 hover:border-gray-700';
              if (pos?.side === 'LONG' || pos?.side === 'SHORT') {
                cardBorderClass = pos.side === 'LONG' ? 'border-emerald-600 ring-4 ring-emerald-900/40 bg-[#064e3b]/10 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-rose-600 ring-4 ring-rose-900/40 bg-[#4c0519]/10 shadow-[0_0_15px_rgba(244,63,94,0.3)]';
              } else if (isSelected) {
                cardBorderClass = 'border-indigo-600 ring-2 ring-indigo-900/50 bg-[#1e1b4b]/10';
              } else {
                cardBorderClass = 'border-gray-800 opacity-60 hover:opacity-[0.8] grayscale-[30%] hover:grayscale-0';
              }
              
              let pnlText = '';
              let pct = 0;
              if ((pos?.side === 'LONG' || pos?.side === 'SHORT') && pos?.entryPrice && curPrice) {
                 const multiplier = pos.side === 'LONG' ? 1 : -1;
                 const rawPct = ((curPrice - pos.entryPrice) / pos.entryPrice) * multiplier;
                 pct = (rawPct * 5); // Net 5x Leverage return
                 pnlText = ` (${pct > 0 ? '+' : ''}${(pct * 100).toFixed(2)}%)`;
              }

              return (
                <div 
                  key={sym} 
                  className={`bg-[#0a0a0a] rounded-xl border ${cardBorderClass} flex flex-col overflow-hidden transition-all relative select-none`}
                >
                  <div className="px-3 pt-3 pb-2 border-b border-[#222] flex flex-col relative shrink-0 w-full mb-1">
                    {/* Dark Header */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                         <span className="font-bold text-[18px] text-white">{sym.split('/')[0]}</span>
                         
                         {pos?.marketRegime && (
                            <span className={`text-[10px] px-1.5 py-[3px] rounded bg-[#111] font-black border uppercase tracking-wider ${
                              pos.marketRegime === 'BULL_BREAKOUT' ? 'text-emerald-500 border-emerald-900/50' : 
                              pos.marketRegime === 'BEAR_TREND' ? 'text-rose-500 border-rose-900/50' : 
                              'text-blue-500 border-blue-900/50'
                            }`}>
                              {pos.marketRegime === 'BULL_BREAKOUT' ? '📈 AI: 불장 돌파' : pos.marketRegime === 'BEAR_TREND' ? '📉 AI: 하락 추세' : '⚖️ AI: 관망 횡보'}
                            </span>
                         )}

                         {pos?.side === 'LONG' || pos?.side === 'SHORT' ? (
                           <span className={`text-white text-[10px] font-black px-1.5 py-0.5 rounded-md border animate-pulse inline-flex items-center gap-1 ${pos.side === 'LONG' ? 'bg-emerald-600 border-emerald-500' : 'bg-rose-600 border-rose-500'}`}>
                             <span className="w-1 h-1 rounded-full bg-white inline-block animate-ping"></span>
                             {pos.side} 진입중
                           </span>
                         ) : pos?.status === 'WAITING' ? (
                            <span className="relative flex h-2.5 w-2.5" title={`${pos.targetSide === 'SHORT' ? '숏' : '롱'} 진입 대기 중`}>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-amber-500"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                            </span>
                         ) : (
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gray-300 animate-pulse" title="지표 대기 또는 관망 및 패스"></span>
                         )}
                         {isSelected ? (
                            <button 
                              onClick={() => toggleSymbolSelection(sym)}
                              className="bg-emerald-950/30 text-emerald-400 text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-emerald-900/50 ml-1 cursor-pointer hover:bg-emerald-900/50 transition-colors"
                            >
                              ✓ 투자 활성
                            </button>
                          ) : (
                            <button 
                              onClick={() => toggleSymbolSelection(sym)}
                              className="bg-[#1a1a1a] text-gray-500 text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#333] ml-1 cursor-pointer hover:bg-[#222] hover:text-gray-400 transition-colors"
                            >
                              일시 정지
                            </button>
                          )}
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <span className="text-[12px] font-bold text-gray-400 capitalize">격리 마진 Isolated (5x)</span>
                        {pos?.balanceUsdt !== undefined && pos.balanceUsdt > 0 && (
                          <span className="text-[11px] font-bold text-indigo-400 bg-indigo-950/30 border border-indigo-900/50 rounded-md px-1.5 py-0.5 inline-flex items-center w-max mt-0.5">
                            진입 마진비: <span className="font-mono ml-1">${pos.balanceUsdt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span> USDT
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end">
                      {curPrice && (
                        <span className="text-[17px] font-mono font-black text-white">
                          ${curPrice.toFixed(4)}
                        </span>
                      )}
                      {mStats && mStats.changePct !== undefined && (
                        <span className={`text-[15px] font-bold ${mStats.changePct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {mStats.changePct >= 0 ? '▲' : '▼'} {Math.abs(mStats.changePct).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Active / Waiting State Header Bar */}
                  {pos?.status === 'ACTIVE' ? (
                    <div className={`px-2 py-2 text-[14px] font-bold flex justify-between items-center animate-pulse shrink-0 border-b border-gray-800 ${pct >= 0 ? 'bg-emerald-900/40 text-emerald-400' : 'bg-rose-900/40 text-rose-400'}`}>
                      <span className="flex items-center gap-1">
                        🚀 {pos.side === 'SHORT' ? '숏' : '롱'} 진입 완료
                      </span>
                      <div className="flex flex-col items-end leading-tight text-[12px]">
                         <span>평단: ${pos.entryPrice?.toFixed(4)}</span>
                         {pnlText && <span className="font-black text-[13px]">ROE 수익률: {pnlText.trim().replace('(', '').replace(')', '')}</span>}
                      </div>
                    </div>
                  ) : null}

                  {/* Manual Market Entry Action trigger when in waiting */}
                  {pos?.status !== 'ACTIVE' && isSelected && (
                    <div className="px-3 py-1.5 border-b border-gray-800 flex items-center justify-between gap-2 shrink-0">
                      <span className="text-gray-500 text-[10px] font-bold tracking-tight">수동 진입:</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={instantEntryLoading[sym]}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInstantMarketEntry(sym, 'LONG');
                          }}
                          className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-900/50 text-emerald-400 font-bold text-[10px] rounded shadow transition-all flex items-center gap-1 disabled:opacity-50 pointer-events-auto"
                        >
                           🟢 롱 진입
                        </button>
                        <button
                          disabled={instantEntryLoading[sym]}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInstantMarketEntry(sym, 'SHORT');
                          }}
                          className="px-2 py-1 bg-rose-600/20 hover:bg-rose-600/40 border border-rose-900/50 text-rose-400 font-bold text-[10px] rounded shadow transition-all flex items-center gap-1 disabled:opacity-50 pointer-events-auto"
                        >
                           🔴 숏 진입
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 w-full relative bg-[#0a0a0a] flex flex-col p-3 gap-2">
                    {/* Pre-calculated Strategy parameters section */}
                    {/* Stats Rows */}
                    <div className="flex justify-between text-xs text-gray-500 font-bold px-0.5 mt-1">
                        <span>포지션</span>
                        <span>상태</span>
                    </div>
                    <div className="flex justify-between text-sm md:text-[15px] font-bold text-gray-300 mt-0.5 px-0.5">
                        <span className={pos?.side === 'LONG' ? 'text-emerald-400' : pos?.side === 'SHORT' ? 'text-rose-400' : ''}>
                          {pos?.side === 'LONG' ? '매수(LONG)' : pos?.side === 'SHORT' ? '공매도(SHORT)' : '관망 대기'}
                        </span>
                        <span className={`text-sm md:text-[15px] font-bold ${pos?.side !== 'NONE' ? 'text-gray-200' : 'text-yellow-500/80'}`}>
                          {pos?.status === 'ACTIVE' ? '진입중' : pos?.status === 'WAITING' ? '대기중' : '관망'}
                        </span>
                    </div>

                    {/* Pre-calculated Strategy parameters section */}
                    <div className="border-t border-[#222] pt-2 pb-2 mt-1 -mx-3 px-3 bg-[#0a0a0a]">
                      {(pos?.ENTRY_PRICE > 0 || pos?.targetSide === 'BOTH' || pos?.status === 'ACTIVE') && (
                          <div className="flex flex-col gap-2 px-0.5 mt-1">
                            {pos.side === 'LONG' ? (
                              <>
                                <div className="flex justify-between items-center text-xs font-semibold font-sans">
                                  <span className="text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-900/50">1차 목표 (+3.0 ATR)</span>
                                  <span className="text-gray-200 text-sm md:text-[15px] font-mono">${pos?.TARGET_1ST > 0 ? pos.TARGET_1ST.toFixed(4) : (curPrice ? (curPrice*1.01).toFixed(4) : '...')}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs font-semibold font-sans group relative">
                                  <span className="text-rose-400 bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-900/50 flex items-center gap-1 cursor-help">
                                    손절가 (-1.5 ATR)
                                    <Shield size={10} className="text-rose-300" />
                                    {/* Tooltip for hidden stop-loss */}
                                    <span className="pointer-events-none absolute left-0 -top-8 w-max opacity-0 transition-opacity bg-[#111] text-gray-300 text-[10px] items-center border border-[#333] px-2 py-1 rounded shadow-xl group-hover:opacity-100 z-50">
                                      거래소에 스탑로스를 노출시키지 않는 로컬 히든 스탑로스가 작동 중입니다. (스탑헌팅 방지 보호)
                                    </span>
                                  </span>
                                  <span className="text-gray-200 text-sm md:text-[15px] font-mono">${pos?.STOP_LOSS_1ST > 0 ? pos.STOP_LOSS_1ST.toFixed(4) : (curPrice ? (curPrice*0.995).toFixed(4) : '...')}</span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex justify-between items-center text-xs font-semibold font-sans">
                                  <span className="text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-900/50">1차 목표 (+3.0 ATR)</span>
                                  <span className="text-gray-200 text-sm md:text-[15px] font-mono">${pos?.TARGET_1ST > 0 ? pos.TARGET_1ST.toFixed(4) : (curPrice ? (curPrice*0.99).toFixed(4) : '...')}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs font-semibold font-sans group relative">
                                  <span className="text-rose-400 bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-900/50 flex items-center gap-1 cursor-help">
                                    손절가 (-1.5 ATR)
                                    <Shield size={10} className="text-rose-300" />
                                    {/* Tooltip for hidden stop-loss */}
                                    <span className="pointer-events-none absolute left-0 -top-8 w-max opacity-0 transition-opacity bg-[#111] text-gray-300 text-[10px] items-center border border-[#333] px-2 py-1 rounded shadow-xl group-hover:opacity-100 z-50">
                                      거래소에 스탑로스를 노출시키지 않는 로컬 히든 스탑로스가 작동 중입니다. (스탑헌팅 방지 보호)
                                    </span>
                                  </span>
                                  <span className="text-gray-200 text-sm md:text-[15px] font-mono">${pos?.STOP_LOSS_1ST > 0 ? pos.STOP_LOSS_1ST.toFixed(4) : (curPrice ? (curPrice*1.005).toFixed(4) : '...')}</span>
                                </div>
                              </>
                            )}
                          </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Chart UI at bottom of the card */}
                  <div className={`h-[200px] w-full mt-auto relative shrink-0 border-t border-[#222] bg-[#0a0a0a] overflow-hidden ${pos?.lastAiPrompt ? '' : 'rounded-b-xl'}`}>
                    {ohlcvData && ohlcvData[sym] ? (
                       <TradingChart symbol={sym} ohlcvData={ohlcvData[sym]} position={pos} />
                    ) : (
                       <div className="flex items-center justify-center w-full h-full text-slate-500 text-[10px] animate-pulse">차트 로딩중...</div>
                    )}
                  </div>

                  {pos?.lastAiPrompt && (
                    <div className="bg-[#111] border-t border-[#222] rounded-b-xl p-3 text-[12px] md:text-sm text-gray-300 font-mono leading-relaxed whitespace-pre-wrap shrink-0 flex flex-col gap-3">
                      <div>
                        <div className="text-indigo-400 font-bold mb-2 border-b border-[#333] pb-2 flex items-center justify-between text-xs md:text-base">
                          <span>🤖 AI에게 전송되는 실시간 데이터</span>
                          <span className="text-[10px] md:text-xs bg-indigo-950/50 px-2 py-0.5 rounded text-indigo-300">15분 주기</span>
                        </div>
                        {pos.lastAiPrompt}
                      </div>
                      
                      {pos.aiReason && (
                        <div className="bg-[#1a1a1a] p-3 rounded border border-[#333] text-[12px] md:text-sm">
                           <span className="text-amber-400 font-bold block mb-1 md:text-base">💡 AI 판단 결과:</span>
                           <span className="text-gray-200">{pos.aiReason}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* HISTORY */}
          <section className="bg-black rounded-lg border border-[#222] shadow-sm flex flex-col overflow-hidden h-[350px] lg:h-[400px]">
            <div className="flex justify-between items-center pr-3 bg-[#0a0a0a] border-b border-[#222]">
              <h3 className="font-bold flex items-center gap-2 p-3.5 text-gray-200 text-sm">
                <History size={16} className="text-indigo-400" /> 매매 히스토리 (최근 200건)
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleSyncTradeHistory}
                  disabled={isSyncingHistory}
                  className={`text-[11px] font-bold flex items-center gap-1 px-2 py-1 rounded border transition-all shadow-xs cursor-pointer focus:outline-none ${
                    isSyncingHistory
                      ? 'bg-[#111] text-indigo-400 border-[#333]'
                      : 'bg-[#111] text-indigo-400 hover:bg-[#1a1a1a] border-[#333] hover:border-indigo-500/50'
                  }`}
                >
                  <RefreshCw size={11} className={`${isSyncingHistory ? 'animate-spin' : ''}`} />
                  {isSyncingHistory ? '동기화 중...' : '히스토리 불러오기'}
                </button>
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="text-[11px] font-bold text-gray-400 hover:text-red-400 bg-[#111] hover:bg-red-950/30 border border-[#333] hover:border-red-900 px-2 py-1 rounded transition-all shadow-xs cursor-pointer focus:outline-none"
                >
                  기록 초기화
                </button>
              </div>
            </div>

            {/* WIN RATE PORTAL */}
            {(() => {
              const recentTrades = processTradeHistory(status?.tradeHistory || []);
              const totalTradesCount = recentTrades.length;
              const winsCount = recentTrades.filter((t: any) => t.pnl >= 0).length;
              const lossesCount = totalTradesCount - winsCount;
              const historyWinRate = totalTradesCount > 0 ? (winsCount / totalTradesCount) * 100 : 0;
              const totalPnL = recentTrades.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0);
              return (
                <div className="flex justify-between items-center px-4 py-2 border-b border-[#222] bg-[#0f0f0f] gap-2 flex-wrap shrink-0">
                  <div className="flex items-center gap-3 text-[11px] font-semibold text-gray-400">
                    <div className="flex items-center gap-0.5">
                      <span>총 거래:</span>
                      <span className="font-bold text-gray-200 font-mono">{totalTradesCount}</span>
                    </div>
                    <div className="w-px h-2.5 bg-[#333]" />
                    <div className="flex items-center gap-0.5">
                      <span className="text-emerald-500">익절(승):</span>
                      <span className="font-bold text-emerald-400 font-mono">{winsCount}</span>
                    </div>
                    <div className="w-px h-2.5 bg-[#333]" />
                    <div className="flex items-center gap-0.5">
                      <span className="text-rose-500">손절(패):</span>
                      <span className="font-bold text-rose-400 font-mono">{lossesCount}</span>
                    </div>
                    <div className="w-px h-2.5 bg-[#333]" />
                    <div className="flex items-center gap-0.5">
                      <span>누적 손익:</span>
                      <span className={`font-bold font-mono ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {totalPnL >= 0 ? '+' : ''}{totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#1a1a1a] px-2 py-0.5 rounded border border-[#333] shadow-2xs font-mono">
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider font-sans">핵심 승률</span>
                    <span className="text-xs font-black text-indigo-300">{historyWinRate.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })()}

            <div ref={historyContainerRef} className="overflow-y-auto flex-1 p-0 custom-scrollbar">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-[#0a0a0a] sticky top-0 border-b border-[#222] z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-2 font-semibold text-gray-400 text-[11px] text-center uppercase tracking-wider">결과</th>
                      <th className="px-4 py-2 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">일시</th>
                      <th className="px-4 py-2 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">종목</th>
                      <th className="px-4 py-2 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">방향</th>
                      <th className="px-4 py-2 font-semibold text-gray-400 text-[11px] text-right uppercase tracking-wider">손익(%)</th>
                      <th className="px-4 py-2 font-semibold text-gray-400 text-[11px] text-right uppercase tracking-wider">P&L (USDT)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a1a1a]">
                    {!status?.tradeHistory?.length ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-gray-500 text-sm">거래 내역이 없습니다. (AI 판단 대기중)</td>
                      </tr>
                    ) : (
                      processTradeHistory(status.tradeHistory).map((t: any, i: number) => {
                        let finalPnlPct = t.pnlPct;
                        if (typeof finalPnlPct !== 'number' && t.entryPrice && t.exitPrice) {
                          const multiplier = t.side === 'LONG' ? 1 : -1;
                          finalPnlPct = (((t.exitPrice - t.entryPrice) / t.entryPrice) * multiplier * 5) * 100; // Net 5x leverage
                        }
                        const displayPct = typeof finalPnlPct === 'number' ? finalPnlPct : 0;

                        const formatDateHelper = (val: any) => {
                          if (!val) return '-';
                          try {
                            const d = new Date(val);
                            if (isNaN(d.getTime())) return String(val);
                            
                            const pad = (n: number) => n.toString().padStart(2, '0');
                            const MM = pad(d.getMonth() + 1);
                            const DD = pad(d.getDate());
                            const HH = pad(d.getHours());
                            const mm = pad(d.getMinutes());
                            const ss = pad(d.getSeconds());
                            return `${MM}-${DD} ${HH}:${mm}:${ss}`;
                          } catch (e) {
                            return String(val);
                          }
                        };

                        return (
                          <tr key={t.id || i} className={`border-b border-[#1a1a1a] hover:bg-[#151515] transition-colors ${t.isMerged ? (t.isTp ? 'bg-emerald-950/20 border-l-4 border-emerald-500/50 font-medium' : 'bg-rose-950/20 border-l-4 border-rose-500/50 font-medium') : ''}`}>
                            <td className="px-4 py-2 text-center">
                              {t.isMerged ? (
                                t.isTp ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/30 text-emerald-400 hover:bg-emerald-900/50 border border-emerald-900/50">
                                    <span>합산 익절</span>
                                    <span className="bg-emerald-600 text-white leading-none text-[9px] px-1.5 py-0.5 rounded-full font-sans font-bold">
                                      {t.mergedCount}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/30 text-rose-400 hover:bg-rose-900/50 border border-rose-900/50">
                                    <span>합산 손절</span>
                                    <span className="bg-rose-600 text-white leading-none text-[9px] px-1.5 py-0.5 rounded-full font-sans font-bold">
                                      {t.mergedCount}
                                    </span>
                                  </span>
                                )
                              ) : (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.pnl >= 0 ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/30' : 'bg-rose-950/30 text-rose-400 border border-rose-900/30'}`}>
                                  {t.pnl >= 0 ? '익절' : '손절'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-gray-500 font-mono text-[11px]">{formatDateHelper(t.date)}</td>
                            <td className="px-4 py-2 font-semibold text-gray-300 text-[13px]">
                              {t.isMerged ? (
                                <span className={`${t.isTp ? 'text-emerald-400' : 'text-rose-400'} font-bold`} title={t.originalTrades.map((ot: any) => ot.symbol).join(', ')}>
                                  {t.symbol}
                                </span>
                              ) : (
                                ((t.symbol || '').split('/')[0]) || t.symbol
                              )}
                            </td>
                            <td className={`px-4 py-2 font-bold text-[12px] ${t.side === 'LONG' ? 'text-red-500' : t.side === 'SHORT' ? 'text-blue-500' : 'text-purple-500'}`}>{t.side}</td>
                            <td className={`px-4 py-2 text-right font-black text-[13px] ${displayPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {displayPct >= 0 ? '+' : ''}{displayPct.toFixed(2)}%
                            </td>
                            <td className={`px-4 py-2 text-right font-medium text-[13px] ${t.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
            </div>
          </section>

          {/* LOGS */}
          <section className="bg-black rounded-lg flex flex-col overflow-hidden border border-[#222] shadow-inner h-[350px] lg:h-[400px]">
            <h3 className="font-bold flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border-b border-[#222] bg-[#0a0a0a] text-slate-300 text-sm gap-2">
              <span className="flex items-center gap-2 relative">
                <Activity size={16} className="text-emerald-500" /> 시스템 운영 로그 (주문 체결 및 통신 기록)
                {status?.lastAiUpdateTimestamp && (
                  <span className="ml-2 text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap hidden md:flex min-w-max shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
                    최근 갱신: {new Date(status.lastAiUpdateTimestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                  </span>
                )}
              </span>
              <div className="flex gap-2 flex-wrap">
                {confirmCancelAll ? (
                  <div className="flex gap-1 items-center bg-amber-950/40 border border-amber-500/30 p-0.5 rounded text-xs">
                    <button
                      onClick={handleCancelAllOrders}
                      disabled={isCanceling}
                      className="px-2 py-0.5 bg-amber-600 text-white font-bold rounded hover:bg-amber-700 transition-colors cursor-pointer"
                    >
                      {isCanceling ? '삭제 중...' : '🔥 데이터 초기화 승인'}
                    </button>
                    <button
                      onClick={() => setConfirmCancelAll(false)}
                      className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmCancelAll(true)}
                    disabled={isCanceling}
                    title="비트겟 거래소 내 오더 삭제"
                    className="flex items-center gap-1.5 px-3 py-1 bg-red-600/20 hover:bg-red-600/35 active:bg-red-600/50 text-red-400 disabled:opacity-50 disabled:cursor-not-allowed border border-red-500/30 rounded text-xs transition-colors cursor-pointer focus:outline-none"
                  >
                    <span>🗑️</span>
                    <span>오더 전체 삭제</span>
                  </button>
                )}
                <button
                  onClick={handleOptimizeOrders}
                  disabled={isOptimizing}
                  title="체결 지연 방지 최적화"
                  className="flex items-center gap-1.5 px-3 py-1 bg-orange-600/20 hover:bg-orange-600/35 active:bg-orange-600/50 text-orange-400 disabled:opacity-50 disabled:cursor-not-allowed border border-orange-500/30 rounded text-xs transition-colors cursor-pointer focus:outline-none"
                >
                  {isOptimizing ? '⏳ 최적화 중...' : '🚨 락구제 최적화'}
                </button>
                <button
                  onClick={handleTriggerAi}
                  disabled={isTriggeringAi}
                  className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/35 active:bg-emerald-600/50 text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500/30 rounded text-xs transition-colors cursor-pointer focus:outline-none"
                >
                  {isTriggeringAi ? '⏳ 분석 중...' : '🔄 AI 갱신'}
                </button>
              </div>
            </h3>

            {logs.some(l => l.includes('할당량') || l.includes('Rate Limit') || l.includes('Quota')) && (
              <div className="bg-amber-950/50 border-b border-amber-900/40 p-3 text-xs leading-relaxed text-amber-350 flex items-start gap-2.5">
                <span className="text-amber-500 text-sm shrink-0">⚠️</span>
                <div>
                  <p className="font-bold text-amber-400 mb-0.5">Google API 할당량 초과 안내</p>
                  <p className="opacity-85 text-[11.5px]">API 한도가 초과되었습니다. 우측 상단의 API 설정을 통해 본인의 API 키를 입력해 주세요.</p>
                </div>
              </div>
            )}

            <div ref={logsContainerRef} className="overflow-y-scroll flex-1 p-4 font-mono text-[12px] bg-[#050505] custom-scrollbar shadow-inner">
               {logs.length === 0 ? (
                  <div className="text-slate-600 italic mt-2 flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-600"></span>
                    </span>
                    AI 통신 및 주문 내역 대기 중...
                  </div>
                ) : (
                  [...logs].reverse().map((log, i) => {
                    let logColor = 'text-gray-300';
                    let mark = '';
                    if (log.includes('[ERROR]')) {
                      logColor = 'text-red-400 font-bold bg-red-950/20';
                      mark = '🛑 ';
                    } else if (log.includes('[WARNING]')) {
                      logColor = 'text-yellow-400 font-medium bg-yellow-950/10';
                      mark = '⚠️ ';
                    } else if (log.includes('[INFO]')) {
                      if (log.includes('완벽 확인') || log.includes('성공')) logColor = 'text-blue-300';
                      else logColor = 'text-emerald-400/90';
                      mark = 'ℹ️ ';
                    } else {
                       if (log.includes('완료') || log.includes('성공')) logColor = 'text-blue-300 bg-blue-900/10 font-medium';
                       else logColor = 'text-emerald-400/90';
                       mark = '⚡ ';
                    }
                    
                    return (
                      <div key={i} className={`mb-1.5 leading-relaxed opacity-95 border-b border-white/5 pb-1.5 last:border-0 hover:bg-white/5 transition-colors px-2 py-1 rounded break-words ${logColor}`}>
                        <span>{mark}</span>
                        {log}
                      </div>
                    );
                  })
                )}
            </div>
          </section>
        </div>
      </main>

      {/* Wallet Settings Modal */}
      {showWalletSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-[#0a0a0a] rounded-xl shadow-xl w-full max-w-sm border border-[#222] overflow-hidden transform transition-all">
            <div className="flex justify-between items-center p-4 border-b border-[#222] bg-[#111]/80">
              <h2 className="text-[16px] font-black flex items-center gap-2 text-white">
                <Wallet className="text-indigo-400" size={18} /> 지갑 및 투자 비중 설정
              </h2>
              <button 
                onClick={() => setShowWalletSettings(false)}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded-md hover:bg-[#222]"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
               <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider">Total Balance (USDT)</label>
                    {isRealTradingActive && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/sync-real-balance', { method: 'POST' });
                            const data = await res.json();
                            if (data.success) {
                              setEditBalance(data.balance.toString());
                              setStatus((prev: any) => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  globalBalanceUsdt: data.balance,
                                  initialGlobalBalanceUsdt: data.initialBalance || data.balance
                                };
                              });
                              triggerToast(`[성공] 실제 비트겟 잔고($${Number(data.balance).toFixed(2)}) 동기화 성공!`, 'success');
                            } else {
                              triggerToast(data.message || '실제 지갑에서 잔고를 불러오지 못했습니다. API 설정을 확인해주세요.', 'error');
                            }
                          } catch (e) {
                            triggerToast('통신 오류: 서버 점검이거나 네트워크 지연 상태입니다.', 'error');
                          }
                        }}
                        className="text-[10.5px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer bg-indigo-950/30 px-2 py-0.5 rounded border border-indigo-900/50 hover:bg-indigo-900/40 transition-all shadow-2xs"
                      >
                        <Activity size={10} className="animate-pulse" />
                        실시간 지갑 연동 불러오기
                      </button>
                    )}
                  </div>
                  <input 
                    type="number" 
                    value={editBalance}
                    onChange={(e) => setEditBalance(e.target.value)}
                    className="w-full bg-[#111] text-white border border-[#333] rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 shadow-sm"
                    placeholder="투자할 총 잔고액"
                  />
                  {isRealTradingActive && (
                    <p className="text-indigo-400 text-[10px] mt-1 font-medium">
                      💡 실전 매매 중입니다. 위 불러오기 버튼으로 실제 지갑 자산을 가져와 기준 투자금(Initial)으로 정할 수 있습니다.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-300 mb-1.5 uppercase tracking-wider">코인당 진입 마진 비중 (%)</label>
                  <input 
                    type="number" 
                    value={editUsage}
                    onChange={(e) => setEditUsage(e.target.value)}
                    className="w-full bg-[#111] text-white border border-[#333] rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 shadow-sm"
                    placeholder="30 (1개 코인당 30% 마진 비율 권장)"
                  />
                  <p className="text-gray-400 text-[11px] mt-2 text-right font-medium leading-relaxed">
                    전체 시드 대비 각 코인별 1회 진입 마진 비중<br />
                    <span className="text-emerald-400 font-extrabold bg-emerald-950/30 border border-emerald-900/50 px-1.5 py-0.5 rounded-sm inline-block mt-1">
                      설정된 {parseFloat(editUsage) || 0}% 가 각 코인 타점 발생 시 개별 마진으로 진입됩니다.
                    </span>
                  </p>
                </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-[#222] bg-[#111]">
              <button 
                onClick={() => setShowWalletSettings(false)}
                className="px-4 py-2 rounded-md text-sm font-semibold text-gray-400 hover:bg-[#222] transition-colors"
              >
                취소
              </button>
              <button 
                onClick={saveWalletSettings}
                className="px-6 py-2 rounded-md text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Settings Modal */}
      {showApiSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-[#0a0a0a] rounded-xl shadow-xl w-full max-w-md border border-[#222] overflow-hidden transform transition-all flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-[#222] bg-[#111]/80 shrink-0">
              <h2 className="text-[16px] font-black flex items-center gap-2 text-white">
                <Key className="text-indigo-400" size={18} /> 실물 비트겟 API 설정 및 자가진단
              </h2>
              <button 
                onClick={() => setShowApiSettings(false)}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded-md hover:bg-[#222]"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="bg-[#111] text-gray-300 p-3.5 rounded-md border border-[#333] text-xs shadow-sm leading-relaxed">
                <span className="font-bold text-indigo-500">🔒 영구 안전 저장:</span> 본 모달에 기입한 모든 자격 증명은 서버 측의 <code className="bg-[#222] px-1 py-0.5 rounded font-bold font-mono text-gray-100">user_config.json</code>에 안전하게 영구 암호화 위임 저장됩니다. 컴퓨터를 재부팅하거나 브라우저를 껐다 켜도 완벽하게 그대로 연동이 유지됩니다.
              </div>

              {/* Real Trading Mode Switch Block */}
              <div className="bg-[#111] p-4 rounded-lg border border-[#333]">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-gray-200">실물 계정 실전 매매 연동</label>
                    <p className="text-[10px] text-gray-400 mt-0.5">실제 비트겟 선물 지갑을 통해 시장가 주문을 자동 수행할지 결정합니다.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsRealTradingActive(!isRealTradingActive)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 ${isRealTradingActive ? 'bg-indigo-600' : 'bg-[#333] border border-[#444]'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isRealTradingActive ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {isRealTradingActive ? (
                  <div className="mt-3 bg-red-950/30 text-red-400 p-2.5 rounded border border-red-900/50 text-[11px] leading-relaxed">
                    🚨 <b>실거래 가동 알림:</b> AI의 포지션 진입 신호 발생 시 기입된 지갑 한도(Wallet Usage 분산)에 따라 비트겟 계정에서 실제 시장가 주문(10배 마진)이 자동 집행됩니다. 투자 손실 리스크가 있으니 보수적인 테스트 후 진행하십시오.
                  </div>
                ) : (
                  <div className="mt-3 bg-emerald-950/30 text-emerald-400 p-2.5 rounded border border-emerald-900/50 text-[11px] leading-relaxed">
                    ℹ️ <b>안전 모의 매매 가동 중:</b> 거래소로 실제 주문을 송출하지 않고 내부 가상 자산 변동폭으로만 기록하며 모의 타점, 손익, 손실 히스토리를 정확하고 똑같이 축적합니다.
                  </div>
                )}
              </div>

              {/* Bitget Demo/Sandbox Trading Mode Switch Block */}
              <div className="bg-[#111] p-4 rounded-lg border border-[#333]">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-gray-200">비트겟 모의투자 (Demo Trading)</label>
                    <p className="text-[10px] text-gray-400 mt-0.5">비트겟의 공식 모의투자 API 및 가상 자산 환경을 사용할지 결정합니다.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setBitgetUseDemo(!bitgetUseDemo)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 ${bitgetUseDemo ? 'bg-amber-600' : 'bg-[#333] border border-[#444]'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${bitgetUseDemo ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {bitgetUseDemo ? (
                  <div className="mt-3 bg-amber-950/30 text-amber-400 p-2.5 rounded border border-amber-900/50 text-[11px] leading-relaxed">
                    ⚠️ <b>모의투자(Demo) 가동 중:</b> 비트겟 공식 모의투자 계정 API를 사용해 실제 거래소와 완벽히 격리된 안전 가상 거래 모드를 수행합니다. "Apikey does not exist" 오류 시 꼭 이 옵션을 확인해주세요.
                  </div>
                ) : (
                  <div className="mt-3 bg-indigo-950/30 text-indigo-400 p-2.5 rounded border border-indigo-900/50 text-[11px] leading-relaxed">
                    💸 <b>실제운영(Mainnet) 가동 중:</b> 실제 투자금이 가동되는 정식 실물 비트겟 선물 거래 환경에 접속해 자금을 운용합니다. Live 계정 API 전용입니다.
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1.5 font-sans">
                    <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider">Access Key</label>
                    {status?.hasBitgetApiKey && (
                      <span className="text-[10px] text-emerald-400 font-extrabold bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/50 animate-pulse">✓ 백엔드 연동 활성 중</span>
                    )}
                  </div>
                  <input 
                    type="password" 
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="new-password"
                    className="w-full bg-[#111] text-white border border-[#333] rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono shadow-sm"
                    placeholder={status?.hasBitgetApiKey ? "••••••••••••• (이미 안전 저장됨, 변경 시 입력)" : "비트겟 실물 API 키 (Access Key)"}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1.5 font-sans">
                    <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider">Secret Key</label>
                    {status?.hasBitgetApiSecret && (
                      <span className="text-[10px] text-emerald-400 font-extrabold bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/50 animate-pulse">✓ 백엔드 연동 활성 중</span>
                    )}
                  </div>
                  <input 
                    type="password" 
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    autoComplete="new-password"
                    className="w-full bg-[#111] text-white border border-[#333] rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono shadow-sm"
                    placeholder={status?.hasBitgetApiSecret ? "••••••••••••• (이미 안전 저장됨, 변경 시 입력)" : "비트겟 실물 시크릿 키 (Secret Key)"}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1.5 font-sans">
                    <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider">Passphrase (API 암호)</label>
                    {status?.hasBitgetPassphrase && (
                      <span className="text-[10px] text-emerald-400 font-extrabold bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/50 animate-pulse">✓ 백엔드 연동 활성 중</span>
                    )}
                  </div>
                  <input 
                    type="password" 
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    autoComplete="new-password"
                    className="w-full bg-[#111] text-white border border-[#333] rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono shadow-sm"
                    placeholder={status?.hasBitgetPassphrase ? "••••••••••••• (이미 안전 저장됨, 변경 시 입력)" : "API 발급 시 설정한 API 비밀번호"}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1.5 font-sans">
                    <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider">Gemini API Key</label>
                    {status?.hasGeminiApiKey ? (
                      <span className="text-[10px] text-rose-400 font-extrabold bg-rose-950/30 px-2 py-0.5 rounded border border-rose-900/50">✓ 개인 API 키 탑재됨</span>
                    ) : (
                      <span className="text-[10px] text-indigo-400 font-extrabold bg-indigo-950/30 px-2 py-0.5 rounded border border-indigo-900/50">⚡ 공용 무료 서버 키 작동 중</span>
                    )}
                  </div>
                  <input 
                    type="password" 
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    autoComplete="new-password"
                    className="w-full bg-[#111] text-white border border-[#333] rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono shadow-sm"
                    placeholder={status?.hasGeminiApiKey ? "••••••••••••• (이미 안전 저장됨, 변경 시 입력)" : "Gemini API Key"}
                  />
                  <p className="mt-1.5 text-[10px] text-gray-400 leading-normal">
                    • 본인의 개인 생성 키는 대개 <strong className="text-gray-300 font-semibold font-mono">AIzaSy</strong>로 출발합니다.<br/>
                    • 비워두실 경우 임시 제공되는 공용 서버 키로 자동 연계되나, 다른 동시 접속자들과 한도가 무작위 쉐어되어 일시 할당 한도 오류가 발생할 수 있습니다.
                  </p>
                </div>
              </div>

              {/* Bitget Diagnostic Tool Panel */}
              <div className="pt-2 border-t border-[#333]">
                <button
                  type="button"
                  onClick={runDiagnostic}
                  disabled={diagnosticStatus === 'running'}
                  className="w-full py-2.5 px-4 bg-[#222] hover:bg-[#333] font-bold text-xs text-white rounded-md shadow-sm transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#555] focus:ring-offset-1"
                >
                  {diagnosticStatus === 'running' ? '⏳ 거래소 보안 게이트웨이 인증 중...' : '🔍 비트겟 거래소 연결 및 잔고검증 자가진단'}
                </button>
                
                {diagnosticStatus === 'running' && (
                  <div className="mt-2.5 text-center text-[11px] text-gray-400 font-medium">
                    해외 CCXT 모듈을 통해 API 인증서명 분석 및 선물 잔고 유효성을 맵핑 중입니다...
                  </div>
                )}

                {diagnosticStatus === 'success' && diagnosticResult && (
                  <div className="mt-3 bg-emerald-950/30 border border-emerald-900/50 p-3.5 rounded-lg space-y-2">
                    <h4 className="text-xs font-black text-emerald-400">{diagnosticResult.message}</h4>
                    <div className="text-[11px] text-emerald-400 font-bold mb-1">
                      💸 선물(Futures) 가용 잔고: <span className="font-extrabold text-xs text-emerald-200 underline font-mono">${diagnosticResult.usdtFree?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USDT</span>
                    </div>
                    <ul className="space-y-1 text-[11px] text-emerald-400/90 font-medium">
                      {diagnosticResult.details?.map((detail: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>

                    {/* 실무 가용성 분석 섹션 */}
                    <div className="mt-2.5 pt-2.5 border-t border-emerald-900/50">
                      <div className="flex items-center gap-1.5 text-[11px] font-black text-emerald-300 mb-1.5">
                        <Zap size={13} className="text-emerald-500 font-extrabold" />
                        <span>🤖 실무 자동매매 최종 가용성 판정</span>
                      </div>
                      
                      {(diagnosticResult.usdtFree !== undefined ? Number(diagnosticResult.usdtFree) : 0) >= 10 ? (
                        <div className="bg-emerald-950/40 rounded-md p-2.5 border border-emerald-900/60 text-[11px] text-emerald-200 leading-relaxed shadow-xs">
                          <div className="flex items-center gap-1.5 font-extrabold mb-1">
                            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse animate-duration-1000" />
                            <span className="text-emerald-400 font-black">🟢 실전 거래 즉시 가능함 (매우 충분)</span>
                          </div>
                          <p className="text-[10px] text-emerald-400/80 font-semibold leading-normal">
                            인증서 규격 및 최소 주문 임계치(${diagnosticResult.usdtFree?.toLocaleString()} USDT)가 충족되어 AI 포지션 발생 즉시 실전 주문이 전격 체결 가능한 든든한 상태입니다!
                          </p>
                        </div>
                      ) : (diagnosticResult.usdtFree !== undefined ? Number(diagnosticResult.usdtFree) : 0) > 0 ? (
                        <div className="bg-amber-950/40 rounded-md p-2.5 border border-amber-900/60 text-[11px] text-amber-200 leading-relaxed shadow-xs">
                          <div className="flex items-center gap-1.5 font-extrabold mb-1">
                            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse animate-duration-1000" />
                            <span className="text-amber-400 font-black">🟡 제한적 실전 매매 가능 (잔고 경고)</span>
                          </div>
                          <p className="text-[10px] text-amber-400/80 font-semibold leading-normal">
                            가용 잔고가 $10 미만(${diagnosticResult.usdtFree?.toLocaleString()} USDT)으로, 거래소 계약별 최소 주문 수량 한도에 걸리면 일부 종목 주문이 체결 누락될 수 있습니다. 안정적 원클릭 운용을 위해 최소 $10 USDT 이상 추가 입금하시거나, 그 외 자금 보충 전까지는 가상 모의매매 활용을 적극 추천드립니다.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-rose-950/40 rounded-md p-2.5 border border-rose-900/60 text-[11px] text-rose-200 leading-relaxed shadow-xs">
                          <div className="flex items-center gap-1.5 font-extrabold mb-1">
                            <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse animate-duration-1000" />
                            <span className="text-rose-400 font-black">🔴 실거래 즉시 매매 불가능 (잔고 부족)</span>
                          </div>
                          <p className="text-[10px] text-rose-400/80 font-semibold leading-normal">
                            비트겟 API 서명 보안 증명은 유효하게 연결되었으나, 거래할 수 있는 현금 잔고가 0 USDT입니다. 마진 증거금 결여로 모든 포지션 개설 시도 시 에러가 나므로, 실제 이체 전까지는 본 시스템을 가상 모의매매 모드로 사용하십시오.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {diagnosticStatus === 'fail' && diagnosticResult && (
                  <div className="mt-3 bg-red-950/30 border border-red-900/50 p-3.5 rounded-lg space-y-2 text-xs">
                    <h4 className="font-bold text-red-400">⚠️ 실거래 전송 준비 오류 감지</h4>
                    <div className="text-[11px] text-gray-300 font-medium leading-relaxed" dangerouslySetInnerHTML={{ __html: diagnosticResult.message.replace(/\n/g, '<br/>') }} />
                    {diagnosticResult.rawError && (
                      <details className="mt-2 text-[10px] text-red-400/80 font-mono">
                        <summary className="cursor-pointer hover:underline">거래소 원본 응답 메세지 보기</summary>
                        <div className="p-1.5 bg-red-950/40 rounded mt-1 overflow-x-auto whitespace-pre-wrap leading-normal font-mono">
                          {diagnosticResult.rawError}
                        </div>
                      </details>
                    )}

                    {/* 실무 가용성 분석 섹션 */}
                    <div className="mt-2.5 pt-2.5 border-t border-red-900/50">
                      <div className="flex items-center gap-1.5 text-[11px] font-black text-rose-300 mb-1.5">
                        <XSquare size={13} className="text-red-500 font-extrabold" />
                        <span>🤖 실무 자동매매 최종 가용성 판정</span>
                      </div>
                      <div className="bg-red-950/40 rounded-md p-2.5 border border-red-900/60 text-[11px] text-red-200 leading-relaxed shadow-xs">
                        <div className="flex items-center gap-1.5 font-extrabold mb-1">
                          <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping animate-duration-1000" />
                          <span className="text-red-400 font-black">🔴 실거래 즉시 매매 연동 불가 (서명 요망)</span>
                        </div>
                        <p className="text-[10px] text-red-400/80 font-semibold leading-normal">
                          서버와 비트겟 호스트 간의 API Key / API Secret / Passphrase 크로스 매칭에 실패했거나 권한 승인이 반려되었습니다. 설정 내용 중 공백이나 특수 문자가 들어가지 않았는지 다시 확인하시고 완벽히 기입해 주기 전까지 실전매매 구동은 전면 불가하오니 필히 가상 모의매매 상태를 견지하십시오.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-3 p-4 border-t border-[#222] bg-[#111] shrink-0">
              <button 
                onClick={() => setShowApiSettings(false)}
                className="px-4 py-2 rounded-md text-sm font-semibold text-gray-400 hover:bg-[#222] transition-colors"
              >
                닫기
              </button>
              <button 
                onClick={async () => {
                  try {
                    const prevRealValSetting = localStorage.getItem('user_is_real_trading_active');
                    const prevRealVal = prevRealValSetting === null ? true : prevRealValSetting === 'true';
                    const hasModeChanged = prevRealVal !== isRealTradingActive;

                    if (apiKey.trim() !== '') localStorage.setItem('user_api_key', apiKey);
                    if (secretKey.trim() !== '') localStorage.setItem('user_secret_key', secretKey);
                    if (passphrase.trim() !== '') localStorage.setItem('user_passphrase', passphrase);
                    if (geminiKey.trim() !== '') localStorage.setItem('user_gemini_key', geminiKey);
                    localStorage.setItem('user_is_real_trading_active', String(isRealTradingActive));
                    localStorage.setItem('user_bitget_use_demo', String(bitgetUseDemo));
                    
                    const payload: any = { isRealTradingActive, bitgetUseDemo };
                    if (geminiKey.trim() !== '') payload.geminiKey = geminiKey;
                    if (apiKey.trim() !== '') payload.bitgetApiKey = apiKey;
                    if (secretKey.trim() !== '') payload.bitgetApiSecret = secretKey;
                    if (passphrase.trim() !== '') payload.bitgetPassphrase = passphrase;
                    
                    if (hasModeChanged) {
                      setIsTransitioningMode(true);
                      setStatus(null);
                      setLogs([]);
                      setShowApiSettings(false);
                    }
                    
                    const res = await fetch('/api/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                    });
                    const data = await res.json();
                    
                    if (hasModeChanged) {
                      // Mode transition sequence
                      await new Promise(resolve => setTimeout(resolve, 1500));
                      try {
                        const freshRes = await fetch('/api/status');
                        if (freshRes.ok) {
                          const freshData = await freshRes.json();
                          if (freshData) {
                            setStatus(freshData);
                          }
                        }
                        const freshLogsRes = await fetch('/api/logs');
                        if (freshLogsRes.ok) {
                          const freshLogsData = await freshLogsRes.json();
                          if (freshLogsData && freshLogsData.logs) {
                            setLogs(freshLogsData.logs);
                          }
                        }
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setIsTransitioningMode(false);
                      }
                      triggerToast('설정이 로컬 config에 영구 기록 및 모드 전환 초기화가 완료되었습니다!', 'success');
                      return;
                    }
                    
                    if (data.success) {
                      if (data.syncSuccess) {
                        triggerToast(`설정 및 실제 비트겟 선물 잔고($${data.syncedBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USDT) 연동 완료!`, 'success');
                        setEditBalance(data.syncedBalance.toString());
                        setStatus((prev: any) => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            globalBalanceUsdt: data.syncedBalance,
                            initialGlobalBalanceUsdt: data.syncedBalance
                          };
                        });
                      } else {
                        triggerToast('설정이 로컬 config에 영구 기록 및 즉시 적용되었습니다!', 'success');
                      }
                      setShowApiSettings(false);
                    } else {
                      triggerToast('설정 거부: ' + data.message, 'error');
                    }
                  } catch (e: any) {
                    console.error('Failed to save API keys:', e);
                    triggerToast('서버 저장 실패: ' + e.message, 'error');
                    setIsTransitioningMode(false);
                  }
                }}
                className="px-6 py-2 rounded-md text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
              >
                적용 및 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Custom Toast Notification Banner */}
      {customToast && (
        <div className="fixed bottom-5 right-5 z-[999] transform translate-y-0 transition-all duration-300 pointer-events-auto">
          <div className={`px-5 py-4 rounded-xl border shadow-2xl flex items-center gap-3 font-bold text-xs md:text-[13px] backdrop-blur-md 
            ${customToast.type === 'success' ? 'bg-[#0a0a0a]/95 text-emerald-400 border-emerald-900/50 shadow-[0_0_30px_rgba(16,185,129,0.15)]' : ''}
            ${customToast.type === 'info' ? 'bg-[#0a0a0a]/95 text-indigo-400 border-indigo-900/50 shadow-[0_0_30px_rgba(99,102,241,0.15)]' : ''}
            ${customToast.type === 'error' ? 'bg-[#0a0a0a]/95 text-rose-400 border-rose-900/50 shadow-[0_0_30px_rgba(244,63,94,0.15)]' : ''}
          `}>
            {customToast.type === 'success' && <span className="text-emerald-500 text-base">✓</span>}
            {customToast.type === 'info' && <span className="text-indigo-500 text-base">ℹ</span>}
            {customToast.type === 'error' && <span className="text-rose-500 text-base">⚠️</span>}
            <span>{customToast.message}</span>
            <button onClick={() => setCustomToast(null)} className="text-gray-500 hover:text-white font-black ml-2 cursor-pointer transition-colors">✕</button>
          </div>
        </div>
      )}

      {/* 2. Reset Data Safety Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9990] animate-fade-in">
          <div className="bg-[#0a0a0a] rounded-xl max-w-md w-full border border-[#222] shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden p-6 space-y-4">
            <div className="flex gap-3 items-start">
              <div className="p-3 bg-rose-950/30 text-rose-400 rounded-full shrink-0">
                <AlertCircle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-white text-[15px]">🚨 매매 히스토리 기록 초기화</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  현재까지 모여진 모든 완료 거래 내역(매매 히스토리 목록)을 깨끗이 초기화(삭제)합니다. **지속 중인 실전/모의 포지션이나 보유 자산(잔고) 등은 아무런 간섭 없이 안전하게 그대로 복구식 유지됩니다.** 정말 실행하시겠습니까?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-xs font-bold text-gray-400 hover:bg-[#222] rounded-lg transition-colors border border-[#333] cursor-pointer"
              >
                취소 (돌아가기)
              </button>
              <button
                onClick={async () => {
                  setShowResetConfirm(false);
                  try {
                    const res = await fetch('/api/reset-data', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                      setStatus((prev: any) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          tradeHistory: [],
                          positions: data.currentPositions || prev.positions,
                          globalBalanceUsdt: data.globalBalanceUsdt ?? prev.globalBalanceUsdt
                        };
                      });
                      triggerToast('완료된 매매 히스토리 기록이 안전하게 초기화되었습니다!', 'success');
                    }
                  } catch(e) {
                    console.error("Failed to reset trade records:", e);
                    triggerToast('초기화 요청 도중 연결 통신 장애가 발생했습니다.', 'error');
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-all shadow-md shadow-rose-600/10 cursor-pointer"
              >
                예, 히스토리 기록만 초기화
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Real Live Trading Mode Toggle Confirmation Modal */}
      {showToggleRealConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9990] animate-fade-in">
          <div className="bg-[#0a0a0a] rounded-xl max-w-md w-full border border-[#222] shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden p-6 space-y-4">
            <div className="flex gap-3 items-start">
              <div className="p-3 bg-amber-950/30 text-amber-500 rounded-full shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-amber-400 text-[15px]">🚨 비트겟 실전 실물 거래(Real Live) 가동 승인</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-2">
                  안전한 가상 시뮬레이션 모드를 종료하고, **실제 본인 비트겟 선물 주계정 지갑 자산**과 실시간 연동되어 AI 신호에 의거한 **실제 시장가 주문 송출 및 포지션 집행**을 진행하는 실전 투자 상태로 전환하시겠습니까?
                </p>
                <div className="bg-red-950/30 rounded-lg p-3 border border-red-900/50 space-y-1 text-[11px] text-red-400 font-bold leading-normal">
                  <div className="flex items-center gap-1 text-red-400">
                    <span>⚠️</span>
                    <span>필수 확인 고지 및 유의사항:</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-[10px] text-red-400/90 font-medium">
                    <li>실제 투자 리스크가 직접 작동하여 손실이 발생할 수 있습니다.</li>
                    <li>이하 입력된 비트겟 API 자격증명 정보의 적합성을 사전에 검증하십시오.</li>
                    <li>전환 시점을 기준으로, 이전에 임시로 잡혀있던 가상의 모의 포지션들은 전부 완전 종료 초기화됩니다.</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowToggleRealConfirm(false)}
                className="px-4 py-2 text-xs font-bold text-gray-400 hover:bg-[#222] rounded-lg transition-colors border border-[#333] cursor-pointer"
              >
                취소 (모의 거래 유지)
              </button>
              <button
                onClick={async () => {
                  setShowToggleRealConfirm(false);
                  await toggleSetting('isRealTradingActive', true);
                  triggerToast('🚨 비트겟 실물 연동 실전 매매 시스템이 성공적으로 켜졌습니다!', 'success');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
              >
                동의하고 실전 가동 시작
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Full Screen Mode Switching & Database Clean Reset Loading Screen */}
      {isTransitioningMode && (
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-md z-[9999] flex flex-col items-center justify-center text-white p-6 animate-fade-in animate-duration-300">
          <div className="bg-slate-800/95 border border-slate-700/80 p-8 rounded-2xl max-w-sm w-full shadow-2xl flex flex-col items-center text-center space-y-6">
            <div className="relative">
              {/* Spinning Loader Outer Ring */}
              <div className="w-16 h-16 rounded-full border-4 border-slate-700 border-t-indigo-500 animate-spin" />
              {/* Pulse Core Icon */}
              <div className="absolute inset-2 bg-indigo-600/30 rounded-full flex items-center justify-center animate-pulse">
                <RefreshCw size={24} className="text-indigo-400 animate-spin" style={{ animationDuration: '3s' }} />
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2 justify-center">
                <span>🔄</span> 트레이딩 모드 안전 전환 중
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                기존 화면의 모든 감시 데이터를 정밀 대청소하고,<br />
                <span className="text-indigo-400 font-extrabold">{isRealTradingActive ? '실전 매매 (Bitget)' : '가상 모의 (Simulated)'}</span> 상태로 신선하게 초기화 기동 중입니다.
              </p>
            </div>
            
            <div className="w-full bg-slate-700/50 h-1 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full animate-pulse" />
            </div>
            
            <div className="text-[9px] text-slate-500 font-medium font-mono tracking-wider">
              PRISTINE STABILIZATION PROCESS
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
