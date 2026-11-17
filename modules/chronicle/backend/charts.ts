// 编年史的实时图表：把 chronicle_quotes 里的指数日线现算成各张图需要的形状。
// 读取时现算，不落库：日线一天只变一次，算一遍的量级也不值得再存一份。
// 输出的形状跟着 web/options.ts 的 meta.type 走（那里决定 echarts 怎么画）。
import { readProvider } from "./provider.ts";
import { compareBars } from "./compare.ts";
import { pricePercentile } from "../analytics.ts";
import { LIVE_SOURCE, SECTOR_TRACKS, isClusterKind, pageOf, type DailyKind, type LiveChart } from "../catalog.ts";
import { loadBars, quotesFetchedAt, type QuoteBar } from "./quotes.ts";
import { readClusters, rollingCorrelation, type ClusterSeries } from "./clusters.ts";
import { CLUSTER_COMBOS, CLUSTER_THEMES, comboNameOf } from "../cluster-groups.ts";

/** 一张图的 JSON，与随包的示例文件同构。 */
export interface ChartJson {
  meta: { id: string; name: string; type: string; description?: string; source?: string; updatedAt?: string | null; status?: string; firstDate?: string; lastDate?: string };
  series: unknown;
}

/** 保留两位小数：指数点位换算成百分比后不必带一长串尾数。 */
const round2 = (value: number) => Math.round(value * 100) / 100;

/** 轮动总图的归一化起点：七条赛道都从 2021 年初的第一个共同交易日算作 100。 */
const ROTATION_START = "2021-01-01";

/** 一根年内最大回撤：年内收盘价相对当年（含）前高的最深跌幅，负数。 */
function yearDrawdown(closes: number[]): number {
  let peak = closes[0]!;
  let worst = 0;
  for (const close of closes) {
    if (close > peak) peak = close;
    const drop = (close / peak - 1) * 100;
    if (drop < worst) worst = drop;
  }
  return worst;
}

/** 一年一组的收盘价与日期，按年份升序。 */
function byYear(bars: readonly QuoteBar[]): Array<{ year: string; dates: string[]; closes: number[] }> {
  const groups = new Map<string, { dates: string[]; closes: number[] }>();
  for (const bar of bars) {
    const year = bar.date.slice(0, 4);
    const group = groups.get(year);
    if (group) {
      group.dates.push(bar.date);
      group.closes.push(bar.close);
    } else groups.set(year, { dates: [bar.date], closes: [bar.close] });
  }
  return [...groups].map(([year, group]) => ({ year, ...group }));
}

/** 某个日期（含）之前最近一条市盈率；序列按日期升序。 */
function peAsOf(valuations: readonly { date: string; pe: number | null }[], date: string): number | null {
  let value: number | null = null;
  for (const item of valuations) {
    if (item.date > date) break;
    if (item.pe != null) value = item.pe;
  }
  return value;
}

/**
 * 一张图的 meta.type 与 series；`other` 是相对强弱的分母指数日线，`valuations` 是市盈率序列（拆解图用），
 * `tracks` 是轮动总图与行业估值要一起算的那组行业指数日线（别的图不用）。
 * 只接 `DailyKind`：抱团卷由成分股现算，走 clusterChartJson，不从这里过。
 */
function build(
  kind: DailyKind,
  bars: readonly QuoteBar[],
  other: readonly QuoteBar[],
  valuations: readonly { date: string; pe: number | null }[],
  tracks: ReadonlyArray<{ name: string; bars: readonly QuoteBar[] }> = [],
): [string, unknown] {
  switch (kind) {
    case "index":
      return ["line", bars.map((bar) => ({ date: bar.date, value: bar.close }))];
    case "drawdown": {
      // 相对历史最高点的跌幅：一路摸高，记下每一次从峰顶滑落的深度。
      let peak = bars[0]!.close;
      return ["drawdown", bars.map((bar) => {
        if (bar.close > peak) peak = bar.close;
        return { date: bar.date, value: round2((bar.close / peak - 1) * 100) };
      })];
    }
    case "annual": {
      const years = byYear(bars);
      return ["bar", years.map((year, i) => {
        const base = years[i - 1]?.closes.at(-1) ?? year.closes[0]!;
        return { date: year.year, value: round2((year.closes.at(-1)! / base - 1) * 100) };
      })];
    }
    case "rolling": {
      // 滚动一年年化：每个交易日对应过去 250 个交易日的年化回报。
      // 把起点一路往后挪，牛熊的切换就变成一条连续的收益中枢曲线，而不是孤立的年度数字。
      const window = 250;
      const out: Array<{ date: string; value: number }> = [];
      for (let i = window; i < bars.length; i++) {
        const growth = bars[i]!.close / bars[i - window]!.close;
        out.push({ date: bars[i]!.date, value: round2((growth ** (252 / window) - 1) * 100) });
      }
      return ["line", out];
    }
    case "turbulence": {
      const years = byYear(bars);
      return ["range-bar", years.map((year, i) => {
        const base = years[i - 1]?.closes.at(-1) ?? year.closes[0]!;
        return {
          year: year.year,
          final: round2((year.closes.at(-1)! / base - 1) * 100),
          intrayear: round2(yearDrawdown(year.closes)),
        };
      })];
    }
    case "volatility": {
      // 20 个交易日的日收益标准差，年化后按百分比计——市场情绪的心电图。
      const window = 20;
      const out: Array<{ date: string; value: number }> = [];
      for (let i = window; i < bars.length; i++) {
        const returns: number[] = [];
        for (let j = i - window + 1; j <= i; j++) returns.push(Math.log(bars[j]!.close / bars[j - 1]!.close));
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
        out.push({ date: bars[i]!.date, value: round2(Math.sqrt(variance * 252) * 100) });
      }
      return ["line", out];
    }
    case "annual-vol": {
      // 逐年已实现波动率：把一个自然年里的日收益合起来算年化标准差。
      // 和上一条 20 日滚动波动率互补——一个看情绪的瞬时脉冲，一个看整年被搅动的程度。
      const groups = new Map<string, QuoteBar[]>();
      for (const bar of bars) {
        const year = bar.date.slice(0, 4);
        const list = groups.get(year);
        if (list) list.push(bar);
        else groups.set(year, [bar]);
      }
      const out: Array<{ date: string; value: number }> = [];
      for (const [year, list] of groups) {
        if (list.length < 20) continue;
        const returns: number[] = [];
        for (let i = 1; i < list.length; i++) returns.push(Math.log(list[i]!.close / list[i - 1]!.close));
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
        out.push({ date: year, value: round2(Math.sqrt(variance * 252) * 100) });
      }
      return ["line", out];
    }
    case "seasonality": {
      // 每个月的收益率：当月最后一个收盘价相对上一个月最后一个收盘价。
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthly = new Map<string, number>();
      for (const bar of bars) monthly.set(bar.date.slice(0, 7), bar.close);
      const keys = [...monthly.keys()].sort();
      const years = [...new Set(keys.map((key) => key.slice(0, 4)))].sort();
      const data: Array<[number, number, number]> = [];
      for (let i = 1; i < keys.length; i++) {
        const key = keys[i]!;
        const value = (monthly.get(key)! / monthly.get(keys[i - 1]!)! - 1) * 100;
        data.push([Number(key.slice(5, 7)) - 1, years.indexOf(key.slice(0, 4)), round2(value)]);
      }
      return ["heatmap", { data, years, months }];
    }
    case "distribution": {
      const years = byYear(bars);
      const bins = ["<-30%", "-30~-20%", "-20~-10%", "-10~0%", "0~10%", "10~20%", "20~30%", "30~40%", "40~50%", ">50%"];
      const counts = bins.map(() => 0);
      years.forEach((year, i) => {
        const base = years[i - 1]?.closes.at(-1) ?? year.closes[0]!;
        const value = (year.closes.at(-1)! / base - 1) * 100;
        const at = value < -30 ? 0 : value < -20 ? 1 : value < -10 ? 2 : value < 0 ? 3 : value < 10 ? 4 : value < 20 ? 5 : value < 30 ? 6 : value < 40 ? 7 : value < 50 ? 8 : 9;
        counts[at]! += 1;
      });
      return ["distribution-bar", { bins, counts }];
    }
    case "relative": {
      // 相对强弱：两只指数按交易日对齐后相除（分子 ÷ 分母），再配一条均线看趋势。
      // 比值向上代表分子（如大盘）占优，向下代表分母（如小盘）占优。
      const closes = new Map(other.map((bar) => [bar.date, bar.close]));
      const dates: string[] = [];
      const ratio: number[] = [];
      for (const bar of bars) {
        const denominator = closes.get(bar.date);
        if (denominator === undefined) continue;
        dates.push(bar.date);
        ratio.push(round2(bar.close / denominator));
      }
      const window = 250;
      const mean = ratio.map((_, i) => {
        if (i < window - 1) return null;
        let sum = 0;
        for (let j = i - window + 1; j <= i; j++) sum += ratio[j]!;
        return round2(sum / window);
      });
      return ["multi-line", { dates, seriesData: { "相对强弱": ratio, "250 日均线": mean } }];
    }
    case "davis": {
      // 戴维斯拆解：把每年的总回报按对数口径拆成盈利（EPS）与估值（PE）两部分：
      // log(总回报) = log(EPS) + log(PE)。EPS 没有直接的数据，由「点位 ÷ PE」反推，
      // 所以两端都依赖同一份市盈率序列；缺任一年末的市盈率就跳过那一年。
      const years = byYear(bars);
      const rows: Array<{ year: string; total: number; eps: number; pe: number }> = [];
      for (let i = 1; i < years.length; i++) {
        const prev = years[i - 1]!;
        const year = years[i]!;
        const prevPe = peAsOf(valuations, prev.dates.at(-1)!);
        const endPe = peAsOf(valuations, year.dates.at(-1)!);
        if (prevPe == null || endPe == null || prevPe <= 0 || endPe <= 0) continue;
        const total = Math.log(year.closes.at(-1)! / prev.closes.at(-1)!) * 100;
        const pe = Math.log(endPe / prevPe) * 100;
        rows.push({ year: year.year, total: round2(total), eps: round2(total - pe), pe: round2(pe) });
      }
      return ["stacked-bar-dual", rows];
    }
    case "rotation": {
      // 轮动总图：七条赛道对齐到共同交易日、自 2021 年起归一化到 100，叠在一张图上比相对强弱。
      const end = tracks.reduce((min, track) => (track.bars.at(-1)!.date < min ? track.bars.at(-1)!.date : min), "9999-12-31");
      const { dates, seriesData } = compareBars(tracks.map((track) => ({ name: track.name, bars: [...track.bars] })), ROTATION_START, end);
      return ["multi-line", { dates, seriesData }];
    }
    case "sector-valuation": {
      // 行业估值：每条赛道的最新收盘价在自身近 5 年区间里的分位（%），越低相对自身历史越便宜。
      const rows: Array<{ date: string; value: number }> = [];
      for (const track of tracks) {
        const value = pricePercentile(track.bars, track.bars.at(-1)!.date);
        if (value !== null) rows.push({ date: track.name, value: round2(value) });
      }
      return ["bar", rows];
    }
  }
}

/** 提供方（Tushare）快照里的代码：腾讯写法 sh000300 → 000300.SH；已经是提供方式（带点，如行业指数的 801120.SI）的原样用。 */
function providerCode(code: string): string {
  return code.includes(".") ? code : code.slice(2) + "." + code.slice(0, 2).toUpperCase();
}

/** 指数在提供方快照里的那条记录。 */
function providerIndex(code: string, snapshot: Awaited<ReturnType<typeof readProvider>>) {
  return snapshot?.indices.find((x) => x.code === providerCode(code));
}

/**
 * 一只指数的日线：行情提供方（Tushare）的那份与库里的腾讯日线各取一份，哪份更新就用哪份。
 * 提供方同步失败时会原地保留上一次成功的数据，这时库里那份（腾讯）往往已经更新到最近交易日，
 * 用它才能让图表跟上；`fromProvider` 告诉调用方这条日线出自哪一侧，好标对来源与刷新时间。
 * 行业指数用的是提供方式代码（带点），不会落进 chronicle_quotes，只从提供方快照取。
 */
export async function barsFor(code: string, snapshot: Awaited<ReturnType<typeof readProvider>>): Promise<{ bars: QuoteBar[]; fromProvider: boolean }> {
  const provider = providerIndex(code, snapshot);
  const provided = provider?.bars.map((b) => ({ ...b, open: b.close, high: b.close, low: b.close, volume: 0 })) ?? [];
  if (code.includes(".")) return { bars: provided, fromProvider: true };
  const stored = await loadBars(code);
  if (stored.length && (provided.length === 0 || stored.at(-1)!.date > provided.at(-1)!.date)) return { bars: stored, fromProvider: false };
  return { bars: provided, fromProvider: true };
}

/** 相关性图的滚动窗口：约一个季度的交易日。 */
const CORRELATION_WINDOW = 60;

/** 若干条组合走势对齐到共同交易日（取交集），供多线图使用。 */
function alignSeries(series: readonly ClusterSeries[]): { dates: string[]; seriesData: Record<string, number[]> } {
  const maps = series.map((one) => new Map(one.dates.map((date, i) => [date, one.values[i]!])));
  const dates = [...maps[0]!.keys()].filter((date) => maps.every((map) => map.has(date))).sort();
  const seriesData: Record<string, number[]> = {};
  series.forEach((one, i) => { seriesData[one.name] = dates.map((date) => maps[i]!.get(date)!); });
  return { dates, seriesData };
}

/**
 * 抱团卷的一张图：四代专题各一条等权组合的走势，历史祖谱是四个古早主题的多线，
 * 相关性由四条组合现算，集中度直接用沪深 300 的权重序列。数据都在 backend/clusters.ts 的快照里。
 * 快照还没有（第一次刷新没跑过）或关键序列缺失时返回 null，由调用方显示缺失。
 */
async function clusterChartJson(chart: LiveChart): Promise<ChartJson | null> {
  const snapshot = await readClusters();
  if (!snapshot) return null;
  const find = (name: string | undefined) => (name ? snapshot.series.find((one) => one.name === name) : undefined);
  let type: string;
  let series: unknown;
  let firstDate: string | undefined;
  let lastDate: string | undefined;
  if (chart.kind === "cluster-combo") {
    const combo = find(comboNameOf(chart.slug));
    if (!combo || combo.dates.length < 2) return null;
    type = "line";
    series = combo.dates.map((date, i) => ({ date, value: combo.values[i]! }));
    [firstDate, lastDate] = [combo.dates[0], combo.dates.at(-1)];
  } else if (chart.kind === "cluster-themes") {
    const themes: ClusterSeries[] = [];
    for (const theme of CLUSTER_THEMES) {
      const one = find(theme.name);
      if (!one || one.dates.length < 2) return null;
      themes.push(one);
    }
    const aligned = alignSeries(themes);
    if (aligned.dates.length < 2) return null;
    type = "multi-line";
    series = aligned;
    [firstDate, lastDate] = [aligned.dates[0], aligned.dates.at(-1)];
  } else if (chart.kind === "cluster-correlation") {
    const combos: ClusterSeries[] = [];
    for (const combo of CLUSTER_COMBOS) {
      const one = find(combo.name);
      if (!one) return null;
      combos.push(one);
    }
    const points = rollingCorrelation(combos, CORRELATION_WINDOW);
    if (points.length < 2) return null;
    type = "line";
    series = points;
    [firstDate, lastDate] = [points[0]!.date, points.at(-1)!.date];
  } else {
    const { concentration } = snapshot;
    if (concentration.dates.length < 2) return null;
    type = "line";
    series = concentration.dates.map((date, i) => ({ date, value: concentration.values[i]! }));
    [firstDate, lastDate] = [concentration.dates[0], concentration.dates.at(-1)];
  }
  const page = pageOf(chart.group, chart.slug);
  const provider = await readProvider();
  // 集中度的权重按月公布，本就落后于最近交易日，不按日线口径判「尚未更新到应有交易日」。
  const expected = chart.kind === "cluster-concentration" ? undefined : provider?.expectedDate;
  return {
    meta: {
      id: chart.slug,
      name: page?.chartTitle ?? chart.indexName,
      type,
      description: page?.chartNote ?? "",
      source: snapshot.source,
      updatedAt: snapshot.updatedAt,
      status: expected && lastDate && lastDate < expected ? "stale" : "observed",
      firstDate,
      lastDate,
    },
    series,
  };
}

/**
 * 一张实时图的 JSON；库里还没有这只指数的行情时返回 null，
 * 由调用方显示缺失状态，页面不会用旧数据顶替。
 */
export async function liveChartJson(chart: LiveChart): Promise<ChartJson | null> {
  if (isClusterKind(chart.kind)) return clusterChartJson(chart);
  if (!chart.code) return null;
  const snapshot = await readProvider();
  // 轮动总图与行业估值一起算七条赛道的日线；其余图只看自己那一条。
  const byTracks = chart.kind === "rotation" || chart.kind === "sector-valuation";
  const tracks = byTracks
    ? await Promise.all(SECTOR_TRACKS.map(async (track) => ({ name: track.name, bars: (await barsFor(track.code, snapshot)).bars })))
    : [];
  if (byTracks && tracks.some((track) => track.bars.length === 0)) return null; // 缺一条就当整张缺失，免得多条线的图少一条看不出来
  const { bars, fromProvider } = byTracks ? { bars: tracks[0]!.bars, fromProvider: true } : await barsFor(chart.code, snapshot);
  if (bars.length === 0) return null;
  const other = chart.code2 ? (await barsFor(chart.code2, snapshot)).bars : [];
  if (chart.code2 && other.length === 0) return null;
  // 戴维斯拆解还要市盈率序列（同样来自提供方）；拿不到就当作缺失。
  const valuations = chart.kind === "davis" ? (providerIndex(chart.code, snapshot)?.valuations ?? []) : [];
  if (chart.kind === "davis" && valuations.length === 0) return null;
  const page = pageOf(chart.group, chart.slug);
  const [type, series] = build(chart.kind, bars, other, valuations, tracks);
  // 多赛道的图覆盖的是各赛道的共同区间：起点取最晚的，终点取最早的。
  const firstDate = byTracks ? tracks.map((track) => track.bars[0]!.date).reduce((a, b) => (a > b ? a : b)) : bars[0]!.date;
  const lastDate = byTracks ? tracks.map((track) => track.bars.at(-1)!.date).reduce((a, b) => (a < b ? a : b)) : bars.at(-1)!.date;
  return {
    meta: {
      id: chart.slug,
      name: page?.chartTitle ?? chart.indexName,
      type,
      description: page?.chartNote ?? "",
      source: fromProvider && snapshot ? snapshot.source : LIVE_SOURCE,
      updatedAt: fromProvider && snapshot ? snapshot.updatedAt : await quotesFetchedAt(chart.code),
      status: snapshot?.expectedDate ? (lastDate < snapshot.expectedDate ? "stale" : "observed") : "calendar-missing",
      firstDate,
      lastDate,
    },
    series,
  };
}
