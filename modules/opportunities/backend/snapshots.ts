// 复用编年史已同步的行情快照（只读）：模块之间不能相互 import，这里自写一份只读版本，
// 不新增任何 Tushare 调用，也不写文件。快照文件由编年史模块写在 <dataDir>/chronicle/ 下。
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@aihot/backend/config";

/** 一天的行情背景，字段与编年史模块写入的快照一致（只取这里用得到的）。 */
export interface MarketDay {
  date: string;
  breadth: { count: number; up: number; down: number; flat: number; turnover: number | null };
  indices: Array<{ name: string; change: number | null }>;
  industries: Array<{ name: string; change: number | null }>;
}

export interface MarketSnapshot { updatedAt: string; days: MarketDay[] }

export interface CompanyRecord {
  code: string;
  name: string;
  industry: string;
  pe: number | null;
  pb: number | null;
  dividendYield: number | null;
  marketValue: number | null;
}

export interface CompanySnapshot { updatedAt: string; records: CompanyRecord[] }

async function read<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(config.dataDir, "chronicle", `${name}.json`), "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** 最近一个交易日的行情；编年史还没同步过时是 null。 */
export async function latestMarketDay(): Promise<MarketDay | null> {
  return (await read<MarketSnapshot>("market"))?.days.at(-1) ?? null;
}

/** 全量 A 股清单（代码、名称、行业、估值）；还没同步过时是空数组。 */
export async function companyRecords(): Promise<CompanyRecord[]> {
  return (await read<CompanySnapshot>("companies"))?.records ?? [];
}
