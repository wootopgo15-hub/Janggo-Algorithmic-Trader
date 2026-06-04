/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertCircle,
  BarChart2,
  Zap,
  Settings,
  Shield,
  History,
  Play,
  Square,
  Copy,
  ExternalLink,
  Info,
  Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  Bar,
  ReferenceLine,
} from "recharts";
import { cn } from "@/src/lib/utils";
import { AnalysisResult, Decision } from "./types";

interface TradeLog {
  id: string;
  side: "LONG" | "SHORT" | "CLOSE";
  symbol: string;
  amount: string;
  timestamp: string;
  status: "SUCCESS" | "FAILED";
  reason?: string;
  takeProfit?: string;
  stopLoss?: string;
  entryPrice?: number;
  tpPrice?: string;
  slPrice?: string;
  pnl?: string;
  isClose?: boolean;
  isOpenPos?: boolean;
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

  const [editingLog, setEditingLog] = useState<TradeLog | null>(null);
  const [editTakeProfit, setEditTakeProfit] = useState("");
  const [editStopLoss, setEditStopLoss] = useState("");

  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("janggo_bitget_apiKey") || "",
  );
  const [secretKey, setSecretKey] = useState(
    () => localStorage.getItem("janggo_bitget_secretKey") || "",
  );
  const [passphrase, setPassphrase] = useState(
    () => localStorage.getItem("janggo_bitget_passphrase") || "",
  );
  const [realtimePrice, setRealtimePrice] = useState<string | null>(null);

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
    } catch {
      return [];
    }
  });

  const [stats, setStats] = useState(() => {
    try {
      const saved = localStorage.getItem("janggo_trade_stats");
      return saved
        ? JSON.parse(saved)
        : {
            winCount: 0,
            lossCount: 0,
            totalProfit: 0,
            initialEquity: null,
            currentEquity: null,
            unrealizedPL: 0,
          };
    } catch {
      return {
        winCount: 0,
        lossCount: 0,
        totalProfit: 0,
        initialEquity: null,
        currentEquity: null,
        unrealizedPL: 0,
      };
    }
  });

  const [processedHistoryIds, setProcessedHistoryIds] = useState<string[]>(
    () => {
      try {
        const saved = localStorage.getItem("janggo_trade_history_ids");
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    },
  );

  useEffect(() => {
    localStorage.setItem("janggo_trade_logs", JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem("janggo_trade_stats", JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    localStorage.setItem(
      "janggo_trade_history_ids",
      JSON.stringify(processedHistoryIds),
    );
  }, [processedHistoryIds]);

  const [activeTab, setActiveTab] = useState<"analysis" | "trading">(
    "analysis",
  );
  const [analysisView, setAnalysisView] = useState<"indicators" | "live">(
    "indicators",
  );
  const [showScript, setShowScript] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [customUrl, setCustomUrl] = useState(
    "https://janggo-algorithmic-trader.vercel.app",
  );

  useEffect(() => {
    setRealtimePrice(null);
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout;

    const connectWs = () => {
      ws = new WebSocket("wss://ws.bitget.com/v2/ws/public");

      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            op: "subscribe",
            args: [
              {
                instType: "USDT-FUTURES",
                channel: "ticker",
                instId: symbol,
              },
            ],
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const res = JSON.parse(event.data);
          if (res.action === "snapshot" && res.data && res.data[0]) {
            setRealtimePrice(res.data[0].lastPr);
          }
        } catch (e) {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connectWs, 3000);
      };
    };

    connectWs();

    return () => {
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [symbol]);

  const lastSignalRef = useRef<Record<string, Decision>>({});

  const effectiveApiUrl =
    customUrl || window.location.origin.replace(/\/+$/, "");

  const appsScriptCode = `/**
 * 🚀 비트겟 선물 자동매매 전문 스크립트 (Bitget Futures v3.8.2)
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
      payload: JSON.stringify({ 
        symbol: SYMBOL,
        takeProfitPct: TAKE_PROFIT,
        stopLossPct: STOP_LOSS
      }),
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

  const currentPrice = analysis?.lastPrices?.[analysis.lastPrices.length - 1];

  const renderTargetPreview = (
    pctStr: string,
    isSl: boolean,
    side?: "LONG" | "SHORT",
    basePrice?: number,
  ) => {
    const p = basePrice || currentPrice;
    if (!p || !pctStr) return null;
    const pct = parseFloat(pctStr);
    if (isNaN(pct) || pct <= 0) return null;

    const longTarget = isSl ? p * (1 - pct / 100) : p * (1 + pct / 100);
    const shortTarget = isSl ? p * (1 + pct / 100) : p * (1 - pct / 100);

    if (side) {
      const target = side === "LONG" ? longTarget : shortTarget;
      return (
        <div className="text-[10px] text-slate-500 mt-1 font-mono">
          <span
            className={
              side === "LONG" ? "text-emerald-500/70" : "text-rose-500/70"
            }
          >
            Target: {target.toFixed(2)} USDT
          </span>
        </div>
      );
    }

    return (
      <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
        <span className="text-emerald-500/70">L: {longTarget.toFixed(2)}</span>
        <span className="text-rose-500/70">S: {shortTarget.toFixed(2)}</span>
      </div>
    );
  };

  const deleteLog = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setLogs((prev) => prev.filter((log) => log.id !== id));
  };

  const executeTrade = async (
    side: "LONG" | "SHORT",
    amount: string,
    isAuto: boolean = false,
    customTp?: string,
    customSl?: string,
    tradeSymbol?: string
  ) => {
    try {
      const activeTp = customTp ?? takeProfit;
      const activeSl = customSl ?? stopLoss;
      const tSymbol = tradeSymbol || symbol;
      const response = await fetch(effectiveApiUrl + "/api/trade/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-bitget-api-key": apiKey } : {}),
          ...(secretKey ? { "x-bitget-secret-key": secretKey } : {}),
          ...(passphrase ? { "x-bitget-passphrase": passphrase } : {}),
        },
        body: JSON.stringify({
          side,
          symbol: tSymbol,
          amount,
          takeProfit: activeTp,
          stopLoss: activeSl,
        }),
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
        symbol: tSymbol,
        amount,
        timestamp: new Date().toISOString(),
        status: response.ok ? "SUCCESS" : "FAILED",
        reason: data.error,
        takeProfit: activeTp,
        stopLoss: activeSl,
        entryPrice: data.entryPrice,
        tpPrice: data.tpPrice,
        slPrice: data.slPrice,
      };

      setLogs((prev) => [newLog, ...prev].slice(0, 50));
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

  const runAnalysisCycle = async () => {
    // 1. Target symbols for the cycle
    const targets = isAutoTrade ? ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"] : [symbol];
    
    // UI Loading state only if we are querying the active symbol and it has no data yet
    if (!analysis) setLoading(true);
    setError(null);
    
    for (const tSymbol of targets) {
      try {
        const response = await fetch(effectiveApiUrl + "/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            symbol: tSymbol, 
            granularity, 
            takeProfitPct: takeProfit, 
            stopLossPct: stopLoss 
          }),
        });

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await response.text();
          console.error("Non-JSON response received:", text);
          if (tSymbol === symbol) {
            throw new Error(
              "서버가 JSON 대신 HTML(웹페이지)을 반환했습니다. 앱을 새로고침하거나 공개 설정을 확인하세요.",
            );
          } else continue;
        }

        const data = await response.json();
        if (!response.ok) {
          if (tSymbol === symbol) throw new Error(data.error || "Analysis failed");
          else continue;
        }

        // Update UI only for the currently active tab symbol
        if (tSymbol === symbol) {
          setAnalysis(data);
        }

        // Auto Trading Logic
        const currentCacheKey = `${tSymbol}_${granularity}`;
        const isFirstView = !(currentCacheKey in lastSignalRef.current);
        const previousDecision = lastSignalRef.current[currentCacheKey] || "HOLD";

        if (
          !isFirstView &&
          isAutoTrade &&
          data.decision !== "HOLD" &&
          data.decision !== previousDecision
        ) {
          executeTrade(data.decision, orderSize, true, undefined, undefined, tSymbol);
        }

        // Update ref anyway so it tracks properly even if auto trade is off
        lastSignalRef.current[currentCacheKey] = data.decision;
      } catch (err: any) {
        if (tSymbol === symbol) setError(err.message);
      }
    }
    setLoading(false);
  };

  const performAnalysisRef = useRef(runAnalysisCycle);
  performAnalysisRef.current = runAnalysisCycle;

  useEffect(() => {
    performAnalysisRef.current();
    const interval = setInterval(() => performAnalysisRef.current(), 15 * 1000);
    return () => clearInterval(interval);
  }, [isAutoTrade, symbol, granularity]);

  const fetchBalanceRef = useRef<() => void>();

  fetchBalanceRef.current = async () => {
    try {
      const headers = {
        ...(apiKey ? { "x-bitget-api-key": apiKey } : {}),
        ...(secretKey ? { "x-bitget-secret-key": secretKey } : {}),
        ...(passphrase ? { "x-bitget-passphrase": passphrase } : {}),
      };

      const res = await fetch(effectiveApiUrl + "/api/trade/balance", {
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setStats((prev: any) => ({
          ...prev,
          initialEquity:
            prev.initialEquity === null ? data.equity : prev.initialEquity,
          currentEquity: data.equity,
          unrealizedPL: data.unrealizedPL,
        }));
      }

      // Fetch closed positions history to update real win rate
      const histRes = await fetch(effectiveApiUrl + "/api/trade/history", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ symbol }),
      });

      if (histRes.ok) {
        const rawHistData = await histRes.json();
        const histData = Array.isArray(rawHistData)
          ? rawHistData
          : rawHistData?.list || [];

        if (Array.isArray(histData)) {
          let newLogsToAdd: TradeLog[] = [];

          setProcessedHistoryIds((prevProcessed) => {
            let newProcessed = [...prevProcessed];
            let addedWins = 0;
            let addedLosses = 0;
            let addedProfit = 0;
            let hasNew = false;

            histData.forEach((pos: any) => {
              if (pos.positionId && !newProcessed.includes(pos.positionId)) {
                newProcessed.push(pos.positionId);
                const pnlVal = parseFloat(pos.netProfit || pos.pnl || "0");
                if (pnlVal > 0) addedWins++;
                else if (pnlVal < 0) addedLosses++;
                addedProfit += pnlVal;
                hasNew = true;

                newLogsToAdd.push({
                  id: pos.positionId + "_close",
                  side: "CLOSE",
                  symbol: pos.symbol || symbol,
                  amount: pos.closeTotalPos || "0",
                  timestamp:
                    pos.uTime || pos.cTime
                      ? new Date(parseInt(pos.uTime || pos.cTime)).toISOString()
                      : new Date().toISOString(),
                  status: "SUCCESS",
                  pnl: pnlVal.toFixed(2),
                  isClose: true,
                  entryPrice: parseFloat(pos.openAvgPrice || "0"),
                  tpPrice: pos.closeAvgPrice,
                });
              }
            });

            if (hasNew) {
              setStats((prevParams: any) => ({
                ...prevParams,
                winCount: prevParams.winCount + addedWins,
                lossCount: prevParams.lossCount + addedLosses,
                totalProfit: prevParams.totalProfit + addedProfit,
              }));
            }
            return newProcessed;
          });

          if (newLogsToAdd.length > 0) {
            setLogs((prev) => [...newLogsToAdd, ...prev].slice(0, 50));
          }
        }
      }

      // Fetch currently open positions
      const posRes = await fetch(effectiveApiUrl + "/api/trade/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ symbol }),
      });

      if (posRes.ok) {
        const rawPosData = await posRes.json();
        const posData = Array.isArray(rawPosData)
          ? rawPosData
          : rawPosData?.list || [];

        if (Array.isArray(posData)) {
          let openLogsToAdd: TradeLog[] = [];

          setProcessedHistoryIds((prevProcessed) => {
            let newProcessed = [...prevProcessed];

            posData.forEach((pos: any) => {
              // Bitget open positions usually have total > 0. If it's 0, it's actually closed
              const totalPos = parseFloat(pos.total || pos.available || "0");
              if (
                totalPos > 0 &&
                pos.positionId &&
                !newProcessed.includes(pos.positionId + "_open")
              ) {
                newProcessed.push(pos.positionId + "_open");
                const side =
                  pos.holdSide === "long" || pos.holdSide === "LONG"
                    ? "LONG"
                    : "SHORT";

                openLogsToAdd.push({
                  id: pos.positionId,
                  side: side,
                  symbol: pos.symbol || symbol,
                  amount: pos.total || "0",
                  timestamp:
                    pos.cTime || pos.uTime
                      ? new Date(parseInt(pos.cTime || pos.uTime)).toISOString()
                      : new Date().toISOString(),
                  status: "SUCCESS",
                  entryPrice: parseFloat(
                    pos.openAvgPrice || pos.openPrice || "0",
                  ),
                  pnl: pos.unrealizedPL || "0",
                  isClose: false,
                  isOpenPos: true,
                });
              }
            });

            return newProcessed;
          });

          if (openLogsToAdd.length > 0) {
            setLogs((prev) => [...openLogsToAdd, ...prev].slice(0, 50));
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch balance/history", e);
    }
  };

  useEffect(() => {
    if (fetchBalanceRef.current) fetchBalanceRef.current();
    const balanceInterval = setInterval(() => {
      if (fetchBalanceRef.current) fetchBalanceRef.current();
    }, 15000); // Poll every 15s regardless of auto-trade
    return () => clearInterval(balanceInterval);
  }, []); // Empty since ref covers state

  const getStatusColor = (decision: Decision) => {
    switch (decision) {
      case "LONG":
        return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      case "SHORT":
        return "text-rose-500 bg-rose-500/10 border-rose-500/20";
      default:
        return "text-slate-400 bg-slate-400/10 border-slate-400/20";
    }
  };

  const getStatusIcon = (decision: Decision) => {
    switch (decision) {
      case "LONG":
        return <TrendingUp className="w-8 h-8" />;
      case "SHORT":
        return <TrendingDown className="w-8 h-8" />;
      default:
        return <Minus className="w-8 h-8" />;
    }
  };

  const chartData = analysis
    ? analysis.lastPrices.map((price, i) => ({
        time: i,
        price,
        rsi: analysis.indicators.rsi[i] || 0,
        macd: analysis.indicators.macd[i]?.MACD || 0,
        signal: analysis.indicators.macd[i]?.signal || 0,
        histogram: analysis.indicators.macd[i]?.histogram || 0,
      }))
    : [];

  const uiStats = useMemo(() => {
    let winCount = 0;
    let lossCount = 0;
    let realizedPnl = 0;

    logs.forEach((log) => {
      if (log.isClose && log.pnl) {
        const p = parseFloat(log.pnl);
        if (p > 0) winCount++;
        else if (p < 0) lossCount++;
        realizedPnl += p;
      }
    });

    const totalTrades = logs.filter(
      (log) => !log.isClose && log.status === "SUCCESS",
    ).length;
    let winRate = "0.0";
    if (winCount + lossCount > 0) {
      winRate = ((winCount / (winCount + lossCount)) * 100).toFixed(1);
    }
    return { winCount, lossCount, realizedPnl, totalTrades, winRate };
  }, [logs]);

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
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Janggo Algorithmic Trader
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                  v3.8.2
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <p className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    LIVE_SYSTEM
                  </span>
                  <span className="text-[#30363d]">|</span>
                  <span>
                    UTC: {currentTime.toISOString().split("T")[1].split(".")[0]}
                  </span>
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
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                activeTab === "analysis"
                  ? "bg-[#30363d] text-white"
                  : "text-slate-500 hover:text-slate-300",
              )}
            >
              ANALYSIS
            </button>
            <button
              onClick={() => setActiveTab("trading")}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                activeTab === "trading"
                  ? "bg-[#30363d] text-white"
                  : "text-slate-500 hover:text-slate-300",
              )}
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
                    className={cn(
                      "px-4 py-1 text-[10px] font-bold rounded transition-all",
                      analysisView === "indicators"
                        ? "bg-blue-600 text-white"
                        : "text-slate-500 hover:text-slate-300",
                    )}
                  >
                    INDICATORS
                  </button>
                  <button
                    onClick={() => setAnalysisView("live")}
                    className={cn(
                      "px-4 py-1 text-[10px] font-bold rounded transition-all",
                      analysisView === "live"
                        ? "bg-blue-600 text-white"
                        : "text-slate-500 hover:text-slate-300",
                    )}
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
                    <option value="SOLUSDT">SOL/USDT</option>
                    <option value="XRPUSDT">XRP/USDT</option>
                  </select>
                  <div className="w-px h-3 bg-[#30363d]" />
                  <select
                    value={granularity}
                    onChange={(e) => setGranularity(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 text-slate-400 cursor-pointer text-xs"
                  >
                    <option value="15m">15m</option>
                    <option value="30m">30m</option>
                    <option value="1H">1H</option>
                    <option value="1D">1D</option>
                  </select>
                </div>
              </div>

              {analysisView === "live" ? (
                <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-2 h-[600px] overflow-hidden shadow-2xl relative group">
                  <div className="absolute top-4 left-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg">
                      LIVE BITGET FEED
                    </span>
                  </div>
                  <iframe
                    src={`https://s.tradingview.com/widgetembed/?symbol=BITGET:${symbol}.P&interval=${granularity === "1H" ? "60" : granularity === "30m" ? "30" : granularity === "15m" ? "15" : "D"}&theme=dark&style=1&timezone=Etc%2FUTC&studies=%5B%5D&locale=en`}
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
                        "md:col-span-1 border rounded-2xl p-6 flex flex-col justify-center items-center text-center space-y-4 shadow-xl transition-all duration-500",
                        analysis
                          ? getStatusColor(analysis.decision)
                          : "border-[#30363d] bg-[#161b22]",
                      )}
                    >
                      <div className="text-sm font-medium opacity-60 uppercase tracking-widest">
                        Target Signal
                      </div>
                      <div className="p-4 rounded-full bg-white/5 border border-white/10">
                        {analysis ? (
                          getStatusIcon(analysis.decision)
                        ) : (
                          <RefreshCw className="w-8 h-8 animate-spin opacity-20" />
                        )}
                      </div>
                      <div className="text-3xl lg:text-4xl font-black tracking-tighter">
                        {loading
                          ? "ANALYZING..."
                          : analysis?.decision || "HOLD"}
                      </div>
                    </motion.div>

                    <div className="md:col-span-2 bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col justify-between">
                      <div>
                        <h3 className="text-slate-500 text-xs font-mono mb-4 uppercase tracking-widest flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          Logic Summary (Korean)
                        </h3>
                        <p className="text-xl font-medium leading-relaxed text-slate-100">
                          {loading
                            ? "분석 중입니다..."
                            : analysis?.analysis_summary ||
                              "데이터를 불러오는 중..."}
                        </p>
                      </div>
                      <div className="mt-6 flex items-center gap-4 text-xs font-mono text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">RSI:</span>
                          <span
                            className={cn(
                              analysis &&
                                (analysis.indicators.rsi[
                                  analysis.indicators.rsi.length - 1
                                ] < 30
                                  ? "text-emerald-500"
                                  : analysis.indicators.rsi[
                                        analysis.indicators.rsi.length - 1
                                      ] > 70
                                    ? "text-rose-500"
                                    : ""),
                            )}
                          >
                            {analysis?.indicators.rsi[
                              analysis.indicators.rsi.length - 1
                            ].toFixed(2) || "0.00"}
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
                          <span className="text-xs text-slate-400">
                            RSI 30 이하에서 반등 (과매도 탈출)
                          </span>
                          {analysis &&
                          analysis.indicators.rsi[
                            analysis.indicators.rsi.length - 2
                          ] <= 30 &&
                          analysis.indicators.rsi[
                            analysis.indicators.rsi.length - 1
                          ] >
                            analysis.indicators.rsi[
                              analysis.indicators.rsi.length - 2
                            ] ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Play className="w-3 h-3 text-white fill-current" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700" />
                          )}
                        </div>
                        <div className="flex items-center justify-between p-3 bg-[#0d1117] rounded-xl border border-[#30363d]">
                          <span className="text-xs text-slate-400">
                            MACD 골든 크로스 (Signal 돌파)
                          </span>
                          {analysis &&
                          analysis.indicators.macd.length >= 2 &&
                          analysis.indicators.macd[
                            analysis.indicators.macd.length - 2
                          ]?.MACD! <
                            analysis.indicators.macd[
                              analysis.indicators.macd.length - 2
                            ]?.signal! &&
                          analysis.indicators.macd[
                            analysis.indicators.macd.length - 1
                          ]?.MACD! >
                            analysis.indicators.macd[
                              analysis.indicators.macd.length - 1
                            ]?.signal! ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Play className="w-3 h-3 text-white fill-current" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700" />
                          )}
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
                          <span className="text-xs text-slate-400">
                            RSI 70 이상에서 하락 반전 (과열 해소)
                          </span>
                          {analysis &&
                          analysis.indicators.rsi[
                            analysis.indicators.rsi.length - 2
                          ] >= 70 &&
                          analysis.indicators.rsi[
                            analysis.indicators.rsi.length - 1
                          ] <
                            analysis.indicators.rsi[
                              analysis.indicators.rsi.length - 2
                            ] ? (
                            <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center">
                              <Square className="w-3 h-3 text-white fill-current" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700" />
                          )}
                        </div>
                        <div className="flex items-center justify-between p-3 bg-[#0d1117] rounded-xl border border-[#30363d]">
                          <span className="text-xs text-slate-400">
                            MACD 데드 크로스 (Signal 하향)
                          </span>
                          {analysis &&
                          analysis.indicators.macd.length >= 2 &&
                          analysis.indicators.macd[
                            analysis.indicators.macd.length - 2
                          ]?.MACD! >
                            analysis.indicators.macd[
                              analysis.indicators.macd.length - 2
                            ]?.signal! &&
                          analysis.indicators.macd[
                            analysis.indicators.macd.length - 1
                          ]?.MACD! <
                            analysis.indicators.macd[
                              analysis.indicators.macd.length - 1
                            ]?.signal! ? (
                            <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center">
                              <Square className="w-3 h-3 text-white fill-current" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700" />
                          )}
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
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded",
                                (analysis.indicators.macd[
                                  analysis.indicators.macd.length - 1
                                ]?.MACD || 0) >
                                  (analysis.indicators.macd[
                                    analysis.indicators.macd.length - 1
                                  ]?.signal || 0)
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "bg-rose-500/10 text-rose-500",
                              )}
                            >
                              {(analysis.indicators.macd[
                                analysis.indicators.macd.length - 1
                              ]?.MACD || 0) >
                              (analysis.indicators.macd[
                                analysis.indicators.macd.length - 1
                              ]?.signal || 0)
                                ? "BULLISH CROSS"
                                : "BEARISH CROSS"}
                            </span>
                          </div>
                        )}
                      </div>
                      <ResponsiveContainer
                        width="100%"
                        height="90%"
                        minWidth={1}
                        minHeight={1}
                      >
                        <ComposedChart data={chartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#30363d"
                            vertical={false}
                          />
                          <XAxis dataKey="time" hide />
                          <YAxis hide domain={["auto", "auto"]} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0d1117",
                              border: "1px solid #30363d",
                              borderRadius: "8px",
                            }}
                          />
                          <Bar
                            dataKey="histogram"
                            fill="#475569"
                            opacity={0.3}
                          />
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="macd"
                            stroke="#f59e0b"
                            strokeWidth={1.5}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="signal"
                            stroke="#8b5cf6"
                            strokeWidth={1.5}
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 h-[400px]">
                      <h3 className="text-xs font-mono text-slate-500 mb-4 uppercase tracking-widest flex items-center justify-between">
                        Relative Strength Index (14)
                        <span className="text-[10px] text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded">
                          Strategy Zones
                        </span>
                      </h3>
                      <ResponsiveContainer
                        width="100%"
                        height="90%"
                        minWidth={1}
                        minHeight={1}
                      >
                        <AreaChart data={chartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#30363d"
                            vertical={false}
                          />
                          <XAxis dataKey="time" hide />
                          <YAxis
                            domain={[0, 100]}
                            ticks={[30, 70]}
                            tick={{ fill: "#4b5563", fontSize: 10 }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0d1117",
                              border: "1px solid #30363d",
                              borderRadius: "8px",
                            }}
                          />
                          <ReferenceLine
                            y={70}
                            stroke="#f43f5e"
                            strokeDasharray="3 3"
                            label={{
                              position: "right",
                              value: "SHORT ZONE",
                              fill: "#f43f5e",
                              fontSize: 10,
                            }}
                          />
                          <ReferenceLine
                            y={30}
                            stroke="#10b981"
                            strokeDasharray="3 3"
                            label={{
                              position: "right",
                              value: "LONG ZONE",
                              fill: "#10b981",
                              fontSize: 10,
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="rsi"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Area
                            type="monotone"
                            dataKey="rsi"
                            fill="#8b5cf6"
                            fillOpacity={0.1}
                          />
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
                        <li>
                          RSI가{" "}
                          <span className="text-emerald-500 font-bold">
                            30 이하
                          </span>
                          에서 반등 (과매도 탈출)
                        </li>
                        <li>
                          MACD Line이 Signal Line을{" "}
                          <span className="text-emerald-500 font-bold">
                            상향 돌파 (Golden Cross)
                          </span>
                        </li>
                      </ul>
                    </div>
                    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Info className="w-4 h-4 text-rose-500" />
                        How to SHORT (Sell)
                      </h4>
                      <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                        <li>
                          RSI가{" "}
                          <span className="text-rose-500 font-bold">
                            70 이상
                          </span>
                          에서 하락 반전 (과열 해소)
                        </li>
                        <li>
                          MACD Line이 Signal Line을{" "}
                          <span className="text-rose-500 font-bold">
                            하향 돌파 (Dead Cross)
                          </span>
                        </li>
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
                        isAutoTrade ? "bg-emerald-500" : "bg-[#21262d]",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all",
                          isAutoTrade ? "left-5.5" : "left-1",
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col bg-[#0d1117] border border-[#30363d] p-3 rounded-xl justify-center">
                      <span className="text-xs text-slate-400 font-mono mb-1">
                        LIVE PRICE
                      </span>
                      <span className="text-xl text-white font-mono font-bold flex items-center gap-1">
                        {realtimePrice ? (
                          <>
                            <span className="text-sm text-emerald-500/50">
                              $
                            </span>
                            <span className="text-emerald-400">
                              {parseFloat(realtimePrice).toLocaleString(
                                undefined,
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 6,
                                },
                              )}
                            </span>
                          </>
                        ) : (
                          <RefreshCw className="w-4 h-4 animate-spin opacity-50" />
                        )}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-2">
                      {/* 15m Indicators */}
                      <div className="flex flex-col bg-[#0d1117] border border-[#30363d] p-3 rounded-xl justify-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-blue-500/10 text-blue-400 text-[9px] px-1.5 py-0.5 rounded-bl-lg font-bold">15m</div>
                        <span className="text-xs text-slate-400 font-mono mb-1 mt-2">
                          RSI / MACD
                        </span>
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "text-lg font-mono font-bold flex items-center",
                              analysis?.indicators15m &&
                                (analysis.indicators15m.rsi[analysis.indicators15m.rsi.length - 1] < 30
                                  ? "text-emerald-400"
                                  : analysis.indicators15m.rsi[analysis.indicators15m.rsi.length - 1] > 70
                                    ? "text-rose-400"
                                    : "text-slate-200")
                            )}
                          >
                            {analysis?.indicators15m ? analysis.indicators15m.rsi[analysis.indicators15m.rsi.length - 1].toFixed(2) : <RefreshCw className="w-4 h-4 animate-spin opacity-50" />}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-mono font-bold uppercase",
                              analysis?.indicators15m && analysis.indicators15m.macd.length >= 2 &&
                                (analysis.indicators15m.macd[analysis.indicators15m.macd.length - 1]?.MACD! >
                                  analysis.indicators15m.macd[analysis.indicators15m.macd.length - 1]?.signal!
                                  ? "text-emerald-400"
                                  : "text-rose-400")
                            )}
                          >
                            {analysis?.indicators15m ? (
                              analysis.indicators15m.macd.length >= 2 ? (
                                analysis.indicators15m.macd[analysis.indicators15m.macd.length - 1]?.MACD! >
                                analysis.indicators15m.macd[analysis.indicators15m.macd.length - 1]?.signal! ? "GOLD" : "DEAD"
                              ) : "CALC"
                            ) : ""}
                          </span>
                        </div>
                      </div>

                      {/* 30m Indicators */}
                      <div className="flex flex-col bg-[#0d1117] border border-[#30363d] p-3 rounded-xl justify-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-purple-500/10 text-purple-400 text-[9px] px-1.5 py-0.5 rounded-bl-lg font-bold">30m</div>
                        <span className="text-xs text-slate-400 font-mono mb-1 mt-2">
                          RSI / MACD
                        </span>
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "text-lg font-mono font-bold flex items-center",
                              analysis?.indicators30m &&
                                (analysis.indicators30m.rsi[analysis.indicators30m.rsi.length - 1] < 30
                                  ? "text-emerald-400"
                                  : analysis.indicators30m.rsi[analysis.indicators30m.rsi.length - 1] > 70
                                    ? "text-rose-400"
                                    : "text-slate-200")
                            )}
                          >
                            {analysis?.indicators30m ? analysis.indicators30m.rsi[analysis.indicators30m.rsi.length - 1].toFixed(2) : <RefreshCw className="w-4 h-4 animate-spin opacity-50" />}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-mono font-bold uppercase",
                              analysis?.indicators30m && analysis.indicators30m.macd.length >= 2 &&
                                (analysis.indicators30m.macd[analysis.indicators30m.macd.length - 1]?.MACD! >
                                  analysis.indicators30m.macd[analysis.indicators30m.macd.length - 1]?.signal!
                                  ? "text-emerald-400"
                                  : "text-rose-400")
                            )}
                          >
                            {analysis?.indicators30m ? (
                              analysis.indicators30m.macd.length >= 2 ? (
                                analysis.indicators30m.macd[analysis.indicators30m.macd.length - 1]?.MACD! >
                                analysis.indicators30m.macd[analysis.indicators30m.macd.length - 1]?.signal! ? "GOLD" : "DEAD"
                              ) : "CALC"
                            ) : ""}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500 font-mono uppercase">
                        Order Size (USDT)
                      </label>
                      <input
                        type="number"
                        value={orderSize}
                        onChange={(e) => setOrderSize(e.target.value)}
                        className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-slate-500 font-mono text-emerald-500/80">
                            TP (%)
                          </label>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setTakeProfit("0.2")}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                            >
                              0.2%
                            </button>
                            <button
                              onClick={() => setTakeProfit("0.5")}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                            >
                              0.5%
                            </button>
                            <button
                              onClick={() => setTakeProfit("1")}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                            >
                              1%
                            </button>
                          </div>
                        </div>
                        <input
                          type="number"
                          value={takeProfit}
                          onChange={(e) => setTakeProfit(e.target.value)}
                          className="w-full bg-[#0d1117] border border-emerald-500/20 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          placeholder="0 (Off)"
                        />
                        {renderTargetPreview(takeProfit, false)}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-slate-500 font-mono text-rose-500/80">
                            SL (%)
                          </label>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setStopLoss("0.2")}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors"
                            >
                              0.2%
                            </button>
                            <button
                              onClick={() => setStopLoss("0.5")}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors"
                            >
                              0.5%
                            </button>
                            <button
                              onClick={() => setStopLoss("1")}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors"
                            >
                              1%
                            </button>
                          </div>
                        </div>
                        <input
                          type="number"
                          value={stopLoss}
                          onChange={(e) => setStopLoss(e.target.value)}
                          className="w-full bg-[#0d1117] border border-rose-500/20 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
                          placeholder="0 (Off)"
                        />
                        {renderTargetPreview(stopLoss, true)}
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

                  <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                      <Shield className="w-3 h-3" />
                      AUTO-PILOT STATUS (LIMIT ORDER)
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      자동 매매는 RSI/MACD 변동 시 즉시 체결됩니다. 수수료
                      절감을 위해 시장가(Market)가 아닌 <b>지정가(Limit)</b>로
                      진입하며 최적의 호가를 계산합니다. 비트겟 API 키가 서버
                      설정에 등록되어 있어야 작동합니다.
                    </p>
                  </div>
                </div>

                {!showGuide ? (
                  <div className="flex justify-end pt-2">
                    {showPasswordPrompt ? (
                      <div className="flex items-center gap-2 bg-[#161b22] border border-[#30363d] rounded-2xl p-1.5 pl-3">
                        <input
                          type="password"
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (passwordInput === "642264") {
                                setShowGuide(true);
                                setShowPasswordPrompt(false);
                                setPasswordInput("");
                              } else {
                                alert("비밀번호가 틀렸습니다.");
                              }
                            }
                          }}
                          placeholder="비밀번호..."
                          className="bg-transparent border-none outline-none text-xs text-slate-300 w-24 font-mono placeholder:text-slate-600"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            if (passwordInput === "642264") {
                              setShowGuide(true);
                              setShowPasswordPrompt(false);
                              setPasswordInput("");
                            } else {
                              alert("비밀번호가 틀렸습니다.");
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-600 text-white text-[10px] rounded-xl hover:bg-blue-700 transition-colors"
                        >
                          확인
                        </button>
                        <button
                          onClick={() => {
                            setShowPasswordPrompt(false);
                            setPasswordInput("");
                          }}
                          className="px-3 py-1.5 bg-[#30363d] text-slate-300 text-[10px] rounded-xl hover:bg-slate-700 transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowPasswordPrompt(true)}
                        className="p-3 text-slate-500 hover:text-white hover:bg-[#30363d] rounded-2xl transition-all border border-[#30363d] bg-[#161b22]"
                      >
                        <Settings className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center justify-between gap-2 uppercase tracking-tighter">
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-slate-500" />
                        Apps Script 연동 가이드
                      </div>
                      <button
                        onClick={() => setShowGuide(false)}
                        className="p-1 rounded-md text-slate-500 hover:text-white hover:bg-[#30363d] transition-all"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    </h3>
                    <div className="space-y-4">
                      <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-2">
                        <p className="text-[10px] text-blue-400 font-bold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> [중요] 외부
                          배포(Vercel/Cloud Run) 필수
                        </p>
                        <p className="text-[10px] text-slate-300 leading-relaxed">
                          현재 AI Studio 환경의 프리뷰 주소로는 앱의 보안 정책상
                          트레이딩 봇 서버(/api/*)로의 원격 접근 시 302/401
                          에러가 발생합니다.
                          <br />
                          안정적인 자동매매를 위해서는 우측 상단의{" "}
                          <strong>톱니바퀴 (Settings)</strong>에서{" "}
                          <strong>[Deploy to Vercel]</strong> 또는{" "}
                          <strong>[Deploy to Cloud Run]</strong>을 클릭하여
                          배포해야 합니다.
                          <br />
                          배포 완료 후 발급되는{" "}
                          <strong>새로운 URL (예: vercel.app)</strong>을
                          복사하여 아래 테스트 버튼이나 스크립트에 사용하세요.
                        </p>
                      </div>

                      <div className="space-y-1.5 pt-2">
                        <label className="text-[10px] text-slate-500 font-mono uppercase">
                          API URL (이곳에 배포된 외부 주소 입력)
                        </label>
                        <input
                          type="text"
                          value={customUrl}
                          onChange={(e) =>
                            setCustomUrl(
                              e.target.value.trim().replace(/\/+$/, ""),
                            )
                          }
                          placeholder={effectiveApiUrl}
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-[10px] font-mono focus:outline-none focus:border-blue-500 text-slate-300"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-4">
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(
                                effectiveApiUrl + "/api/analyze",
                                { method: "POST" },
                              );
                              const code = res.status;
                              if (code === 401 || code === 403) {
                                alert(
                                  "❌ 오류 401/403: 접근이 거부되었습니다. 앱이 'Public(Anyone with link)'으로 설정되었는지 확인하세요.",
                                );
                              } else if (code === 404) {
                                alert(
                                  "❌ 오류 404: 주소를 찾을 수 없습니다. (경로 오류)",
                                );
                              } else if (
                                res.headers
                                  .get("content-type")
                                  ?.includes("text/html")
                              ) {
                                alert(
                                  "❌ 오류: 서버가 HTML을 반환합니다. (공개 설정 문제일 가능성 높음)",
                                );
                              } else {
                                alert(
                                  "✅ 성공: 연결되었습니다! (Status: " +
                                    code +
                                    ")",
                                );
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
                )}
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
                      <h3 className="font-bold text-white">
                        Google Apps Script Snippet
                      </h3>
                      <button
                        onClick={() => setShowScript(false)}
                        className="p-1 hover:bg-[#30363d] rounded-md transition-all"
                      >
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
                    onClick={() => {
                      setLogs([]);
                      setProcessedHistoryIds([]);
                    }}
                    className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-[10px] text-rose-500 hover:bg-rose-500/20 transition-colors uppercase font-mono border border-rose-500/20"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reset Stats
                  </button>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 font-mono uppercase">
                        Wallet Balance
                      </span>
                      <span className="text-xl font-bold text-white font-mono">
                        {stats.currentEquity !== null
                          ? `$${stats.currentEquity.toFixed(2)}`
                          : "---"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 font-mono uppercase">
                        Total Trades
                      </span>
                      <span className="text-xl font-bold text-white font-mono">
                        {uiStats.totalTrades}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 font-mono uppercase">
                        Profit / Loss (USDT)
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "text-xl font-bold font-mono",
                            uiStats.realizedPnl >= 0
                              ? "text-emerald-500"
                              : "text-rose-500",
                          )}
                        >
                          {uiStats.realizedPnl > 0 ? "+" : ""}
                          {uiStats.realizedPnl.toFixed(2)}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-mono",
                            stats.unrealizedPL >= 0
                              ? "text-emerald-500/70"
                              : "text-rose-500/70",
                          )}
                        >
                          (Open: {stats.unrealizedPL > 0 ? "+" : ""}
                          {(stats.unrealizedPL || 0).toFixed(2)})
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 font-mono uppercase">
                        Win Rate
                      </span>
                      <span className="text-xl font-bold text-white font-mono">
                        {uiStats.winRate}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col flex-1 min-h-0">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <History className="w-4 h-4 text-slate-500" />
                      Execution History
                    </h3>
                    <button
                      onClick={() => {
                        if (fetchBalanceRef.current) fetchBalanceRef.current();
                      }}
                      title="신호 강제 새로고침"
                      className="p-1.5 text-slate-400 hover:text-white bg-[#21262d] border border-[#30363d] rounded-md hover:bg-[#30363d] transition-all flex items-center gap-1 text-[10px] uppercase font-mono"
                    >
                      <RefreshCw className="w-3 h-3" />
                      신호 확인
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                    {logs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                        <History className="w-12 h-12 mb-2" />
                        <p className="text-sm">No trades executed yet</p>
                      </div>
                    ) : (
                      logs.map((log) => (
                        <div
                          key={log.id}
                          onClick={() => {
                            setEditingLog(log);
                            setEditTakeProfit(log.takeProfit || "");
                            setEditStopLoss(log.stopLoss || "");
                          }}
                          className="flex flex-col p-4 bg-[#0d1117] border border-[#30363d] rounded-xl group hover:border-slate-600 transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  "p-2 rounded-lg",
                                  log.isClose
                                    ? "bg-slate-500/10 text-slate-400"
                                    : log.isOpenPos
                                      ? "bg-blue-500/10 text-blue-500 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                                      : log.side === "LONG"
                                        ? "bg-emerald-500/10 text-emerald-500"
                                        : "bg-rose-500/10 text-rose-500",
                                )}
                              >
                                {log.isClose ? (
                                  <History className="w-4 h-4" />
                                ) : log.isOpenPos && log.side === "LONG" ? (
                                  <TrendingUp className="w-4 h-4" />
                                ) : log.isOpenPos && log.side === "SHORT" ? (
                                  <TrendingDown className="w-4 h-4" />
                                ) : log.side === "LONG" ? (
                                  <TrendingUp className="w-4 h-4" />
                                ) : (
                                  <TrendingDown className="w-4 h-4" />
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-bold flex items-center gap-2">
                                  {log.isClose ? "CLOSED" : log.side}{" "}
                                  {log.symbol}
                                  <span
                                    className={cn(
                                      "text-[10px] px-1.5 py-0.5 rounded uppercase font-mono",
                                      log.isClose
                                        ? "bg-slate-500/20 text-slate-400"
                                        : log.isOpenPos
                                          ? "bg-blue-500/20 text-blue-400 font-bold tracking-widest animate-pulse"
                                          : log.status === "SUCCESS"
                                            ? "bg-emerald-500/20 text-emerald-500"
                                            : "bg-rose-500/20 text-rose-500",
                                    )}
                                  >
                                    {log.isClose
                                      ? "REALIZED"
                                      : log.isOpenPos
                                        ? "TRADING..."
                                        : log.status === "SUCCESS"
                                          ? "LIMIT ORDER"
                                          : log.status}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500 font-mono mt-0.5">
                                  {(() => {
                                    try {
                                      const d = new Date(log.timestamp);
                                      if (isNaN(d.getTime()))
                                        return log.timestamp;
                                      return d.toLocaleString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        second: "2-digit",
                                      });
                                    } catch (e) {
                                      return log.timestamp;
                                    }
                                  })()}{" "}
                                  • {log.amount} USDT
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-[10px] font-mono text-slate-600 group-hover:text-slate-400 transition-all text-right max-w-[120px] truncate" title={log.id}>
                                Pos_{log.id.replace('_open', '').replace('_close', '').substring(0, 8)}...
                              </div>
                              <button
                                onClick={(e) => deleteLog(e, log.id)}
                                className="text-slate-600 hover:text-rose-500 transition-colors p-1 rounded-md hover:bg-rose-500/10"
                                title="Delete log"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Order details grid */}
                          {log.isClose ? (
                            <div className="flex justify-between items-center p-3 bg-[#161b22] rounded-lg border border-[#30363d]/50">
                              <div className="flex flex-col">
                                <span className="text-[10px] text-slate-500 uppercase font-mono mb-1">
                                  Status
                                </span>
                                <span className="text-sm font-bold text-slate-200 font-mono">
                                  Position Closed
                                </span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] text-slate-500 uppercase font-mono mb-1">
                                  Realized PnL
                                </span>
                                <span
                                  className={cn(
                                    "text-lg font-bold font-mono",
                                    parseFloat(log.pnl || "0") >= 0
                                      ? "text-emerald-500"
                                      : "text-rose-500",
                                  )}
                                >
                                  {parseFloat(log.pnl || "0") > 0 ? "+" : ""}
                                  {log.pnl} USDT
                                </span>
                              </div>
                            </div>
                          ) : log.isOpenPos ? (
                            <div className="flex justify-between items-center p-3 bg-blue-500/5 rounded-lg border border-blue-500/20">
                              <div className="flex flex-col">
                                <span className="text-[10px] text-blue-400/70 uppercase font-mono mb-1">
                                  Entry Price
                                </span>
                                <span className="text-sm font-bold text-blue-100 font-mono">
                                  {log.entryPrice ? `$${log.entryPrice}` : "-"}
                                </span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] text-blue-400/70 uppercase font-mono mb-1">
                                  Unrealized PnL
                                </span>
                                <span
                                  className={cn(
                                    "text-lg font-bold font-mono",
                                    parseFloat(log.pnl || "0") >= 0
                                      ? "text-emerald-400"
                                      : "text-rose-400",
                                  )}
                                >
                                  {parseFloat(log.pnl || "0") > 0 ? "+" : ""}
                                  {log.pnl} USDT
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2 p-3 bg-[#161b22] rounded-lg border border-[#30363d]/50">
                              <div className="flex flex-col">
                                <span className="text-[10px] text-slate-500 uppercase font-mono mb-1">
                                  Limit Entry
                                </span>
                                <span className="text-sm font-bold text-slate-200 font-mono">
                                  {log.entryPrice ? `$${log.entryPrice}` : "-"}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[10px] text-emerald-500/70 uppercase font-mono mb-1">
                                  Take Profit{" "}
                                  {log.takeProfit
                                    ? `(+${log.takeProfit}%)`
                                    : ""}
                                </span>
                                <span className="text-sm font-bold text-emerald-400 font-mono">
                                  {log.tpPrice ? `$${log.tpPrice}` : "Not Set"}
                                </span>
                                {log.amount &&
                                  log.takeProfit &&
                                  log.status === "SUCCESS" && (
                                    <span className="text-[10px] text-emerald-500 mt-1">
                                      Est. +$
                                      {(
                                        (parseFloat(log.amount) *
                                          parseFloat(log.takeProfit)) /
                                        100
                                      ).toFixed(2)}{" "}
                                      USDT
                                    </span>
                                  )}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[10px] text-rose-500/70 uppercase font-mono mb-1">
                                  Stop Loss{" "}
                                  {log.stopLoss ? `(-${log.stopLoss}%)` : ""}
                                </span>
                                <span className="text-sm font-bold text-rose-400 font-mono">
                                  {log.slPrice ? `$${log.slPrice}` : "Not Set"}
                                </span>
                                {log.amount &&
                                  log.stopLoss &&
                                  log.status === "SUCCESS" && (
                                    <span className="text-[10px] text-rose-500 mt-1">
                                      Est. -$
                                      {(
                                        (parseFloat(log.amount) *
                                          parseFloat(log.stopLoss)) /
                                        100
                                      ).toFixed(2)}{" "}
                                      USDT
                                    </span>
                                  )}
                              </div>
                            </div>
                          )}

                          {(log.reason || log.status === "SUCCESS") && (
                            <div className="mt-3 text-[10px] text-slate-500 font-mono border-t border-[#30363d]/50 pt-2 text-right">
                              {log.isClose
                                ? "Position liquidated or closed via SL/TP"
                                : log.isOpenPos
                                  ? "Current active position being monitored"
                                  : log.reason ||
                                    "Executed Limit Order by AI Expert Bot"}
                            </div>
                          )}
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
            STRATEGY_RULES: RSI_OVERSOLD_EXIT (30) OR MACD_GOLDEN_CROSS == LONG
            | RSI_OVERBOUGHT_FALLING (70) OR MACD_DEAD_CROSS == SHORT
            <br />
            SYSTEM_STATUS: OPERATIONAL | DATA_SOURCE: BITGET_V2_MIX_API |
            IA_MODEL: GEMINI_FLASH_LATEST
            <br />
            DISCLAIMER: FUTURES_QUANT_TRADING_INVOLVES_HIGH_RISK.
            NO_FINANCIAL_ADVICE_INTENDED.
          </p>
        </footer>
        <AnimatePresence>
          {editingLog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={() => setEditingLog(null)}
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#0d1117] border border-[#30363d] rounded-2xl w-full max-w-sm overflow-hidden"
              >
                <div className="p-4 border-b border-[#30363d] flex justify-between items-center bg-[#161b22]">
                  <h3 className="font-bold flex items-center gap-2">
                    <History className="w-4 h-4 text-blue-400" />
                    Edit & Resend Signal
                  </h3>
                  <button
                    onClick={() => setEditingLog(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="text-sm">
                    <span className="text-slate-400 mr-2">Target:</span>
                    <span
                      className={cn(
                        "font-bold",
                        editingLog.side === "LONG"
                          ? "text-emerald-500"
                          : "text-rose-500",
                      )}
                    >
                      {editingLog.side} {editingLog.symbol}
                    </span>
                    <span className="text-slate-400 ml-2 font-mono">
                      ({editingLog.amount} USDT)
                    </span>
                  </div>
                  {editingLog.entryPrice && (
                    <div className="text-xs text-slate-500 font-mono">
                      Entry Price: {editingLog.entryPrice}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500 font-mono text-emerald-500/80">
                        TP (%)
                      </label>
                      <input
                        type="number"
                        value={editTakeProfit}
                        onChange={(e) => setEditTakeProfit(e.target.value)}
                        className="w-full bg-black/40 border border-emerald-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                        placeholder="0 (Off)"
                      />
                      {renderTargetPreview(
                        editTakeProfit,
                        false,
                        editingLog.side,
                        editingLog.entryPrice,
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500 font-mono text-rose-500/80">
                        SL (%)
                      </label>
                      <input
                        type="number"
                        value={editStopLoss}
                        onChange={(e) => setEditStopLoss(e.target.value)}
                        className="w-full bg-black/40 border border-rose-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500/50"
                        placeholder="0 (Off)"
                      />
                      {renderTargetPreview(
                        editStopLoss,
                        true,
                        editingLog.side,
                        editingLog.entryPrice,
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      executeTrade(
                        editingLog.side,
                        editingLog.amount,
                        false,
                        editTakeProfit,
                        editStopLoss,
                      );
                      setEditingLog(null);
                    }}
                    className="w-full mt-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Resend Signal
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
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
