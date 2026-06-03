/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle, BarChart2, Zap, Settings, Shield, History, Play, Square, Copy, ExternalLink, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, ComposedChart, Bar, ReferenceLine
} from "recharts";
import { cn } from "@/src/lib/utils";
import { AnalysisResult, Decision } from "./types";

interface TradeLog {
  id: string;
  side: "LONG" | "SHORT";
  symbol: string;
  amount: string;
  timestamp: string;
  status: "SUCCESS" | "FAILED";
  reason?: string;
}

export default function App() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [granularity, setGranularity] = useState("15m");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Trading States
  const [isAutoTrade, setIsAutoTrade] = useState(false);
  const [orderSize, setOrderSize] = useState("15");
  const [takeProfit, setTakeProfit] = useState("1");
  const [stopLoss, setStopLoss] = useState("0.5");
  
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("janggo_bitget_apiKey") || "");
  const [secretKey, setSecretKey] = useState(() => localStorage.getItem("janggo_bitget_secretKey") || "");
  const [passphrase, setPassphrase] = useState(() => localStorage.getItem("janggo_bitget_passphrase") || "");

  useEffect(() => {
    localStorage.setItem("janggo_bitget_apiKey", apiKey);
  }, [apiKey]);
  useEffect(() => {
    localStorage.setItem("janggo_bitget_secretKey", secretKey);
  }, [secretKey]);
  useEffect(() => {
    localStorage.setItem("janggo_bitget_passphrase", passphrase);
  }, [passphrase]);

  const [logs, setLogs] = useState<TradeLog[]>(() => {
    try {
      const saved = localStorage.getItem("janggo_trade_logs");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const [stats, setStats] = useState(() => {
    try {
      const saved = localStorage.getItem("janggo_trade_stats");
      return saved ? JSON.parse(saved) : { winCount: 0, lossCount: 0, totalProfit: 0, initialEquity: null, currentEquity: null };
    } catch {
      return { winCount: 0, lossCount: 0, totalProfit: 0, initialEquity: null, currentEquity: null };
    }
  });

  useEffect(() => {
    localStorage.setItem("janggo_trade_logs", JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem("janggo_trade_stats", JSON.stringify(stats));
  }, [stats]);
  const [activeTab, setActiveTab] = useState<"analysis" | "trading">("analysis");
  const [analysisView, setAnalysisView] = useState<"indicators" | "live">("indicators");
  const [showScript, setShowScript] = useState(false);
  const [customUrl, setCustomUrl] = useState("https://janggo-algorithmic-trader.vercel.app");
  
  const lastSignalRef = useRef<Record<string, Decision>>({});

  const effectiveApiUrl = customUrl || window.location.origin.replace(/\/+$/, "");

  const appsScriptCode = `/**
 * 🚀 비트겟 선물 자동매매 전문 스크립트 (Bitget Futures v3.7.0)
 * 
 * [중요 설정 안내]
 * 본 스크립트는 Vercel을 포함한 외부 배포 주소와 연동하여 사용 가능합니다.
 * 
 * 👉 해결 방법:
 * 1. 앱 우측 상단 톱니바퀴(Settings) -> [Deploy to Vercel/Cloud Run] 클릭
 * 2. 배포가 완료된 후 발급되는 외부 접속 주소(URL)를 복사
 * 3. 아래 API_URL 사이에 해당 주소를 붙여넣으세요.
 */
const API_URL = "${effectiveApiUrl}"; // 여기에 배포된 Vercel/Cloud Run 주소를 붙여넣으세요.
const SYMBOL = "${symbol}"; 
const SIZE = "${orderSize}";
const TAKE_PROFIT = "${takeProfit}";
const STOP_LOSS = "${stopLoss}";

function main() {
  Logger.log("--- 분석 프로세스 시작 ---");
  
  if (API_URL.indexOf("ai.studio") !== -1 || API_URL.indexOf("-dev-") !== -1 || API_URL.indexOf("-pre-") !== -1) {
    Logger.log("❌ 오류: 프리뷰 주소(" + API_URL + ")는 보안상 외부 접근이 불가능합니다.");
    Logger.log("해결: Vercel이나 Cloud Run으로 배포한 후, 발급된 새로운 주소를 여기에 입력하세요.");
    return;
  }
  
  try {
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ symbol: SYMBOL }),
      muteHttpExceptions: true,
      followRedirects: false
    };
    
    // 이중 슬래시 방지 처리
    const targetUrl = (API_URL + "/api/analyze").replace(/([^:]\\/)\\/+/g, "$1");
    
    const res = UrlFetchApp.fetch(targetUrl, options);
    const code = res.getResponseCode();
    const content = res.getContentText();
    
    Logger.log("대상 URL : " + targetUrl);
    Logger.log("응답 코드: " + code);

    if (code === 302 || code === 301 || code === 307) {
      Logger.log("❌ 오류 " + code + ": 접근이 차단되었습니다 (로그인 페이지로 리다이렉트 됨).");
      Logger.log("원인: 앱이 비공개(Private) 상태이거나 잘못된 주소를 사용 중입니다.");
      Logger.log("해결: Share 버튼을 눌러 'Anyone with the link'로 설정한 Public URL을 사용하세요.");
      return;
    }

    if (code === 404) {
      Logger.log("❌ 오류 404: 경로를 찾을 수 없습니다.");
      Logger.log("원인: API 주소가 잘못되었습니다. 앱 상단의 주소를 정확히 복사했는지 확인하세요.");
      return;
    }

    if (code === 401 || code === 403) {
      Logger.log("❌ 오류 " + code + ": 접근 거부.");
      Logger.log("해결: 앱 우측 상단 'Share' 버튼을 눌러 'Anyone with the link' (Public)로 설정하세요.");
      return;
    }

    if (code === 500) {
      Logger.log("❌ 오류 500: 서버 내부 오류가 발생했습니다.");
      Logger.log("원인: Vercel 서버 재배포가 안 되었거나, 앱 내부 API 환경변수가 올바르지 않습니다.");
      Logger.log("해결: 우측 상단 Settings에서 [Deploy to Vercel]을 다시 실행하여 최신 코드를 배포해주세요.");
      Logger.log("상세 에러: " + content.substring(0, 50));
      return;
    }

    if (content.toLowerCase().indexOf("<!doctype") !== -1 || content.toLowerCase().indexOf("<html") !== -1) {
      Logger.log("❌ 오류: 서버가 JSON 대신 HTML을 반환했습니다.");
      Logger.log("원인: 주소가 부정확하거나 서버 상태가 올바르지 않습니다.");
      return;
    }

    let data;
    try {
      data = JSON.parse(content);
    } catch (e) {
      Logger.log("❌ JSON 파싱 실패: " + content.substring(0, 100));
      return;
    }

    Logger.log("✅ 신호 분석: " + data.decision + " (" + data.analysis_summary + ")");

    if (data.decision === "LONG" || data.decision === "SHORT") {
      const tradeRes = UrlFetchApp.fetch(API_URL + "/api/trade/execute", {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          side: data.decision,
          symbol: SYMBOL,
          amount: SIZE,
          takeProfit: TAKE_PROFIT,
          stopLoss: STOP_LOSS
        }),
        muteHttpExceptions: true
      });
      Logger.log("주문 실행 결과: " + tradeRes.getContentText());
    }
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName("TradeLogs");
    if (!sheet) {
      sheet = spreadsheet.insertSheet("TradeLogs");
      sheet.appendRow(["Timestamp", "Symbol", "Decision", "Analysis"]);
    }
    sheet.appendRow([new Date(), SYMBOL, data.decision, data.analysis_summary]);
    
  } catch (e) {
    Logger.log("❌ 실행 오류: " + e.toString());
  }
}
`;

  const executeTrade = async (side: "LONG" | "SHORT", amount: string, isAuto: boolean = false) => {
    try {
      const response = await fetch(effectiveApiUrl + "/api/trade/execute", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(apiKey ? { "x-bitget-api-key": apiKey } : {}),
          ...(secretKey ? { "x-bitget-secret-key": secretKey } : {}),
          ...(passphrase ? { "x-bitget-passphrase": passphrase } : {})
        },
        body: JSON.stringify({ side, symbol, amount, takeProfit, stopLoss }),
      });
      
      const contentType = response.headers.get("content-type");
      let data: any = {};
      
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error("Trade Execution Non-JSON:", text);
        data = { error: "서버 응답 형식이 올바르지 않습니다." };
      }
      
      const newLog: TradeLog = {
        id: Math.random().toString(36).substr(2, 9),
        side,
        symbol,
        amount,
        timestamp: new Date().toLocaleTimeString(),
        status: response.ok ? "SUCCESS" : "FAILED",
        reason: data.error
      };
      
      setLogs(prev => [newLog, ...prev].slice(0, 50));
      return response.ok;
    } catch (err) {
      console.error("Trade Execution Error:", err);
      return false;
    }
  };

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const performAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(effectiveApiUrl + "/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, granularity }),
      });
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response received:", text);
        throw new Error("서버가 JSON 대신 HTML(웹페이지)을 반환했습니다. 앱을 새로고침하거나 공개 설정을 확인하세요.");
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed");
      
      setAnalysis(data);

      // Auto Trading Logic
      const currentCacheKey = `${symbol}_${granularity}`;
      const isFirstView = !(currentCacheKey in lastSignalRef.current);
      const previousDecision = lastSignalRef.current[currentCacheKey] || "HOLD";
      
      if (!isFirstView && isAutoTrade && data.decision !== "HOLD" && data.decision !== previousDecision) {
        executeTrade(data.decision, orderSize, true);
      }
      
      // Update ref anyway so it tracks properly even if auto trade is off
      lastSignalRef.current[currentCacheKey] = data.decision;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    performAnalysis();
    const interval = setInterval(performAnalysis, 5 * 60 * 1000); 
    return () => clearInterval(interval);
  }, [isAutoTrade, symbol, granularity]);

  useEffect(() => {
    let balanceInterval: ReturnType<typeof setInterval>;
    
    const fetchBalance = async () => {
      try {
        const res = await fetch(effectiveApiUrl + "/api/trade/balance", {
          headers: {
            ...(apiKey ? { "x-bitget-api-key": apiKey } : {}),
            ...(secretKey ? { "x-bitget-secret-key": secretKey } : {}),
            ...(passphrase ? { "x-bitget-passphrase": passphrase } : {})
          }
        });
        if (res.ok) {
          const data = await res.json();
          setStats((prev: any) => {
            const currentEq = data.equity;
            const isInitial = prev.initialEquity === null;
            const newProfit = isInitial ? 0 : currentEq - prev.initialEquity;
            
            // Check for realized jump (a simple heuristic for closed trades since we don't fetch order history here)
            let wCount = prev.winCount;
            let lCount = prev.lossCount;
            
            // If the PnL changes by more than $1 USDT suddenly (realized), we count it as a trade closing
            const diff = prev.currentEquity !== null ? currentEq - prev.currentEquity : 0;
            if (Math.abs(diff) > 1.0) {
              if (diff > 0) wCount++;
              else lCount++;
            }

            return {
              ...prev,
              initialEquity: isInitial ? currentEq : prev.initialEquity,
              currentEquity: currentEq,
              totalProfit: newProfit,
              unrealizedPL: data.unrealizedPL,
              winCount: wCount,
              lossCount: lCount
            };
          });
        }
      } catch (e) {
        console.error("Failed to fetch balance", e);
      }
    };

    if (isAutoTrade) {
      balanceInterval = setInterval(fetchBalance, 30000); // 30 seconds
    }
    fetchBalance(); // Always fetch on mount or when dependencies change
    return () => clearInterval(balanceInterval);
  }, [isAutoTrade, effectiveApiUrl]);

  const getStatusColor = (decision: Decision) => {
    switch (decision) {
      case "LONG": return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      case "SHORT": return "text-rose-500 bg-rose-500/10 border-rose-500/20";
      default: return "text-slate-400 bg-slate-400/10 border-slate-400/20";
    }
  };

  const getStatusIcon = (decision: Decision) => {
    switch (decision) {
      case "LONG": return <TrendingUp className="w-8 h-8" />;
      case "SHORT": return <TrendingDown className="w-8 h-8" />;
      default: return <Minus className="w-8 h-8" />;
    }
  };

  const chartData = analysis ? analysis.lastPrices.map((price, i) => ({
    time: i,
    price,
    rsi: analysis.indicators.rsi[i] || 0,
    macd: analysis.indicators.macd[i]?.MACD || 0,
    signal: analysis.indicators.macd[i]?.signal || 0,
    histogram: analysis.indicators.macd[i]?.histogram || 0,
  })) : [];

  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-200 font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <BarChart2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">Janggo Algorithmic Trader</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">v3.7.0</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <p className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    LIVE_SYSTEM
                  </span>
                  <span className="text-[#30363d]">|</span>
                  <span>UTC: {currentTime.toISOString().split('T')[1].split('.')[0]}</span>
                  {isAutoTrade && (
                    <span className="flex items-center gap-1 text-blue-500 font-bold">
                      <span className="text-[#30363d]">|</span>
                      AUTOTRADE_ON
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-[#161b22] p-1 rounded-lg border border-[#30363d]">
             <button 
               onClick={() => setActiveTab("analysis")}
               className={cn("px-4 py-1.5 text-xs font-medium rounded-md transition-all", activeTab === "analysis" ? "bg-[#30363d] text-white" : "text-slate-500 hover:text-slate-300")}
             >
               ANALYSIS
             </button>
             <button 
               onClick={() => setActiveTab("trading")}
               className={cn("px-4 py-1.5 text-xs font-medium rounded-md transition-all", activeTab === "trading" ? "bg-[#30363d] text-white" : "text-slate-500 hover:text-slate-300")}
             >
               TRADING
             </button>
          </div>
        </header>

        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-3 text-rose-500 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === "analysis" ? (
            <motion.div 
              key="analysis"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 bg-[#161b22] p-1 rounded-lg border border-[#30363d]">
                  <button 
                    onClick={() => setAnalysisView("indicators")}
                    className={cn("px-4 py-1 text-[10px] font-bold rounded transition-all", analysisView === "indicators" ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300")}
                  >
                    INDICATORS
                  </button>
                  <button 
                    onClick={() => setAnalysisView("live")}
                    className={cn("px-4 py-1 text-[10px] font-bold rounded transition-all", analysisView === "live" ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300")}
                  >
                    LIVE_CHART
                  </button>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
                  <select 
                    value={symbol} 
                    onChange={(e) => setSymbol(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 text-blue-400 cursor-pointer"
                  >
                    <option value="BTCUSDT">BTC/USDT</option>
                    <option value="ETHUSDT">ETH/USDT</option>
                  </select>
                  <div className="w-px h-3 bg-[#30363d]" />
                  <select 
                    value={granularity} 
                    onChange={(e) => setGranularity(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 text-slate-400 cursor-pointer text-xs"
                  >
                    <option value="15m">15m</option>
                    <option value="1H">1H</option>
                    <option value="4H">4H</option>
                    <option value="1D">1D</option>
                  </select>
                </div>
              </div>

              {analysisView === "live" ? (
                <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-2 h-[600px] overflow-hidden shadow-2xl relative group">
                  <div className="absolute top-4 left-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg">LIVE BITGET FEED</span>
                  </div>
                  <iframe 
                    src={`https://s.tradingview.com/widgetembed/?symbol=BITGET:${symbol}.P&interval=${granularity === '1H' ? '60' : granularity === '15m' ? '15' : granularity === '4H' ? '240' : 'D'}&theme=dark&style=1&timezone=Etc%2FUTC&studies=%5B%5D&locale=en`}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    allowFullScreen
                    className="rounded-xl"
                  ></iframe>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <motion.div 
                      className={cn(
                        "md:col-span-1 border rounded-2xl p-6 flex flex-col justify-center items-center text-center space-y-4 shadow-2xl transition-all duration-500",
                        analysis ? getStatusColor(analysis.decision) : "border-[#30363d] bg-[#161b22]"
                      )}
                    >
                      <div className="text-sm font-medium opacity-60 uppercase tracking-widest">Target Signal</div>
                      <div className="p-4 rounded-full bg-white/5 border border-white/10">
                        {analysis ? getStatusIcon(analysis.decision) : <RefreshCw className="w-8 h-8 animate-spin opacity-20" />}
                      </div>
                      <div className="text-4xl font-black tracking-tighter">
                        {loading ? "ANALYZING..." : (analysis?.decision || "HOLD")}
                      </div>
                    </motion.div>
    
                    <div className="md:col-span-2 bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col justify-between">
                      <div>
                        <h3 className="text-slate-500 text-xs font-mono mb-4 uppercase tracking-widest flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          Logic Summary (Korean)
                        </h3>
                        <p className="text-xl font-medium leading-relaxed text-slate-100">
                          {loading ? "분석 중입니다..." : (analysis?.analysis_summary || "데이터를 불러오는 중...")}
                        </p>
                      </div>
                      <div className="mt-6 flex items-center gap-4 text-xs font-mono text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">RSI:</span>
                          <span className={cn(analysis && (analysis.indicators.rsi[analysis.indicators.rsi.length - 1] < 30 ? "text-emerald-500" : analysis.indicators.rsi[analysis.indicators.rsi.length - 1] > 70 ? "text-rose-500" : ""))}>
                            {analysis?.indicators.rsi[analysis.indicators.rsi.length - 1].toFixed(2) || "0.00"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
    
                  {/* Strategy Checklist */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
                       <h3 className="text-sm font-bold text-emerald-500 mb-4 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" />
                          LONG Entry Checklist
                       </h3>
                       <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 bg-[#0d1117] rounded-xl border border-[#30363d]">
                             <span className="text-xs text-slate-400">RSI 30 이하에서 반등 (과매도 탈출)</span>
                             {analysis && (analysis.indicators.rsi[analysis.indicators.rsi.length - 2] <= 30 && analysis.indicators.rsi[analysis.indicators.rsi.length - 1] > analysis.indicators.rsi[analysis.indicators.rsi.length - 2]) ? 
                               <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"><Play className="w-3 h-3 text-white fill-current" /></div> : 
                               <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700" />
                             }
                          </div>
                          <div className="flex items-center justify-between p-3 bg-[#0d1117] rounded-xl border border-[#30363d]">
                             <span className="text-xs text-slate-400">MACD 골든 크로스 (Signal 돌파)</span>
                             {analysis && analysis.indicators.macd.length >= 2 && 
                              (analysis.indicators.macd[analysis.indicators.macd.length - 2]?.MACD! < analysis.indicators.macd[analysis.indicators.macd.length - 2]?.signal! && 
                               analysis.indicators.macd[analysis.indicators.macd.length - 1]?.MACD! > analysis.indicators.macd[analysis.indicators.macd.length - 1]?.signal!) ? 
                               <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"><Play className="w-3 h-3 text-white fill-current" /></div> : 
                               <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700" />
                             }
                          </div>
                       </div>
                    </div>
    
                    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
                       <h3 className="text-sm font-bold text-rose-500 mb-4 flex items-center gap-2">
                          <TrendingDown className="w-4 h-4" />
                          SHORT Entry Checklist
                       </h3>
                       <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 bg-[#0d1117] rounded-xl border border-[#30363d]">
                             <span className="text-xs text-slate-400">RSI 70 이상에서 하락 반전 (과열 해소)</span>
                             {analysis && (analysis.indicators.rsi[analysis.indicators.rsi.length - 2] >= 70 && analysis.indicators.rsi[analysis.indicators.rsi.length - 1] < analysis.indicators.rsi[analysis.indicators.rsi.length - 2]) ? 
                               <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center"><Square className="w-3 h-3 text-white fill-current" /></div> : 
                               <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700" />
                             }
                          </div>
                          <div className="flex items-center justify-between p-3 bg-[#0d1117] rounded-xl border border-[#30363d]">
                             <span className="text-xs text-slate-400">MACD 데드 크로스 (Signal 하향)</span>
                             {analysis && analysis.indicators.macd.length >= 2 && 
                              (analysis.indicators.macd[analysis.indicators.macd.length - 2]?.MACD! > analysis.indicators.macd[analysis.indicators.macd.length - 2]?.signal! && 
                               analysis.indicators.macd[analysis.indicators.macd.length - 1]?.MACD! < analysis.indicators.macd[analysis.indicators.macd.length - 1]?.signal!) ? 
                               <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center"><Square className="w-3 h-3 text-white fill-current" /></div> : 
                               <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700" />
                             }
                          </div>
                       </div>
                    </div>
                  </div>
    
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 h-[400px]">
                       <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest flex items-center gap-2">
                             <BarChart2 className="w-3 h-3" />
                             MACD & Price Convergence
                          </h3>
                          {analysis && analysis.indicators.macd.length > 0 && (
                            <div className="text-[10px] flex items-center gap-2">
                               <span className={cn("px-2 py-0.5 rounded", (analysis.indicators.macd[analysis.indicators.macd.length - 1]?.MACD || 0) > (analysis.indicators.macd[analysis.indicators.macd.length - 1]?.signal || 0) ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                                  {(analysis.indicators.macd[analysis.indicators.macd.length - 1]?.MACD || 0) > (analysis.indicators.macd[analysis.indicators.macd.length - 1]?.signal || 0) ? "BULLISH CROSS" : "BEARISH CROSS"}
                               </span>
                            </div>
                          )}
                       </div>
                       <ResponsiveContainer width="100%" height="90%" minWidth={1} minHeight={1}>
                          <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                            <XAxis dataKey="time" hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ backgroundColor: '#0d1117', border: '1px solid #30363d', borderRadius: '8px' }} />
                            <Bar dataKey="histogram" fill="#475569" opacity={0.3} />
                            <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="macd" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                            <Line type="monotone" dataKey="signal" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
                          </ComposedChart>
                       </ResponsiveContainer>
                    </div>
                    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 h-[400px]">
                       <h3 className="text-xs font-mono text-slate-500 mb-4 uppercase tracking-widest flex items-center justify-between">
                         Relative Strength Index (14)
                         <span className="text-[10px] text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded">Strategy Zones</span>
                       </h3>
                       <ResponsiveContainer width="100%" height="90%" minWidth={1} minHeight={1}>
                          <AreaChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                            <XAxis dataKey="time" hide />
                            <YAxis domain={[0, 100]} ticks={[30, 70]} tick={{ fill: '#4b5563', fontSize: 10 }} />
                            <Tooltip contentStyle={{ backgroundColor: '#0d1117', border: '1px solid #30363d', borderRadius: '8px' }} />
                            <ReferenceLine y={70} stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'right', value: 'SHORT ZONE', fill: '#f43f5e', fontSize: 10 }} />
                            <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" label={{ position: 'right', value: 'LONG ZONE', fill: '#10b981', fontSize: 10 }} />
                            <Line type="monotone" dataKey="rsi" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                            <Area type="monotone" dataKey="rsi" fill="#8b5cf6" fillOpacity={0.1} />
                          </AreaChart>
                       </ResponsiveContainer>
                    </div>
                  </div>
    
                  {/* Strategy Explanation Card */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                           <Info className="w-4 h-4 text-blue-500" />
                           How to LONG (Buy)
                        </h4>
                        <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                           <li>RSI가 <span className="text-emerald-500 font-bold">30 이하</span>에서 반등 (과매도 탈출)</li>
                           <li>MACD Line이 Signal Line을 <span className="text-emerald-500 font-bold">상향 돌파 (Golden Cross)</span></li>
                        </ul>
                     </div>
                     <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                           <Info className="w-4 h-4 text-rose-500" />
                           How to SHORT (Sell)
                        </h4>
                        <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                           <li>RSI가 <span className="text-rose-500 font-bold">70 이상</span>에서 하락 반전 (과열 해소)</li>
                           <li>MACD Line이 Signal Line을 <span className="text-rose-500 font-bold">하향 돌파 (Dead Cross)</span></li>
                        </ul>
                     </div>
                  </div>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="trading"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {/* Bot Controller */}
              <div className="md:col-span-1 space-y-6">
                <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                       <Zap className="w-4 h-4 text-emerald-500" />
                       Trading Bot
                    </h3>
                    <div 
                      onClick={() => setIsAutoTrade(!isAutoTrade)}
                      className={cn(
                        "w-10 h-5 rounded-full cursor-pointer transition-all relative border border-[#30363d]",
                        isAutoTrade ? "bg-emerald-500" : "bg-[#21262d]"
                      )}
                    >
                      <div className={cn("absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all", isAutoTrade ? "left-5.5" : "left-1")} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                       <label className="text-xs text-slate-500 font-mono uppercase">Order Size (USDT)</label>
                       <input 
                         type="number"
                         value={orderSize}
                         onChange={(e) => setOrderSize(e.target.value)}
                         className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                       />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mt-4">
                       <div className="space-y-1.5">
                          <label className="text-xs text-slate-500 font-mono uppercase text-emerald-500/80">Take Profit (%)</label>
                          <input 
                            type="number"
                            value={takeProfit}
                            onChange={(e) => setTakeProfit(e.target.value)}
                            className="w-full bg-[#0d1117] border border-emerald-500/20 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            placeholder="0 (Off)"
                          />
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-xs text-slate-500 font-mono uppercase text-rose-500/80">Stop Loss (%)</label>
                          <input 
                            type="number"
                            value={stopLoss}
                            onChange={(e) => setStopLoss(e.target.value)}
                            className="w-full bg-[#0d1117] border border-rose-500/20 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
                            placeholder="0 (Off)"
                          />
                       </div>
                    </div>

                    {/* API Keys Settings */}
                    <div className="pt-4 border-t border-[#30363d] space-y-3">
                      <h4 className="text-xs font-bold text-slate-400 flex items-center gap-2">
                        <Settings className="w-3 h-3" />
                        Bitget API Settings
                      </h4>
                      <div className="space-y-2">
                        <input 
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="API Key (공란 시 서버 기본값)"
                        />
                        <input 
                          type="password"
                          value={secretKey}
                          onChange={(e) => setSecretKey(e.target.value)}
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Secret Key (공란 시 서버 기본값)"
                        />
                        <input 
                          type="password"
                          value={passphrase}
                          onChange={(e) => setPassphrase(e.target.value)}
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Passphrase (공란 시 서버 기본값)"
                        />
                      </div>
                    </div>

                    <div className="pt-4 grid grid-cols-2 gap-3">
                       <button 
                         onClick={() => executeTrade("LONG", orderSize)}
                         className="flex items-center justify-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500/20 transition-all"
                       >
                         <Play className="w-4 h-4 fill-current" />
                         LONG
                       </button>
                       <button 
                         onClick={() => executeTrade("SHORT", orderSize)}
                         className="flex items-center justify-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-500 py-2 rounded-lg text-sm font-medium hover:bg-rose-500/20 transition-all"
                       >
                         <Square className="w-4 h-4 fill-current" />
                         SHORT
                       </button>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-blue-400">
                       <Shield className="w-3 h-3" />
                       AUTO-PILOT STATUS
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      자동 매매는 RSI/MACD 변동 시 즉시 체결됩니다. 비트겟 API 키가 서버 설정에 등록되어 있어야 작동합니다.
                    </p>
                  </div>
                </div>

                <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
                   <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-tighter">
                     <Settings className="w-4 h-4 text-slate-500" />
                     Apps Script 연동 가이드
                   </h3>
                   <div className="space-y-4">
                     <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-2">
                        <p className="text-[10px] text-blue-400 font-bold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> [중요] 외부 배포(Vercel/Cloud Run) 필수
                        </p>
                        <p className="text-[10px] text-slate-300 leading-relaxed">
                          현재 AI Studio 환경의 프리뷰 주소로는 앱의 보안 정책상 트레이딩 봇 서버(/api/*)로의 원격 접근 시 302/401 에러가 발생합니다.<br/>
                          안정적인 자동매매를 위해서는 우측 상단의 <strong>톱니바퀴 (Settings)</strong>에서 <strong>[Deploy to Vercel]</strong> 또는 <strong>[Deploy to Cloud Run]</strong>을 클릭하여 배포해야 합니다.<br/>
                          배포 완료 후 발급되는 <strong>새로운 URL (예: vercel.app)</strong>을 복사하여 아래 테스트 버튼이나 스크립트에 사용하세요.
                        </p>
                     </div>

                     <div className="space-y-1.5 pt-2">
                        <label className="text-[10px] text-slate-500 font-mono uppercase">API URL (이곳에 배포된 외부 주소 입력)</label>
                        <input 
                          type="text"
                          value={customUrl}
                          onChange={(e) => setCustomUrl(e.target.value.trim().replace(/\/+$/, ""))}
                          placeholder={effectiveApiUrl}
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-[10px] font-mono focus:outline-none focus:border-blue-500 text-slate-300"
                        />
                     </div>

                     <div className="grid grid-cols-2 gap-2 mt-4">
                       <button 
                         onClick={async () => {
                           try {
                             const res = await fetch(effectiveApiUrl + "/api/analyze", { method: "POST" });
                             const code = res.status;
                             if (code === 401 || code === 403) {
                               alert("❌ 오류 401/403: 접근이 거부되었습니다. 앱이 'Public(Anyone with link)'으로 설정되었는지 확인하세요.");
                             } else if (code === 404) {
                               alert("❌ 오류 404: 주소를 찾을 수 없습니다. (경로 오류)");
                             } else if (res.headers.get("content-type")?.includes("text/html")) {
                               alert("❌ 오류: 서버가 HTML을 반환합니다. (공개 설정 문제일 가능성 높음)");
                             } else {
                               alert("✅ 성공: 연결되었습니다! (Status: " + code + ")");
                             }
                           } catch (e) {
                             alert("❌ 연결 실패. 앱 공개 설정을 확인하세요.");
                           }
                         }}
                         className="py-2 bg-[#21262d] border border-[#30363d] rounded-lg text-[10px] font-mono hover:bg-[#30363d] transition-all"
                       >
                         TEST_CONNECT
                       </button>
                       <button 
                         onClick={() => setShowScript(true)}
                         className="py-2 bg-blue-600 border border-blue-500 rounded-lg text-[10px] font-mono text-white hover:bg-blue-700 transition-all font-bold"
                       >
                         COPY_SCRIPT
                       </button>
                     </div>
                   </div>
                </div>
              </div>

               {/* Apps Script Modal */}
               {showScript && (
                 <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                   <motion.div 
                     initial={{ scale: 0.9, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     className="bg-[#161b22] border border-[#30363d] rounded-2xl max-w-3xl w-full max-h-[80vh] flex flex-col overflow-hidden"
                   >
                     <div className="p-4 border-b border-[#30363d] flex items-center justify-between">
                        <h3 className="font-bold text-white">Google Apps Script Snippet</h3>
                        <button onClick={() => setShowScript(false)} className="p-1 hover:bg-[#30363d] rounded-md transition-all">
                           <Square className="w-4 h-4 rotate-45" />
                        </button>
                     </div>
                     <div className="flex-1 overflow-auto p-4 bg-[#0d1117] font-mono text-xs text-slate-400">
                        <pre>{appsScriptCode}</pre>
                     </div>
                     <div className="p-4 border-t border-[#30363d] flex items-center justify-end gap-3">
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(appsScriptCode);
                            alert("Copied to clipboard!");
                          }}
                          className="px-4 py-2 bg-white text-black font-bold rounded-lg text-sm flex items-center gap-2 hover:bg-slate-200 transition-all"
                        >
                           <Copy className="w-4 h-4" />
                           COPY_CODE
                        </button>
                     </div>
                   </motion.div>
                 </div>
               )}

              {/* Execution Logs & Stats */}
              <div className="md:col-span-2 flex flex-col gap-4 h-full">
                 {/* Stats Board */}
                 <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 relative">
                    <button 
                      onClick={() => setStats({ winCount: 0, lossCount: 0, totalProfit: 0, initialEquity: null, currentEquity: null, unrealizedPL: 0 })}
                      className="absolute top-4 right-4 text-[10px] text-slate-500 hover:text-white transition-colors uppercase font-mono"
                    >
                      Reset Stats
                    </button>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 font-mono uppercase">Total Trades</span>
                        <span className="text-xl font-bold text-white font-mono">{stats.winCount + stats.lossCount + (logs.length > 0 ? logs.length : 0)}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 font-mono uppercase">Profit / Loss (USDT)</span>
                        <div className="flex items-baseline gap-2">
                          <span className={cn("text-xl font-bold font-mono", stats.totalProfit >= 0 ? "text-emerald-500" : "text-rose-500")}>
                            {stats.totalProfit > 0 ? "+" : ""}{stats.totalProfit.toFixed(2)}
                          </span>
                          <span className={cn("text-[10px] font-mono", stats.unrealizedPL >= 0 ? "text-emerald-500/70" : "text-rose-500/70")}>
                             (Open: {stats.unrealizedPL > 0 ? "+" : ""}{(stats.unrealizedPL || 0).toFixed(2)})
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 font-mono uppercase">Win Rate</span>
                        <span className="text-xl font-bold text-white font-mono">
                           {stats.winCount + stats.lossCount > 0 
                             ? ((stats.winCount / (stats.winCount + stats.lossCount)) * 100).toFixed(1)
                             : "0.0"}%
                        </span>
                      </div>
                    </div>
                 </div>

                 <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col flex-1 min-h-0">
                   <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
                      <History className="w-4 h-4 text-slate-500" />
                      Execution History
                   </h3>

                   <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                     {logs.length === 0 ? (
                     <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                        <History className="w-12 h-12 mb-2" />
                        <p className="text-sm">No trades executed yet</p>
                     </div>
                   ) : (
                     logs.map((log) => (
                       <div key={log.id} className="flex items-center justify-between p-3 bg-[#0d1117] border border-[#30363d] rounded-xl group hover:border-slate-600 transition-all">
                          <div className="flex items-center gap-4">
                             <div className={cn("p-2 rounded-lg", log.side === "LONG" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                                {log.side === "LONG" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                             </div>
                             <div>
                                <div className="text-sm font-bold flex items-center gap-2">
                                   {log.side} {log.symbol}
                                   <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase font-mono", log.status === "SUCCESS" ? "bg-emerald-500/20 text-emerald-500" : "bg-rose-500/20 text-rose-500")}>
                                      {log.status}
                                   </span>
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                   {log.timestamp} • {log.amount} USDT • {log.reason || "Executed by Expert Bot"}
                                </div>
                             </div>
                          </div>
                          <div className="text-xs font-mono text-slate-600 group-hover:text-slate-400 transition-all">
                             ID_{log.id}
                          </div>
                       </div>
                     ))
                   )}
                 </div>
              </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer info */}
        <footer className="text-center p-8">
           <p className="text-[#30363d] text-[10px] font-mono leading-relaxed max-w-2xl mx-auto">
             STRATEGY_RULES: RSI_OVERSOLD_EXIT (30) OR MACD_GOLDEN_CROSS == LONG | RSI_OVERBOUGHT_FALLING (70) OR MACD_DEAD_CROSS == SHORT<br/>
             SYSTEM_STATUS: OPERATIONAL | DATA_SOURCE: BITGET_V2_MIX_API | IA_MODEL: GEMINI_FLASH_LATEST<br/>
             DISCLAIMER: FUTURES_QUANT_TRADING_INVOLVES_HIGH_RISK. NO_FINANCIAL_ADVICE_INTENDED.
           </p>
        </footer>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #30363d; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4b5563; }
      `}</style>
    </div>
  );
}

