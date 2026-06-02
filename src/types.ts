/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Decision = "LONG" | "SHORT" | "HOLD";

export interface MACDResult {
  MACD?: number;
  signal?: number;
  histogram?: number;
}

export interface AnalysisResult {
  decision: Decision;
  analysis_summary: string;
  indicators: {
    rsi: number[];
    macd: MACDResult[];
  };
  lastPrices: number[];
}
