// 选股信号产物读取层。stock-daily-analyzer 的 run-daily（或 demo-daily）把当日扫描结果写成
// analysis.json，落到共享数据目录（AIHOT_DATA_DIR 下的 quant/daily/）；站内只读这一份文件，
// 扫描本身不在站内发生。读不到、或读不出推荐列表时当作「还没跑过」，由调用方回退到示例数据。
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@aihot/backend/config";
import { productSource, STRATEGIES, type Signal, type SignalsData, type StrategyKey } from "../catalog.ts";
import { stockInfo } from "./names.ts";

/** 产物目录：与回测快照同用 AIHOT_DATA_DIR，站外脚本写、站内只读。 */
export const dailyDir = () => path.join(config.dataDir, "quant", "daily");

/** 工具写出的 analysis.json 里用到的字段。 */
interface Analysis {
  demo?: boolean;
  data_source?: string;
  report_date?: string;
  symbols?: string[];
  summary?: { total_scanned?: number };
  formatted_recommendations?: RawPick[];
}

/** 一条推荐（format_recommendation 的产物）。 */
interface RawPick {
  date?: string;
  ticker?: string;
  name?: string;
  sector?: string;
  recommendation_type?: string;
  price?: number;
  rsi?: number;
  macd_signal?: string;
  volume_ratio?: number;
  confidence?: string;
  reasoning?: string;
}

async function readText(file: string): Promise<string | null> {
  try { return await readFile(file, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

const asNumber = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

// 站内约定：工具把置信度分成「高/中/低」三档，页面画的是 0–100 的条，这里折成分值；
// 认不得的档位按中间档算。这是页面口径，不是工具自己的数值。
const CONFIDENCE: Record<string, number> = { 高: 85, 中: 65, 低: 45 };

// 工具的 MACD 判断只有多空两态；页面用中文，认不得的原样显示。
const MACD: Record<string, string> = { bullish: "多头", bearish: "空头" };

/**
 * 读当日选股产物。文件不在、或推荐列表读不出来时返回 null（当作还没跑过），由调用方回退到示例数据；
 * 文件在但读不动（权限等）照常抛出，不吞掉。
 */
export async function readSignals(): Promise<SignalsData | null> {
  const text = await readText(path.join(dailyDir(), "analysis.json"));
  if (!text) return null;
  const analysis = JSON.parse(text) as Analysis;
  const raw = analysis.formatted_recommendations;
  if (!Array.isArray(raw)) return null;

  const asOf = analysis.report_date ?? raw[0]?.date ?? "";
  const buckets = new Map<StrategyKey, Signal[]>(STRATEGIES.map((strategy) => [strategy.key, []]));
  for (const pick of raw) {
    const bucket = buckets.get(pick.recommendation_type as StrategyKey);
    if (!bucket) continue;
    const info = stockInfo(pick.ticker ?? "");
    bucket.push({
      date: pick.date ?? asOf,
      ticker: info.ticker,
      name: pick.name?.trim() || info.name,
      sector: pick.sector?.trim() || info.sector,
      recommendationType: pick.recommendation_type as StrategyKey,
      price: asNumber(pick.price) ?? 0,
      rsi: asNumber(pick.rsi) ?? 0,
      macdSignal: MACD[pick.macd_signal ?? ""] ?? (pick.macd_signal ?? "—"),
      volumeRatio: asNumber(pick.volume_ratio) ?? 0,
      confidence: CONFIDENCE[pick.confidence ?? ""] ?? CONFIDENCE["中"]!,
      reasoning: pick.reasoning?.trim() ?? "",
    });
  }
  return {
    asOf,
    source: productSource(analysis),
    universe: analysis.summary?.total_scanned ?? analysis.symbols?.length ?? 0,
    strategies: STRATEGIES.map((strategy) => ({ key: strategy.key, label: strategy.label, rule: strategy.rule, blurb: strategy.blurb, picks: buckets.get(strategy.key)! })),
  };
}
