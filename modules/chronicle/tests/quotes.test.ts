// 编年史的行情：解析腾讯日线、翻页补齐、落库，以及由日线现算的派生图。
// 抓取只连本地的假服务（stub），不访问任何外部地址。
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { Reply, stub, tag } from "../../../tests/setup.ts";
import { LIVE_SOURCE, type LiveChart } from "../catalog.ts";
import { liveChartJson } from "../backend/charts.ts";
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
          ["2024-01-03", "2965.000", "2974.930", "2980.000", "2960.000", "260000000.000"],        ],
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

test("库里还没有这只指数的行情时返回 null", async () => {
  await sql`DELETE FROM chronicle_quotes WHERE code = ${CODE}`;
  assert.equal(await liveChartJson(chart("hs300", "index")), null);
});

 test("异常行情整页拒绝，避免过滤导致提前结束翻页", () => {
 for (const row of [["bad-row"], ["2024-02-30","1","1","1","1","0"], ["2024-01-01","","1","1","1","0"], ["2024-01-01","1","0","1","1","0"], ["2024-01-01","2","2","1","1","0"], ["2024-01-01","1","1","1","1","-1"]]) {
 assert.throws(() => parseDayBars({data:{x:{day:[row]}}}, "x"), /Invalid quote/);
 }
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
