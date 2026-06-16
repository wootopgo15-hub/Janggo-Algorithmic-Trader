import React, { useState } from 'react';
import { BotStatusResponse } from '../types';
import { 
  Activity, Power, AlertOctagon, RefreshCw, 
  Wallet, ShieldAlert, CircleMinus, TrendingUp,
  Eye
} from 'lucide-react';
import { TimeSyncModal } from './TimeSyncModal';

interface DashboardProps {
  status: BotStatusResponse | null;
  onToggleMaster: () => void;
  onPanicSell: () => void;
  onSyncTime: () => void;
  onSyncTimeChange: (offset: number) => void;
  onAllocationChange: (pct: number) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  status, 
  onToggleMaster, 
  onPanicSell,
  onSyncTime,
  onSyncTimeChange,
  onAllocationChange
}) => {
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showPanicModal, setShowPanicModal] = useState(false);

  if (!status) return <div className="p-4 text-gray-400">Connecting to engine...</div>;

  const isTimeDesynced = Math.abs(status.timeOffsetMs) > 1000;

  return (
    <div className="bg-[#050608] border-b border-gray-800 p-4 flex flex-col gap-4">
      
      {/* Top Header Row styled like Design HTML Header Section */}
      <header className="relative bg-[#0C0E14] border border-gray-800 p-6 sm:p-8 rounded-xl shadow-2xl overflow-hidden flex flex-col xl:flex-row justify-between gap-8 sm:gap-12">
        
        {/* Left Column: Title & Server Status */}
        <div className="flex flex-col justify-between items-start gap-8 xl:gap-0 h-full w-full xl:w-auto min-w-[300px]">
          <div className="flex flex-col text-left">
            <span className="text-xs font-bold text-blue-500 tracking-widest uppercase mb-1">퀀트 시스템 알파</span>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center justify-start">
              대시보드 V4.2
            </h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 py-3 px-4 bg-[#050608] border border-gray-800/80 rounded mt-auto w-fit">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] ${status.apiStatus === 'Connected' ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider font-semibold">
                API: {status.apiStatus === 'Connected' ? '비트겟 선물 활성화됨' : '연결 끊김'}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></span>
              <span className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider font-semibold">서버: GCP-E2-MEDIUM</span>
            </div>
          </div>
        </div>

        {/* Right Column: Numbers, Allocation, and Buttons */}
        <div className="flex flex-col gap-6 lg:gap-8 w-full xl:w-auto xl:min-w-[600px] flex-1">
          
          {/* Top of right col: Allocation + Total Portfolio Row */}
          <div className="flex flex-col md:flex-row items-center xl:items-end justify-between w-full gap-6">
            
            <div className="w-full md:w-3/5 p-4 sm:p-5 bg-[#0A0D14] border border-blue-900/30 rounded-xl text-left shadow-inner">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] md:text-xs text-blue-400 font-bold tracking-widest uppercase">매매 할당 비중 (<span className="text-white">{status.tradingAllocationPct}%</span>)</span>
                <span className="text-[10px] md:text-xs text-gray-500 font-bold uppercase tracking-widest">안전 자산 (<span className="text-gray-300">{100 - status.tradingAllocationPct}%</span>)</span>
              </div>
              <input 
                type="range" 
                min="1" max="100" 
                value={status.tradingAllocationPct}
                onChange={(e) => onAllocationChange?.(Number(e.target.value))}
                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500 mb-3"
              />
              <div className="text-[10px] text-gray-400 uppercase tracking-wide flex items-start gap-1.5 leading-relaxed">
                 <ShieldAlert size={12} className="text-orange-500 shrink-0 mt-0.5" />
                 <span>
                    설정 운용 한도 <span className="text-blue-400 font-mono font-bold">${((status.totalBalance * status.tradingAllocationPct) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> 외 나머지 금액은 보호됩니다. 
                    (현재 코인 진입 총액: <span className="text-white font-mono font-bold">${status.coins.reduce((sum, c) => sum + (c.margin || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>)
                 </span>
              </div>
            </div>

            <div className="flex flex-col text-center xl:text-right w-full md:w-2/5 justify-end">
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">총 포트폴리오 자산</div>
              <div className="text-2xl md:text-3xl font-mono font-bold text-white tracking-tighter italic flex items-center justify-center xl:justify-end">
                ${(status.totalBalance + status.totalPnl).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                <span className={`text-sm lg:text-base ml-2 font-normal not-italic tracking-normal ${status.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {status.totalPnl >= 0 ? '+$' : '-$'}{Math.abs(status.totalPnl).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
              </div>
            </div>

          </div>

          {/* Bottom of right col: Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-end items-center w-full mt-auto">
            <button 
              onClick={onToggleMaster}
              className={`px-8 py-3.5 border rounded text-xs font-bold transition-all shadow-lg uppercase flex items-center justify-center gap-2 tracking-wide w-full sm:w-auto min-w-[200px] ${
                status.masterActive 
                  ? 'bg-blue-600 hover:bg-blue-500 border-blue-400/30 text-white shadow-[0_0_20px_rgba(37,99,235,0.2)]' 
                  : 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-300'
              }`}
            >
              <Power size={14} />
              {status.masterActive ? '마스터 동작중' : '마스터 시작'}
            </button>
            <button 
              onClick={() => setShowPanicModal(true)}
              className="px-8 py-3.5 bg-red-600/10 hover:bg-red-600 border border-red-500/30 hover:border-red-500 rounded text-xs font-bold text-red-500 hover:text-white transition-all uppercase flex items-center justify-center gap-2 tracking-wide w-full sm:w-auto min-w-[200px]"
            >
              <AlertOctagon size={14} />
              전체 패닉셀 (시장가 청산)
            </button>
          </div>
        </div>
      </header>

      {/* Synchronized to Data Sync Control Panel in Design HTML */}
      <section className="flex flex-col xl:flex-row items-center justify-between bg-[#11141D] border border-blue-900/30 p-3 rounded-lg gap-4">
        <div className="flex flex-col md:flex-row items-center gap-6 w-full xl:w-auto">
          <div className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${isTimeDesynced ? 'text-orange-400' : 'text-blue-400'}`} />
            <span className="text-xs font-semibold uppercase tracking-wider">
              동기화 상태: <span className={isTimeDesynced ? "text-orange-400" : "text-green-400"}>
                {isTimeDesynced ? '동기화 오류 경고' : '검증 완료 (500 캔들)'}
              </span>
            </span>
          </div>
          
          <div className="flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded border border-gray-800">
            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">시간 오프셋 (ms)</label>
            <input 
              type="range" 
              value={status.timeOffsetMs} 
              min={-5000} 
              max={5000} 
              onChange={(e) => onSyncTimeChange(Number(e.target.value))}
              className={`w-32 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer hover:accent-blue-400 ${isTimeDesynced ? 'accent-orange-500' : 'accent-blue-500'}`} 
            />
            <span className={`text-xs ml-2 font-mono font-bold ${isTimeDesynced ? 'text-orange-300' : 'text-blue-300'}`}>
              {status.timeOffsetMs > 0 ? '+' : ''}{status.timeOffsetMs}ms
            </span>
          </div>
          
          <button 
            onClick={() => setShowSyncModal(true)}
            className="px-3 py-1.5 bg-blue-600/10 border border-blue-500/30 text-blue-400 hover:bg-blue-600/20 hover:text-blue-300 transition-colors uppercase tracking-widest text-[10px] font-bold rounded flex items-center gap-1.5"
          >
            <Eye size={12} />
            시각적 검증 15분
          </button>
        </div>

        <div className="flex items-center gap-4 justify-end w-full xl:w-auto">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-500 uppercase leading-none font-bold tracking-widest mb-1">거래소 시간 (UTC)</span>
            <span className="text-xs font-mono text-gray-300">
              {new Date(Date.now() + status.timeOffsetMs).toISOString().replace('T', ' ').slice(0, -1)}
            </span>
          </div>
          <button 
            onClick={onSyncTime}
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-[10px] font-bold uppercase hover:bg-gray-700 text-gray-200 transition-colors tracking-widest"
          >
            강제 재동기화
          </button>
        </div>
      </section>
      
      <TimeSyncModal 
        isOpen={showSyncModal} 
        onClose={() => setShowSyncModal(false)} 
        offsetMs={status.timeOffsetMs}
        onOffsetChange={onSyncTimeChange}
        coins={status.coins.map(c => c.symbol)}
      />

      {showPanicModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-[#11141D] border border-red-500/30 rounded-xl p-8 max-w-md w-full relative">
            <h2 className="text-2xl font-bold text-red-500 mb-4 flex items-center gap-2">
              <AlertOctagon size={24} />
              긴급: 전체 시장가 청산
            </h2>
            <p className="text-gray-400 mb-8 whitespace-pre-wrap leading-relaxed">
              모든 진행중인 포지션을 즉시 <strong className="text-red-400">시장가로 종료</strong>합니다. 손실이 발생할 수 있습니다. 정말 진행하시겠습니까?
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setShowPanicModal(false)}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded font-bold transition-colors"
              >
                취소
              </button>
              <button 
                onClick={() => {
                  onPanicSell();
                  setShowPanicModal(false);
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded font-bold transition-colors"
              >
                진행 (청산)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
