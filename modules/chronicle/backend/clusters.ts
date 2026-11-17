// 抱团卷的数据：把成分股的前复权日线（腾讯，落在 chronicle_quotes）现算成等权组合走势，
// 再从 Tushare 取沪深 300 的月度权重算集中度。算完只留几条组合序列，存成一份快照。
// 读取时只从快照取现成的序列，不在请求里重算——成分股加起来十几万根日线，逐次现算太重。
import { beijingDate } from "@aihot/contracts/time";
import { sql } from "@aihot/backend/db";
import { allRows, requestData, providerDate, compactDate, finite, type DataRequest } from "./data-client.ts";
import { readSnapshot, saveSnapshot } from "./snapshots.ts";
import { refreshCode, type QuoteBar } from "./quotes.ts";
import { CLUSTER_GROUPS, CLUSTER_CODES, tencentCode } from "../cluster-groups.ts";

const SOURCE = "腾讯前复权日线 / Tushare 沪深 300 权重";
/** 集中度用的指数与起始年份：沪深 300 的成分权重由指数公司按调仓月公布。 */
const CONCENTRATION_INDEX = "000300.SH";
const CONCENTRATION_START = "2015-01-01";
const TOP_WEIGHTS = 10;

/** 一条走势序列：dates 与 values 一一对应。 */
export interface ClusterSeries {
  name: string;
  dates: string[];
  values: number[];
}

export interface ClusterSnapshot {
  updatedAt: string;
  source: string;
  /** 每个组合的等权走势，起点 100。 */
  series: ClusterSeries[];
  /** 沪深 300 前十大成分股权重合计（%）。 */
  concentration: ClusterSeries;
  errors: string[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const shiftDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * 等权组合指数：每个交易日取当天有数据的成分股，日收益 = 各成分股当日涨跌幅的等权平均，再逐日累乘。
 * 起点（最早一只成分股的上市日）记为 100；当日取不到数据的成分股不计入，退市则自然不再有数据。
 * 输入是各成分股按交易日升序的前复权收盘价。
 */
export function compositeIndex(input: ReadonlyArray<ReadonlyArray<{ date: string; close: number }>>): ClusterSeries {
  const returns = new Map<string, number[]>();
  let first: string | null = null;
  for (const stock of input) {
    if (!stock.length) continue;
    if (first === null || stock[0]!.date < first) first = stock[0]!.date;
    for (let i = 1; i < stock.length; i++) {
      const previous = stock[i - 1]!, current = stock[i]!;
      if (previous.close <= 0) continue;
      const list = returns.get(current.date);
      if (list) list.push(current.close / previous.close - 1);
      else returns.set(current.date, [current.close / previous.close - 1]);
    }
  }
  if (first === null) return { name: "", dates: [], values: [] };
  const dates: string[] = [first];
  const values: number[] = [100];
  let value = 100;
  for (const date of [...returns.keys()].sort()) {
    if (date <= first) continue;
    const list = returns.get(date)!;
    if (!list.length) continue;
    value *= 1 + list.reduce((sum, r) => sum + r, 0) / list.length;
    dates.push(date);
    values.push(round2(value));
  }
  return { name: "", dates, values };
}

/** 两条等长序列的皮尔逊相关系数；任一条没有波动时返回 null。 */
function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const mean = (v: readonly number[]) => v.reduce((sum, x) => sum + x, 0) / v.length;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * 若干条组合走势在共同交易日上的滚动平均两两相关系数：每个窗口取 window 个交易日的日收益，
 * 把每一对的相关系数（共 C(n,2) 对）取平均。样本还没凑满一个窗口时不出点。
 */
export function rollingCorrelation(series: readonly ClusterSeries[], window: number): Array<{ date: string; value: number }> {
  const returns = series.map((one) => {
    const map = new Map<string, number>();
    for (let i = 1; i < one.dates.length; i++) {
      const previous = one.values[i - 1]!, current = one.values[i]!;
      if (previous > 0) map.set(one.dates[i]!, current / previous - 1);
    }
    return map;
  });
  if (!returns.length) return [];
  const dates = [...returns[0]!.keys()].filter((date) => returns.every((map) => map.has(date))).sort();
  const out: Array<{ date: string; value: number }> = [];
  for (let i = window - 1; i < dates.length; i++) {
    const slice = dates.slice(i - window + 1, i + 1);
    const pairs: number[] = [];
    for (let a = 0; a < returns.length; a++) {
      for (let b = a + 1; b < returns.length; b++) {
        const value = pearson(slice.map((date) => returns[a]!.get(date)!), slice.map((date) => returns[b]!.get(date)!));
        if (value !== null) pairs.push(value);
      }
    }
    if (pairs.length) out.push({ date: dates[i]!, value: round2(pairs.reduce((sum, v) => sum + v, 0) / pairs.length) });
  }
  return out;
}

/** 成分股的当日收盘价：一条 SQL 取全部，按代码分好。 */
async function loadClusterBars(codes: readonly string[]): Promise<Map<string, Array<{ date: string; close: number }>>> {
  const rows = await sql<Array<{ code: string; date: string; close: number }>>`
    SELECT code, to_char(trade_date, 'YYYY-MM-DD') AS date, close FROM chronicle_quotes
    WHERE code = ANY(${codes}) ORDER BY code, trade_date`;
  const out = new Map<string, Array<{ date: string; close: number }>>();
  for (const row of rows) {
    const list = out.get(row.code) ?? [];
    list.push({ date: row.date, close: Number(row.close) });
    out.set(row.code, list);
  }
  return out;
}

/** 沪深 300 前十大成分股权重合计（%），按指数公司公布的调仓月；只在已有点上往后接新月份。 */
async function refreshConcentration(request: DataRequest, previous: ClusterSeries | undefined, now: Date): Promise<ClusterSeries> {
  const from = previous?.dates.length ? shiftDays(previous.dates.at(-1)!, -60) : CONCENTRATION_START;
  const rows = await allRows("index_weight", { index_code: CONCENTRATION_INDEX, start_date: compactDate(from), end_date: compactDate(beijingDate(now)) }, request);
  const weights = new Map<string, number[]>();
  for (const row of rows) {
    if (String(row.index_code) !== CONCENTRATION_INDEX) throw new Error("Invalid weight row");
    const weight = finite(row.weight);
    if (weight === null || weight < 0) continue;
    const date = providerDate(row.trade_date);
    const list = weights.get(date);
    if (list) list.push(weight);
    else weights.set(date, [weight]);
  }
  const points = new Map<string, number>((previous?.dates ?? []).map((date, i) => [date, previous!.values[i]!]));
  for (const [date, list] of weights) {
    points.set(date, round2([...list].sort((a, b) => b - a).slice(0, TOP_WEIGHTS).reduce((sum, w) => sum + w, 0)));
  }
  const sorted = [...points].sort((a, b) => a[0].localeCompare(b[0]));
  return { name: "沪深 300 前十大权重", dates: sorted.map(([date]) => date), values: sorted.map(([, value]) => value) };
}

/**
 * 刷新抱团卷：先补齐成分股日线（库里没有的从最早补起，之后每次只取最近一页），
 * 再把全部组合现算成等权走势，最后接上沪深 300 的权重。个股单只失败不中断整轮。
 */
export async function refreshClusters(options: {
  request?: DataRequest;
  fetchBars?: (code: string, opts: { start?: string; end?: string; count: number }, endpoint?: string) => Promise<QuoteBar[]>;
  now?: Date;
} = {}): Promise<ClusterSnapshot> {
  const { request = requestData, fetchBars, now = new Date() } = options;
  const previous = await readClusters();
  const errors: string[] = [];
  for (const code of CLUSTER_CODES) {
    try { await refreshCode(code, fetchBars); } catch { errors.push(`${code} 日线同步失败`); }
  }
  const bars = await loadClusterBars(CLUSTER_CODES);
  const series = CLUSTER_GROUPS.flatMap((group) => {
    const computed = compositeIndex(group.stocks.map((code) => bars.get(tencentCode(code)) ?? []));
    return computed.dates.length ? [{ name: group.name, dates: computed.dates, values: computed.values }] : [];
  });
  let concentration = previous?.concentration ?? { name: "沪深 300 前十大权重", dates: [], values: [] };
  try { concentration = await refreshConcentration(request, previous?.concentration, now); }
  catch { errors.push("沪深 300 权重同步失败，保留上次数据"); }
  const snapshot: ClusterSnapshot = { updatedAt: now.toISOString(), source: SOURCE, series, concentration, errors };
  await saveSnapshot("clusters", snapshot);
  return snapshot;
}

export async function readClusters(): Promise<ClusterSnapshot | null> {
  return await readSnapshot<ClusterSnapshot>("clusters");
}
