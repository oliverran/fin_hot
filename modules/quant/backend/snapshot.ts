// 回测产物读取层。stock-daily-analyzer 在站外单独装、单独跑，把 summary.json / equity.csv /
// holdings.csv 落到共享数据目录（AIHOT_DATA_DIR 下的 quant/<配置名>/）；站内只读这些文件，回测本身不在
// 站内发生，镜像里不带 Python 与行情库。每个子目录是一套配置，页面上可以切换查看；一个子目录里三份
// 产物缺任何一份都当作「还没跑过」，由调用方回退到示例数据。
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { config } from "@aihot/backend/config";
import { productSource, type BacktestSnapshot, type EquityPoint, type Holding } from "../catalog.ts";
import { stockInfo } from "./names.ts";

/** 产物根目录：与编年史同用 AIHOT_DATA_DIR，站外脚本写、站内只读；其下每个子目录是一套配置。 */
export const snapshotDir = () => path.join(config.dataDir, "quant");

/** 工具写出的 summary.json。字段只在用到处取，缺失的一律当作「产物不完整」。 */
interface Summary {
  demo?: boolean;
  data_source?: string;
  symbols?: string[];
  config?: { start?: string; end?: string; rebalance?: string };
  metrics?: { total_return?: number; cagr?: number; sharpe?: number; max_drawdown?: number };
}

async function readText(file: string): Promise<string | null> {
  try { return await readFile(file, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

const round = (value: number, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;
const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** 跳过表头，逐行拆成字段。 */
function body(csv: string): string[][] {
  return csv.trim().split(/\r?\n/).slice(1).map((line) => line.split(","));
}

/** 净值按起点归一化到 1.00（产物里存的是金额），与页面「起点 = 1.00」的口径对齐。 */
function equityFrom(csv: string): EquityPoint[] {
  const parsed: Array<{ date: string; amount: number }> = [];
  for (const [date, amount] of body(csv)) {
    const value = Number(amount);
    if (date && Number.isFinite(value)) parsed.push({ date: date.trim(), amount: value });
  }
  const base = parsed[0]?.amount;
  if (!base) return [];
  return parsed.map((point) => ({ date: point.date, equity: round(point.amount / base) }));
}

/** 最后一行的持仓（最近一次调仓留下的），按权重从大到小；现金不算一档。 */
function holdingsFrom(csv: string): Holding[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0]?.split(",") ?? [];
  const last = lines.at(-1)?.split(",") ?? [];
  const out: Holding[] = [];
  for (let i = 1; i < header.length; i++) {
    const ticker = header[i]!.trim();
    const weight = Number(last[i]);
    if (!ticker || ticker === "__CASH__" || !Number.isFinite(weight) || weight <= 0) continue;
    out.push({ ...stockInfo(ticker), weight: round(weight) });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/** 工具用的调仓节奏标记 → 页面上的说法；认不得的标记原样显示。 */
const WEEKDAYS: Record<string, string> = { MON: "一", TUE: "二", WED: "三", THU: "四", FRI: "五" };
function rebalanceLabel(value?: string): string {
  if (!value) return "按固定节奏调仓";
  const weekly = value.match(/^W-(MON|TUE|WED|THU|FRI)$/);
  if (weekly) return `每周${WEEKDAYS[weekly[1]!]}收盘调仓`;
  if (value === "D") return "每日收盘调仓";
  if (value === "M") return "每月末调仓";
  return value;
}

/**
 * 读一套配置的产物。三份文件不齐、或指标字段读不出来时返回 null（当作还没跑过），
 * 由调用方回退到示例数据；文件在但读不动（权限等）照常抛出，不吞掉。
 */
export async function readBacktest(name: string): Promise<BacktestSnapshot | null> {
  const dir = path.join(snapshotDir(), name);
  const [summaryText, equityText, holdingsText] = await Promise.all([
    readText(path.join(dir, "summary.json")),
    readText(path.join(dir, "equity.csv")),
    readText(path.join(dir, "holdings.csv")),
  ]);
  if (!summaryText || !equityText || !holdingsText) return null;

  const summary = JSON.parse(summaryText) as Summary;
  const equity = equityFrom(equityText);
  const totalReturn = finite(summary.metrics?.total_return);
  const cagr = finite(summary.metrics?.cagr);
  const sharpe = finite(summary.metrics?.sharpe);
  const maxDrawdown = finite(summary.metrics?.max_drawdown);
  if (!equity.length || totalReturn === null || cagr === null || sharpe === null || maxDrawdown === null) return null;

  // 胜率不在 summary 里，按日收益为正的天数占比算，与示例数据的口径一致。
  const changes = equity.slice(1).map((point, i) => point.equity / equity[i]!.equity - 1);
  const symbols = summary.symbols ?? [];
  return {
    config: {
      name,
      universe: symbols.length ? `回测股票池 ${symbols.length} 只` : "回测股票池",
      start: summary.config?.start ?? equity[0]!.date,
      end: summary.config?.end ?? equity.at(-1)!.date,
      rebalance: rebalanceLabel(summary.config?.rebalance),
    },
    source: productSource(summary),
    metrics: {
      totalReturn: round(totalReturn),
      cagr: round(cagr),
      sharpe: round(sharpe, 2),
      maxDrawdown: round(maxDrawdown),
      winRate: round(changes.filter((value) => value > 0).length / (changes.length || 1)),
    },
    equity,
    holdings: holdingsFrom(holdingsText),
  };
}

/** 数据目录下能读出一整套产物的配置名，按名字排序；目录不存在就是「还没跑过」。 */
export async function listSnapshots(): Promise<string[]> {
  let entries;
  try { entries = await readdir(snapshotDir(), { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const usable: string[] = [];
  for (const name of names) if (await readBacktest(name)) usable.push(name);
  return usable;
}
