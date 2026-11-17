// 编年史的行情：解析腾讯日线、翻页补齐、落库，以及由日线现算的派生图。
// 抓取只连本地的假服务（stub），不访问任何外部地址。
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { Reply, stub, tag } from "../../../tests/setup.ts";
import { LIVE_SOURCE, SECTOR_TRACKS, type LiveChart } from "../catalog.ts";
import { barsFor, liveChartJson } from "../backend/charts.ts";
import { compositeIndex, refreshClusters, rollingCorrelation, syncStockBars, type ClusterSeries } from "../backend/clusters.ts";
import { CLUSTER_CODES, CLUSTER_COMBOS, CLUSTER_GROUPS, CLUSTER_THEMES } from "../cluster-groups.ts";
import { saveSnapshot } from "../backend/snapshots.ts";
import type { ProviderSnapshot } from "../backend/provider.ts";
import {
  QUOTE_CODES, backfillBars, fetchDayBars, loadBars, parseDayBars, quotesFetchedAt, refreshCode, refreshQuotes,
  type QuoteBar,
} from "../backend/quotes.ts";

const T = tag();

/** 一份日线，价格都由收盘价推出来，只关心形状时够用。 */
const barsOf = (dates: readonly string[], close = (i: number) => 100 + i): QuoteBar[] =>
  dates.map((date, i) => ({ date, open: close(i), close: close(i), high: close(i) + 1, low: close(i) - 1, volume: 0 }));

/** 从 `end` 起往前数 count 天（含周末，接口给什么就存什么）。 */
function datesDescending(end: string, count: number): string[] {
  const at = new Date(`${end}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(at.toISOString().slice(0, 10));
    at.setUTCDate(at.getUTCDate() - 1);
  }
  return out;
}

// 腾讯日线接口的假服务：/fqkline/get 正常回，/bad 回 param error。
const quotes = await stub((_hit, req) => {
  const url = new URL(req.url ?? "/", "http://stub");
  if (url.pathname.endsWith("/bad")) return { code: 1, msg: "param error", data: [] };
  if (url.pathname.endsWith("/down")) return new Reply(503, {});
  return {
    code: 0,
    data: {
      sh000001: {
        qfqday: [
          ["2024-01-02", "2974.110", "2962.280", "2976.000", "2950.000", "250000000.000"],
          ["2024-01-03", "2965.000", "2974.930", "2980.000", "2960.000", "260000000.000"],
        ],
      },
    },
  };
});
config.allowPrivateNetworkFetch = true;
const endpoint = (name: string) => `${quotes.url}/${name}`;

after(async () => {
  await quotes.close();
  await closeDb();
});

test("解析腾讯日线：只留成形的那几行", () => {
  const bars = parseDayBars({
    data: {
      sh000001: {
        qfqday: [
          ["2024-01-02", "2974.110", "2962.280", "2976.000", "2950.000", "250000000.000"],
          ["2024-01-03", "2965.000", "2974.930", "2980.000", "2960.000", "260000000.000"],
        ],
      },
    },
  }, "sh000001");
  assert.deepEqual(bars, [
    { date: "2024-01-02", open: 2974.11, close: 2962.28, high: 2976, low: 2950, volume: 250000000 },
    { date: "2024-01-03", open: 2965, close: 2974.93, high: 2980, low: 2960, volume: 260000000 },
  ]);
  assert.deepEqual(parseDayBars({ data: {} }, "sh000001"), []);
});

test("取一页日线：接口的报错与坏状态都抛出来", async () => {
  const bars = await fetchDayBars("sh000001", { count: 2 }, endpoint("fqkline/get"));
  assert.deepEqual(bars.map((bar) => bar.date), ["2024-01-02", "2024-01-03"]);
  await assert.rejects(() => fetchDayBars("sh000001", { count: 2 }, endpoint("bad")), /param error/);
  await assert.rejects(() => fetchDayBars("sh000001", { count: 2 }, endpoint("down")));
});

test("取日线时把起止日期放在腾讯参数的第 3、4 段", async () => {
  const asked: string[] = [];
  const capture = await stub((_hit, req) => {
    asked.push(new URL(req.url ?? "/", "http://stub").searchParams.get("param")!);
    return { code: 0, data: { sh000001: { day: [["2024-01-02", "1", "1", "1", "1", "1"]] } } };
  });
  try {
    await fetchDayBars("sh000001", { start: "2024-01-01", count: 5 }, `${capture.url}/fqkline/get`);
    await fetchDayBars("sh000001", { end: "2024-12-31", count: 5 }, `${capture.url}/fqkline/get`);
    await fetchDayBars("sh000001", { count: 5 }, `${capture.url}/fqkline/get`);
    assert.deepEqual(asked, [
      "sh000001,day,2024-01-01,,5,qfq",
      "sh000001,day,,2024-12-31,5,qfq",
      "sh000001,day,,,5,qfq",
    ]);
  } finally {
    await capture.close();
  }
});

test("首次补齐：一页页往前翻到没有更多为止", async () => {
  const all = datesDescending("2024-12-31", 645);
  const asked: Array<string | undefined> = [];
  let call = 0;
  const fetchBars = async (_code: string, opts: { end?: string; count: number }) => {
    asked.push(opts.end);
    call += 1;
    return barsOf(call === 1 ? all.slice(0, 640) : all.slice(640));
  };
  const bars = await backfillBars("sh000001", fetchBars);
  assert.equal(bars.length, 645);
  assert.equal(asked[0], undefined);
  assert.equal(asked.length, 2);
  // 第二次翻页问的是第一页最早那天：再往前一天。
  const oldest = new Date(`${all[639]!}T00:00:00Z`);
  oldest.setUTCDate(oldest.getUTCDate() - 1);
  assert.equal(asked[1], oldest.toISOString().slice(0, 10));
  // 结果按交易日升序：翻页越往前，日期越早。
  assert.equal(bars[0]!.date, all.at(-1));
  assert.equal(bars.at(-1)!.date, all[0]);
});

test("刷新：库里没有就补齐，有就从上次那天往后再取一页", async () => {
  const code = `sh${T}`;
  const base = datesDescending("2024-01-05", 5).reverse();
  await refreshCode(code, async () => barsOf(base));
  assert.deepEqual((await loadBars(code)).map((bar) => bar.date), base);

  let asked: string | undefined;
  await refreshCode(code, async (_c, opts) => {
    // 取新区间用起始日期（腾讯参数里是第 3 段），这样接口事后修正的旧行与新增的交易日都会回来。
    asked = opts.start;
    return [
      { date: "2024-01-05", open: 999, close: 999, high: 999, low: 999, volume: 1 },
      ...barsOf(["2024-01-08"], () => 200),
    ];
  });
  assert.equal(asked, "2024-01-05");
  const bars = await loadBars(code);
  assert.equal(bars.at(-1)!.date, "2024-01-08");
  assert.equal(bars.find((bar) => bar.date === "2024-01-05")!.close, 999);
  assert.ok((await quotesFetchedAt()) !== null);
});

test("整体刷新：每只指数各写一份", async () => {
  const out = await refreshQuotes(async () => barsOf(["2024-12-31"]));
  assert.equal(out.length, QUOTE_CODES.length);
  assert.ok(out.every((one) => one.bars === 1));
});

test("行业指数的提供方式代码不混进腾讯抓取清单", () => {
  assert.ok(QUOTE_CODES.every((code) => !code.includes(".")));
  assert.ok(!QUOTE_CODES.includes("801120.SI"));
});

test("行业指数（提供方式代码）的日线只来自提供方快照", async () => {
  const snapshot = {
    updatedAt: "2024-01-03T00:00:00.000Z",
    source: "测试提供方",
    indices: [{ code: "801120.SI", name: "食品饮料", kind: "sector", bars: [{ date: "2024-01-02", close: 100 }, { date: "2024-01-03", close: 110 }], valuations: [] }],
  } as unknown as ProviderSnapshot;
  const { bars, fromProvider } = await barsFor("801120.SI", snapshot);
  assert.equal(fromProvider, true);
  assert.deepEqual(bars.map((bar) => bar.date), ["2024-01-02", "2024-01-03"]);
  // 快照里没有这只指数时是缺失状态，不会去腾讯库里找旧数据顶替。
  assert.deepEqual((await barsFor("801150.SI", snapshot)).bars, []);
});

// 派生图：两年、每月的月初收盘价。2023 从 100 涨到 125（+25%），2024 从 125 跌到 118.75（-5%），
// 2024 年内最深的一次回撤是 120 → 105。
const CLOSES_2023 = [100, 102, 104, 106, 108, 110, 112, 114, 116, 120, 122, 125];
const CLOSES_2024 = [120, 115, 110, 105, 112, 114, 116, 117, 118, 118.5, 118.6, 118.75];
const MONTHLY: QuoteBar[] = [2023, 2024].flatMap((year, y) =>
  (y === 0 ? CLOSES_2023 : CLOSES_2024).map((close, m) => ({
    date: `${year}-${String(m + 1).padStart(2, "0")}-01`, open: close, close, high: close, low: close, volume: 0,
  })));

const CODE = `sh${T}chart`;
const chart = (slug: string, kind: LiveChart["kind"]): LiveChart => ({ group: "broad", slug, kind, code: CODE, indexName: "测试指数" });

const seed = async (bars: QuoteBar[]) => {
  await sql`DELETE FROM chronicle_quotes WHERE code = ${CODE}`;
  await refreshCode(CODE, async () => bars);
};

test("指数走势图直接画收盘价", async () => {
  await seed(MONTHLY);
  const json = await liveChartJson(chart("hs300", "index"));
  assert.equal(json?.meta.type, "line");
  assert.equal(json?.meta.source, LIVE_SOURCE);
  assert.equal((json?.series as unknown[]).length, MONTHLY.length);
  assert.deepEqual((json?.series as Array<{ date: string; value: number }>)[0], { date: "2023-01-01", value: 100 });
});

test("回撤图从 0 往下画，最深的一处对得上", async () => {
  await seed(MONTHLY);
  const json = await liveChartJson(chart("drawdown", "drawdown"));
  assert.equal(json?.meta.type, "drawdown");
  const series = json!.series as Array<{ date: string; value: number }>;
  assert.ok(series.every((point) => point.value <= 0));
  assert.equal(series[0]!.value, 0);
  // 深的是 2024 年内那一段：从 2023 的高点 125 一路跌到 105。
  assert.equal(Math.min(...series.map((point) => point.value)), -16);
});

test("年度回报与年内波动按年算", async () => {
  await seed(MONTHLY);
  const annual = await liveChartJson(chart("annual", "annual"));
  assert.equal(annual?.meta.type, "bar");
  assert.deepEqual(annual?.series, [{ date: "2023", value: 25 }, { date: "2024", value: -5 }]);

  const turbulence = await liveChartJson(chart("intrayear-turbulence", "turbulence"));
  assert.equal(turbulence?.meta.type, "range-bar");
  assert.deepEqual(turbulence?.series, [
    { year: "2023", final: 25, intrayear: 0 },
    { year: "2024", final: -5, intrayear: -12.5 },
  ]);
});

test("波动率、季节性与收益分布出各自的形状", async () => {
  await seed(MONTHLY);
  const volatility = await liveChartJson(chart("volatility", "volatility"));
  assert.equal(volatility?.meta.type, "line");
  const points = volatility!.series as Array<{ date: string; value: number }>;
  assert.equal(points.length, MONTHLY.length - 20);
  assert.ok(points.every((point) => Number.isFinite(point.value) && point.value >= 0));

  const seasonality = await liveChartJson(chart("seasonality", "seasonality"));
  assert.equal(seasonality?.meta.type, "heatmap");
  const heat = seasonality!.series as { data: Array<[number, number, number]>; years: string[]; months: string[] };
  assert.deepEqual(heat.years, ["2023", "2024"]);
  assert.equal(heat.months[0], "Jan");
  assert.equal(heat.data.length, 23); // 24 个月之间的 23 次月度变化
  assert.deepEqual(heat.data[0], [1, 0, 2]); // 2023-02：102 对 100

  const distribution = await liveChartJson(chart("distribution", "distribution"));
  assert.equal(distribution?.meta.type, "distribution-bar");
  const bars = distribution!.series as { bins: string[]; counts: number[] };
  assert.equal(bars.bins.length, bars.counts.length);
  assert.equal(bars.counts.reduce((sum, n) => sum + n, 0), 2);
  assert.equal(bars.counts[3], 1); // 2024 的 -5% 落在 -10~0%
  assert.equal(bars.counts[6], 1); // 2023 的 +25% 落在 20~30%
});

test("滚动年化按 250 日窗口逐日滚动，逐年波动率按自然年切", async () => {
  const daily = (start: number, n: number) => Array.from({ length: n }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));

  // 每天固定涨 0.1%：滚动一年的年化回报应当是一条常数线，前 250 天不出点。
  const rollingDates = daily(Date.UTC(2020, 0, 1), 300);
  await seed(barsOf(rollingDates, (i) => 100 * 1.001 ** i));
  const rolling = await liveChartJson(chart("rolling-year", "rolling"));
  assert.equal(rolling?.meta.type, "line");
  const line = rolling!.series as Array<{ date: string; value: number }>;
  assert.equal(line.length, 300 - 250);
  assert.equal(line[0]!.date, rollingDates[250]);
  assert.ok(Math.abs(line[0]!.value - ((1.001 ** 250) ** (252 / 250) - 1) * 100) < 0.02);

  // 逐年波动率：两个完整自然年各出一个点；交易日不足 20 天的年份不出点。
  const wobble = (i: number) => 100 + 10 * Math.sin(i / 3);
  await seed([
    ...barsOf(daily(Date.UTC(2023, 0, 1), 250), wobble),
    ...barsOf(daily(Date.UTC(2024, 0, 1), 250), wobble),
    ...barsOf(daily(Date.UTC(2025, 0, 1), 5), wobble),
  ]);
  const vol = await liveChartJson(chart("annual-volatility", "annual-vol"));
  assert.equal(vol?.meta.type, "line");
  const years = vol!.series as Array<{ date: string; value: number }>;
  assert.deepEqual(years.map((row) => row.date), ["2023", "2024"]);
  assert.ok(years.every((row) => Number.isFinite(row.value) && row.value > 0));
});

test("相对强弱：两条指数按交易日对齐后相除，并配一条 250 日均线", async () => {
  const A = `sh${T}num`, B = `sh${T}den`;
  await sql`DELETE FROM chronicle_quotes WHERE code = ${A} OR code = ${B}`;
  const days = 300;
  const start = Date.UTC(2020, 0, 1);
  const dates = Array.from({ length: days }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  await refreshCode(A, async () => barsOf(dates, (i) => 100 + i)); // 分子从 100 涨到 399
  await refreshCode(B, async () => barsOf(dates, () => 100)); // 分母恒为 100
  const json = await liveChartJson({ group: "broad", slug: "style-ratios", kind: "relative", code: A, code2: B, indexName: "测试 / 基准" });
  assert.equal(json?.meta.type, "multi-line");
  const series = json!.series as { dates: string[]; seriesData: Record<string, Array<number | null>> };
  assert.equal(series.dates.length, days);
  assert.equal(series.seriesData["相对强弱"]![0], 1);
  assert.equal(series.seriesData["相对强弱"]!.at(-1), 3.99);
  // 均线在凑满 250 个交易日之前留空。
  assert.equal(series.seriesData["250 日均线"]![248], null);
  assert.ok(Number.isFinite(series.seriesData["250 日均线"]![249]));
});

test("轮动总图与行业估值按七条赛道现算", async () => {
  const start = Date.UTC(2021, 0, 4);
  const dates = Array.from({ length: 300 }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  // 每条赛道涨速不同，归一化后就能比较出强弱；序列一路上涨，最新价即区间最高价。
  await saveSnapshot("provider", {
    updatedAt: "2024-01-03T00:00:00.000Z",
    source: "测试提供方",
    indices: SECTOR_TRACKS.map((track, t) => ({
      code: track.code, name: track.name, kind: "sector", classification: "SW2021-L1",
      bars: dates.map((date, i) => ({ date, close: 100 * (1 + 0.0005 * (t + 1)) ** i })),
      valuations: [],
    })),
  } as unknown as ProviderSnapshot);

  const rotation = await liveChartJson({ group: "sectors", slug: "rotation", kind: "rotation", code: SECTOR_TRACKS[0].code, indexName: "七大核心赛道" });
  assert.equal(rotation?.meta.type, "multi-line");
  assert.equal(rotation?.meta.source, "测试提供方");
  const series = rotation!.series as { dates: string[]; seriesData: Record<string, number[]> };
  assert.deepEqual(Object.keys(series.seriesData), SECTOR_TRACKS.map((track) => track.name));
  assert.equal(series.dates.length, dates.length);
  // 共同起点都归一化到 100，涨得快的赛道收在更高处。
  assert.ok(Object.values(series.seriesData).every((values) => values[0] === 100));
  assert.ok(series.seriesData["计算机"]!.at(-1)! > series.seriesData["食品饮料"]!.at(-1)!);

  const valuation = await liveChartJson({ group: "sectors", slug: "sector-valuation", kind: "sector-valuation", code: SECTOR_TRACKS[0].code, indexName: "七大核心赛道" });
  assert.equal(valuation?.meta.type, "bar");
  const bars = valuation!.series as Array<{ date: string; value: number }>;
  assert.deepEqual(bars.map((row) => row.date), SECTOR_TRACKS.map((track) => track.name));
  assert.ok(bars.every((row) => row.value > 99.9)); // 一路上涨，最新价就是近 5 年最高价，分位到顶
});

test("等权组合指数：按当日有数据的成分股等权平均日收益，逐日累乘", () => {
  const computed = compositeIndex([
    [{ date: "2024-01-01", close: 100 }, { date: "2024-01-02", close: 110 }, { date: "2024-01-03", close: 121 }],
    [{ date: "2024-01-01", close: 50 }, { date: "2024-01-02", close: 60 }, { date: "2024-01-03", close: 72 }],
  ]);
  assert.deepEqual(computed.dates, ["2024-01-01", "2024-01-02", "2024-01-03"]);
  assert.deepEqual(computed.values, [100, 115, 132.25]);
  // 起点取最早那只成分股上市的当天；还没上市的成分股在那天之前不参与。
  const late = compositeIndex([
    [{ date: "2024-01-01", close: 100 }, { date: "2024-01-02", close: 110 }],
    [{ date: "2024-01-02", close: 10 }, { date: "2024-01-03", close: 12 }],
  ]);
  assert.deepEqual(late.dates, ["2024-01-01", "2024-01-02", "2024-01-03"]);
  assert.deepEqual(late.values, [100, 110, 132]);
  assert.deepEqual(compositeIndex([]), { name: "", dates: [], values: [] });
});

test("滚动平均相关系数：同步序列为 1，反向为 -1", () => {
  const dates = Array.from({ length: 10 }, (_, i) => `2024-01-${String(i + 1).padStart(2, "0")}`);
  const returns = [0.01, -0.01, 0.02, -0.02, 0.01, 0.005, -0.005, 0.015, 0];
  const series = (name: string, scale: number): ClusterSeries => {
    const values = [100];
    for (const r of returns) values.push(values.at(-1)! * (1 + r * scale));
    return { name, dates, values };
  };
  const same = rollingCorrelation([series("a", 1), series("b", 1)], 3);
  assert.equal(same.length, dates.length - 3);
  assert.ok(same.every((point) => Number.isFinite(point.value) && Math.abs(point.value - 1) < 1e-9));
  const opposite = rollingCorrelation([series("a", 1), series("b", -1)], 3);
  assert.ok(opposite.every((point) => Math.abs(point.value + 1) < 1e-9));
});

test("抱团卷：四代专题各一条等权组合，历史祖谱与相关性按快照现算", async () => {
  const dates = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10));
  // 各条组合的日收益略有差别（相位不同），这样两两相关系数才有意义而不是常数序列。
  const wiggle = (name: string, phase: number): ClusterSeries => {
    const values = [100];
    for (let i = 1; i < dates.length; i++) values.push(values[i - 1]! * (1 + 0.01 * Math.sin((i + phase) / 5)));
    return { name, dates, values };
  };
  await saveSnapshot("clusters", {
    updatedAt: "2024-01-03T00:00:00.000Z",
    source: "测试快照",
    series: [...CLUSTER_COMBOS.map((combo, i) => wiggle(combo.name, i)), ...CLUSTER_THEMES.map((theme, i) => wiggle(theme.name, i))],
    concentration: { name: "沪深 300 前十大权重", dates: ["2024-01-31", "2024-02-29", "2024-03-29"], values: [21.5, 22.1, 22.66] },
    errors: [],
  });

  const combo = await liveChartJson({ group: "clusters", slug: "liquor-club", kind: "cluster-combo", indexName: "茅指数" });
  assert.equal(combo?.meta.type, "line");
  assert.equal(combo?.meta.source, "测试快照");
  assert.equal(combo?.meta.firstDate, dates[0]);
  assert.equal(combo?.meta.lastDate, dates.at(-1));
  assert.equal((combo?.series as unknown[]).length, dates.length);

  const themes = await liveChartJson({ group: "clusters", slug: "predecessors", kind: "cluster-themes", indexName: "金融 / 资源 / 地产 / 消费" });
  assert.equal(themes?.meta.type, "multi-line");
  const shaped = themes!.series as { dates: string[]; seriesData: Record<string, number[]> };
  assert.deepEqual(Object.keys(shaped.seriesData), CLUSTER_THEMES.map((theme) => theme.name));
  assert.equal(shaped.dates.length, dates.length);

  const correlation = await liveChartJson({ group: "clusters", slug: "correlation", kind: "cluster-correlation", indexName: "四大抱团组合" });
  assert.equal(correlation?.meta.type, "line");
  const points = correlation!.series as Array<{ date: string; value: number }>;
  assert.equal(points.length, dates.length - 60);
  assert.ok(points.every((point) => point.value >= -1 && point.value <= 1));

  const concentration = await liveChartJson({ group: "clusters", slug: "concentration", kind: "cluster-concentration", indexName: "沪深 300 前十大权重" });
  assert.equal(concentration?.meta.type, "line");
  assert.deepEqual((concentration!.series as Array<{ value: number }>).map((row) => row.value), [21.5, 22.1, 22.66]);
});

test("库里还没有这只指数的行情时返回 null", async () => {
  await sql`DELETE FROM chronicle_quotes WHERE code = ${CODE}`;
  assert.equal(await liveChartJson(chart("hs300", "index")), null);
});

 test("异常行情整页拒绝，避免过滤导致提前结束翻页", () => {
 for (const row of [["bad-row"], ["2024-02-30","1","1","1","1","0"], ["2024-01-01","","1","1","1","0"], ["2024-01-01","1","0","1","1","0"], ["2024-01-01","1","1","1","1","-1"]]) {
 assert.throws(() => parseDayBars({data:{x:{day:[row]}}}, "x"), /Invalid quote/);
 }
 });
 test("高低点越过开收的真实行钳到开收之外，其余照收", () => {
 const bars = parseDayBars({data:{x:{day:[["2015-03-27","3686.134","3691.096","3710.477","3710.477","408945165.000"]]}}}, "x");
 assert.deepEqual(bars, [{date:"2015-03-27",open:3686.134,close:3691.096,high:3710.477,low:3686.134,volume:408945165}]);
 });
 test("重复历史页立即报错", async () => {
 const page = barsOf(datesDescending("2024-12-31",640));
 let calls=0;
 await assert.rejects(() => backfillBars("x",async()=>{calls++;return page;}), /did not advance/);
 assert.equal(calls,2);
 });
 test("分批写入失败后全部回滚，重跑补齐完整历史", async () => {
 const code = T + "rollback";
 const bars = barsOf(datesDescending("2024-12-31", 650).reverse());
 const bad = bars.map(b=>({...b})); bad[600]!.close = 1e20;
 await assert.rejects(() => refreshCode(code,async()=>bad));
 assert.equal((await loadBars(code)).length,0);
 await refreshCode(code,async(_c,opts)=>bars.filter(b=>!opts.end || b.date<=opts.end).slice(-640));
 assert.equal((await loadBars(code)).length,650);
 });

test("对比只取共同交易日并以共同起点归一", async () => {
 const {compareBars}=await import('../backend/compare.ts');
 const result=compareBars([{name:'a',bars:barsOf(['2024-01-01','2024-01-02','2024-01-03'],i=>[100,120,90][i]!)},{name:'b',bars:barsOf(['2024-01-02','2024-01-03'],i=>[50,60][i]!)}],'2024-01-01','2024-01-03');
 assert.deepEqual(result.dates,['2024-01-02','2024-01-03']);assert.deepEqual(result.seriesData.a,[100,75]);assert.equal(result.summaries[0]!.drawdown,-25);
 assert.equal(compareBars([{name:'a',bars:[]}],'2024-01-01','2024-01-03').summaries[0]!.change,null);
});

test("成分股日线：涨跌幅累乘成前复权收盘价，增量接续时重取的那天不重复累乘", async () => {
  const code = "000001.SZ";
  const asked: Record<string, unknown>[] = [];
  // 2024-01-03 是除息日：原始收盘从 100 掉到 90，但涨跌幅按前收盘价算出来是 0 —— 累乘的前复权序列在这天不塌。
  let rows: Array<Record<string, unknown>> = [
    { ts_code: code, trade_date: "20240104", close: 99, pre_close: 90, pct_chg: 10, vol: 30.6 },
    { ts_code: code, trade_date: "20240103", close: 90, pre_close: 100, pct_chg: 0, vol: 20 },
    { ts_code: code, trade_date: "20240102", close: 100, pre_close: 100, pct_chg: 0, vol: 10 },
  ];
  const request = async (api: string, params: Record<string, unknown>) => {
    asked.push({ api, ...params });
    return rows.map((row) => ({ ...row, ts_code: params.ts_code }));
  };
  const at = new Date("2024-01-05T00:00:00Z");
  const listed = async () => (await sql<Array<{ date: string; close: number }>>`
    SELECT to_char(trade_date, 'YYYY-MM-DD') AS date, close FROM chronicle_quotes WHERE code = ${code} ORDER BY trade_date`)
    .map((row) => [row.date, Number(row.close)]);
  await sql`DELETE FROM chronicle_quotes WHERE code = ${code}`;

  // 首次同步：以最早一天的原始收盘价 100 为起点，往后按涨跌幅累乘。
  await syncStockBars(request, code, at);
  assert.equal(asked[0]!.start_date, "19900101");
  assert.equal(asked[0]!.end_date, "20240105");
  assert.deepEqual(await listed(), [["2024-01-02", 100], ["2024-01-03", 100], ["2024-01-04", 110]]);
  // 成交量按「手」给、可能带小数，落库前取整（volume 列是整数）。
  const volumes = await sql<Array<{ volume: string }>>`
    SELECT volume FROM chronicle_quotes WHERE code = ${code} ORDER BY trade_date`;
  assert.deepEqual(volumes.map((row) => Number(row.volume)), [10, 20, 31]);

  // 增量：从库里最后一天重取，接续的那天保持已存值（不再乘一次），只把新的一天按涨跌幅往后接。
  asked.length = 0;
  rows = [
    { ts_code: code, trade_date: "20240105", close: 108.9, pre_close: 99, pct_chg: 10, vol: 40 },
    { ts_code: code, trade_date: "20240104", close: 99, pre_close: 90, pct_chg: 10, vol: 30 },
  ];
  await syncStockBars(request, code, at);
  assert.equal(asked[0]!.start_date, "20240104");
  assert.deepEqual(await listed(), [["2024-01-02", 100], ["2024-01-03", 100], ["2024-01-04", 110], ["2024-01-05", 121]]);

  // 代码对不上的行整批拒绝，不把缺了几天或串了代码的序列接起来。
  await assert.rejects(() => syncStockBars(async () => [{ ts_code: "600519.SH", trade_date: "20240108", close: 1, pre_close: 1, pct_chg: 0 }], code, at), /Invalid daily row/);
});

test("抱团卷：成分股日线按提供方代码取齐，现算成八个组合走势", async () => {
  const seen = new Set<string>();
  const request = async (api: string, params: Record<string, unknown>) => {
    if (api === "index_weight") return [{ index_code: "000300.SH", con_code: "600519.SH", trade_date: "20240131", weight: 5 }];
    seen.add(String(params.ts_code));
    return [{ ts_code: params.ts_code, trade_date: "20240103", close: 10, pre_close: 9.5, pct_chg: 5.26, vol: null }];
  };
  const now = new Date("2024-01-04T00:00:00Z");
  await sql`DELETE FROM chronicle_quotes WHERE code = ANY(${CLUSTER_CODES})`;
  const snapshot = await refreshClusters({ request, now });

  // 名单里的每一只都按提供方式代码取一遍日线，组合也按同一套代码去库里取回。
  assert.deepEqual([...seen].sort(), [...CLUSTER_CODES].sort());
  assert.deepEqual(snapshot.errors, []);
  assert.equal(snapshot.series.length, CLUSTER_GROUPS.length);
  assert.ok(snapshot.series.every((one) => one.dates.length === 1 && one.values[0] === 100));
  assert.ok(snapshot.concentration.dates.includes("2024-01-31"));
});
