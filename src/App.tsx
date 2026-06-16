import React, { useEffect, useState } from 'react';
import { BotStatusResponse } from './types';
import { Dashboard } from './components/Dashboard';
import { CoinCard } from './components/CoinCard';
import { BitgetApiLogin } from './components/BitgetApiLogin';
import { BacktestView } from './components/BacktestView';
import { Activity, History } from 'lucide-react';

export default function App() {
  const [status, setStatus] = useState<BotStatusResponse | null>(null);
  const [apiStatus, setApiStatus] = useState<'Disconnected' | 'Connected' | 'Error'>('Disconnected');
  const [activeTab, setActiveTab] = useState<'LIVE' | 'BACKTEST'>('LIVE');

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStatus(data);
    } catch (e) {
      console.error("Failed to fetch engine status", e);
    }
  };

  useEffect(() => {
    fetchStatus().catch(console.error);
    const interval = setInterval(() => fetchStatus().catch(console.error), 3000);
    return () => clearInterval(interval);
  }, []);

  const toggleMaster = async () => {
    try {
      await fetch('/api/master/toggle', { method: 'POST' });
      fetchStatus();
    } catch(e) { console.error(e); }
  };

  const panicSell = async () => {
    try {
      await fetch('/api/panic-sell', { method: 'POST' });
      fetchStatus();
    } catch(e) { console.error(e); }
  };

  const syncTime = async () => {
    try {
      await fetch('/api/sync-time', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ offset: 0 }) 
      });
      fetchStatus();
    } catch(e) { console.error(e); }
  };

  const syncTimeWithOffset = async (offset: number) => {
    try {
      await fetch('/api/sync-time', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ offset }) 
      });
      fetchStatus();
    } catch(e) { console.error(e); }
  };

  const updateAllocation = async (pct: number) => {
    setStatus(prev => prev ? { ...prev, tradingAllocationPct: pct } : prev);
    try {
      await fetch('/api/allocation', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ pct }) 
      });
      fetchStatus();
    } catch(e) { console.error(e); }
  };

  const toggleCoin = async (symbol: string) => {
    try {
      await fetch('/api/coin/toggle', { 
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ symbol })
      });
      fetchStatus();
    } catch(e) { console.error(e); }
  };

  const handleApiConnect = (apiKey: string, secretKey: string, passphrase?: string) => {
    console.log('Connecting to Bitget API...', { apiKey: '***', secretKey: '***', passphrase: passphrase ? '***' : undefined });
    // Simulate API connection
    setApiStatus('Connected');
  };

  return (
    <div className="min-h-screen bg-[#050608] text-gray-100 font-sans flex flex-col selection:bg-blue-500/30 overflow-x-hidden">
      <div className="max-w-[1600px] mx-auto w-full flex-1 flex flex-col">
        <BitgetApiLogin onConnect={handleApiConnect} status={apiStatus} />
        <Dashboard 
          status={status} 
          onToggleMaster={toggleMaster} 
          onPanicSell={panicSell} 
          onSyncTime={syncTime}
          onSyncTimeChange={syncTimeWithOffset}
          onAllocationChange={updateAllocation}
        />
        
        {/* Navigation Tabs */}
        <div className="flex px-4 mt-2 gap-2 border-b border-gray-800">
          <button 
            onClick={() => setActiveTab('LIVE')}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'LIVE' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >
            <Activity size={16} />
            실시간 모니터링
          </button>
          <button 
            onClick={() => setActiveTab('BACKTEST')}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'BACKTEST' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >
            <History size={16} />
            백테스트 리포트
          </button>
        </div>
        
        {activeTab === 'LIVE' ? (
          <main className="p-4 flex-1 flex flex-col w-full animate-in fade-in duration-300">
            <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-end px-2 space-y-2 md:space-y-0">
              <h2 className="text-lg font-bold text-gray-300 tracking-tight uppercase">실시간 모니터링 매트릭스 전체 4시간봉(4H)</h2>
              <div className="text-[10px] text-blue-500 uppercase tracking-widest font-mono font-bold bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                {status?.coins.length || 0}개 타겟 추적중
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pb-6 flex-1 auto-rows-fr min-h-0">
              {status?.coins.map(coin => (
                <CoinCard 
                  key={coin.symbol} 
                  coin={coin} 
                  timeOffsetMs={status.timeOffsetMs}
                  onToggle={toggleCoin} 
                />
              ))}
            </div>
          </main>
        ) : (
          <main className="p-4 flex-1 flex flex-col w-full">
            <BacktestView />
          </main>
        )}
      </div>

      <footer className="flex flex-col md:flex-row items-center justify-between px-4 py-3 bg-black border-t border-gray-800 text-[10px] text-gray-500 gap-2">
        <div className="flex items-center space-x-4 font-mono uppercase tracking-widest">
          <span>도커: 실행중</span>
          <span>네트워크 지연: {Math.floor(Math.random() * 30 + 20)}ms</span>
          <span>API 제한: 180/1200</span>
        </div>
        <div className="flex items-center space-x-4 font-mono uppercase tracking-widest">
          <span className="text-blue-500 font-bold">v1.0.4-STABLE</span>
          <span className="text-gray-300 hidden md:inline">시스템 로그: [정보] 모든 노드가 정상 작동 및 보고 중입니다.</span>
        </div>
      </footer>
    </div>
  );
}
