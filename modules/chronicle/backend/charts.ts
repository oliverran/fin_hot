// 编年史的实时图表：把 chronicle_quotes 里的指数日线现算成各张图需要的形状。
// 读取时现算，不落库：日线一天只变一次，算一遍的量级也不值得再存一份。
// 输出的形状跟着 web/options.ts 的 meta.type 走（那里决定 echarts 怎么画）。
import { readProvider } from "./provider.ts";
import { LIVE_SOURCE, pageOf, type LiveChart } from "../catalog.ts";
import { loadBars, quotesFetchedAt, type QuoteBar } from "./quotes.ts";

/** 一张图的 JSON，与随包的示例文件同构。 */
export interface ChartJson {
  meta: { id: string; name: string; type: string; description?: string; source?: string; updatedAt?: string | null; status?: string; firstDate?: string; lastDate?: string };
  series: unknown;
}

/** 保留两位小数：指数点位换算成百分比后不必带一长串尾数。 */
const round2 = (value: number) => Math.round(value * 100) / 100;

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

/** 一年一组的收盘价，按年份升序。 */
function byYear(bars: readonly QuoteBar[]): Array<{ year: string; closes: number[] }> {
  const groups = new Map<string, number[]>();
  for (const bar of bars) {
    const year = bar.date.slice(0, 4);
    const closes = groups.get(year);
    if (closes) closes.push(bar.close);
    else groups.set(year, [bar.close]);
  }
  return [...groups].map(([year, closes]) => ({ year, closes }));
}

/** 一张图的 meta.type 与 series。 */
function build(kind: LiveChart["kind"], bars: readonly QuoteBar[]): [string, unknown] {
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
  }
}

/**
 * 一张实时图的 JSON；库里还没有这只指数的行情时返回 null，
 * 由调用方退回随包的示例文件，页面不会因为第一次刷新还没跑而空着。
 */
export async function liveChartJson(chart: LiveChart): Promise<ChartJson | null> {
  const snapshot = await readProvider();
  const code=chart.code.slice(2)+'.'+chart.code.slice(0,2).toUpperCase();
  const provider=snapshot?.indices.find(x=>x.code===code);
  const bars = provider?.bars.map(b=>({...b,open:b.close,high:b.close,low:b.close,volume:0})) ?? await loadBars(chart.code);
  if (bars.length === 0) return null;
  const page = pageOf(chart.group, chart.slug);
  const [type, series] = build(chart.kind, bars);
  return {
    meta: {
      id: chart.slug,
      name: page?.chartTitle ?? chart.indexName,
      type,
      description: page?.chartNote ?? "",
      source: provider ? snapshot!.source : LIVE_SOURCE,
      updatedAt: provider ? snapshot!.updatedAt : await quotesFetchedAt(chart.code),
      status: snapshot?.expectedDate ? (bars.at(-1)!.date < snapshot.expectedDate ? "stale" : "observed") : "calendar-missing",
      firstDate: bars[0]!.date,
      lastDate: bars.at(-1)!.date,
    },
    series,
  };
}
