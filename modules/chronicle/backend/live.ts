// 编年史的实时行情：精选页那张分时 / 日K 图的数据。
// 主源是东方财富的公开行情接口（分时走 trends2，日线走 kline），失败回退腾讯证券。
// 第三方请求都走服务端（前端只读 /api/chronicle/live），这里再挂一层 15 秒的内存缓存，
// 让同一个 15 秒窗口里的访客共用一份，第三方不会被反复打。
import { guardedFetch, requireOk } from "@aihot/backend/lib/http-fetch";
import { indexName, type LiveIndex } from "../catalog.ts";
import { fetchDayBars } from "./quotes.ts";

/** 分时或日K。 */
export type LiveKind = "minute" | "day";

/** 东财的行情主机：实时分时在 push2，历史日线只有 push2his 有（push2 查日线回空表）。
    主机偶发连不上或 302 回首页，按顺序试，全不行再退回腾讯。 */
const EASTMONEY_MINUTE_HOSTS: readonly string[] = ["https://push2.eastmoney.com", "https://push2his.eastmoney.com"];
const EASTMONEY_DAY_HOSTS: readonly string[] = ["https://push2his.eastmoney.com"];
const TENCENT = "https://web.ifzq.gtimg.cn";
/** 服务端的缓存时长：与网页的轮询间隔一致。 */
const TTL = 15_000;
/** 日K一次取多少根，够画半年的走势。 */
const DAY_BARS = 120;
const SOURCE_EASTMONEY = "东方财富公开行情接口";
const SOURCE_TENCENT = "腾讯证券公开行情接口";

/** 同两只指数在东财与腾讯两套接口里的代码写法。 */
const CODES: Record<LiveIndex, { east: string; tencent: string }> = {
  sh000001: { east: "1.000001", tencent: "sh000001" },
  sz399006: { east: "0.399006", tencent: "sz399006" },
};

export interface LiveMinute {
  /** 时间，HH:MM。 */
  time: string;
  price: number;
  volume: number;
}

export interface LiveBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export interface LiveQuote {
  price: number;
  change: number;
  changePct: number;
  high: number | null;
  low: number | null;
  /** 分时是时间（HH:MM），日K是日期。 */
  time: string | null;
}

export interface LivePayload {
  code: LiveIndex;
  name: string;
  kind: LiveKind;
  source: string;
  /** 昨收：涨跌幅的基准。 */
  preClose: number | null;
  quote: LiveQuote | null;
  minutes: LiveMinute[];
  bars: LiveBar[];
  /** 这一份是什么时候抓的（ISO）。 */
  fetchedAt: string;
}

/** 数字字符串 → number；空串与不是有限数的都是 null。 */
function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** 东财分时的响应 → 昨收与分钟点；坏行整页抛错，交给调用方回退腾讯。 */
export function parseEastMinutes(payload: unknown): { preClose: number | null; minutes: LiveMinute[] } {
  const data = (payload as { data?: { trends?: unknown; preClose?: unknown; prePrice?: unknown } } | null)?.data;
  const rows = data?.trends;
  if (!Array.isArray(rows)) throw new Error("eastmoney minute: unexpected response");
  const minutes = rows.map((row) => {
    // 每一行是「时间,开,收,高,低,量,额,均价」，取时间与最新价。
    const fields = typeof row === "string" ? row.split(",") : [];
    const time = fields[0] ?? "";
    const price = num(fields[2]);
    const volume = num(fields[5]);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time) || price === null || price <= 0 || volume === null || volume < 0) {
      throw new Error(`eastmoney minute: bad row ${String(row)}`);
    }
    return { time: time.slice(11), price, volume: Math.round(volume) };
  });
  return { preClose: num(data?.preClose) ?? num(data?.prePrice), minutes };
}

/** 东财日线的响应 → 日K数组；坏行整页抛错。 */
export function parseEastDay(payload: unknown): LiveBar[] {
  const data = (payload as { data?: { klines?: unknown } } | null)?.data;
  const rows = data?.klines;
  if (!Array.isArray(rows)) throw new Error("eastmoney kline: unexpected response");
  return rows.map((row) => {
    // 每一行是「日期,开,收,高,低,量,额」。
    const fields = typeof row === "string" ? row.split(",") : [];
    const date = fields[0] ?? "";
    const open = num(fields[1]);
    const close = num(fields[2]);
    const high = num(fields[3]);
    const low = num(fields[4]);
    const volume = num(fields[5]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || open === null || close === null || high === null || low === null || volume === null) {
      throw new Error(`eastmoney kline: bad bar ${String(row)}`);
    }
    if (!(open > 0 && close > 0 && high > 0 && low > 0) || low > Math.min(open, close) || high < Math.max(open, close) || volume < 0) {
      throw new Error(`eastmoney kline: bad bar ${String(row)}`);
    }
    return { date, open, close, high, low, volume: Math.round(volume) };
  });
}

/** 腾讯分时的响应 → 昨收与分钟点（累计成交量差分出这一分钟的量）。 */
export function parseTencentMinutes(payload: unknown, code: string): { preClose: number | null; minutes: LiveMinute[] } {
  const node = (payload as { data?: Record<string, { data?: { data?: unknown }; qt?: Record<string, unknown> }> } | null)?.data?.[code];
  const rows = node?.data?.data;
  if (!Array.isArray(rows)) throw new Error("tencent minute: unexpected response");
  let previous = 0;
  const minutes = rows.map((row) => {
    // 每一行是「时间(HHMM) 价格 累计成交量 累计成交额」。
    const fields = typeof row === "string" ? row.trim().split(/\s+/) : [];
    const clock = fields[0] ?? "";
    const price = num(fields[1]);
    const cumulative = num(fields[2]);
    if (!/^\d{4}$/.test(clock) || price === null || price <= 0 || cumulative === null || cumulative < 0) {
      throw new Error(`tencent minute: bad row ${String(row)}`);
    }
    const volume = Math.max(0, Math.round(cumulative - previous));
    previous = Math.max(previous, cumulative);
    return { time: `${clock.slice(0, 2)}:${clock.slice(2)}`, price, volume };
  });
  const quote = node?.qt?.[code];
  return { preClose: Array.isArray(quote) ? num(quote[4]) : null, minutes };
}

/** 报价：以昨收为基准算涨跌。昨收缺失时不报价，图照画。 */
function quoteOf(preClose: number | null, price: number, high: number | null, low: number | null, time: string | null): LiveQuote | null {
  if (preClose === null || preClose <= 0) return null;
  const change = price - preClose;
  return {
    price: round2(price), change: round2(change), changePct: round2((change / preClose) * 100),
    high: high === null ? null : round2(high), low: low === null ? null : round2(low), time,
  };
}

function minutePayload(code: LiveIndex, source: string, preClose: number | null, minutes: readonly LiveMinute[]): LivePayload {
  const last = minutes.at(-1)!;
  const prices = minutes.map((minute) => minute.price);
  return {
    code, name: indexName(code), kind: "minute", source, preClose,
    quote: quoteOf(preClose, last.price, Math.max(...prices), Math.min(...prices), last.time),
    minutes: [...minutes], bars: [], fetchedAt: new Date().toISOString(),
  };
}

function dayPayload(code: LiveIndex, source: string, bars: readonly LiveBar[]): LivePayload {
  const last = bars.at(-1)!;
  const preClose = bars.at(-2)?.close ?? null;
  return {
    code, name: indexName(code), kind: "day", source, preClose,
    quote: quoteOf(preClose, last.close, last.high, last.low, last.date),
    minutes: [], bars: [...bars], fetchedAt: new Date().toISOString(),
  };
}

async function eastMinutes(code: LiveIndex, base: string): Promise<LivePayload> {
  // fields1 里的 f8 就是昨收，少了它 preClose 不回来（涨跌幅与昨收线都画不出来）。
  const url = `${base}/api/qt/stock/trends2/get?secid=${CODES[code].east}`
    + "&fields1=f1,f2,f3,f4,f5,f6,f8&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscr=0&iscca=0";
  const response = requireOk(await guardedFetch(url, { timeoutMs: 10_000 }), `chronicle live ${code}`);
  const { preClose, minutes } = parseEastMinutes(JSON.parse(response.text()) as unknown);
  if (minutes.length === 0) throw new Error(`eastmoney minute: no points for ${code}`);
  return minutePayload(code, SOURCE_EASTMONEY, preClose, minutes);
}

async function eastDay(code: LiveIndex, base: string): Promise<LivePayload> {
  // 不能带 beg：带上 beg=0 东财会忽略 lmt，一次回全部历史（近九千根）。
  const url = `${base}/api/qt/stock/kline/get?secid=${CODES[code].east}`
    + `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&end=20500101&lmt=${DAY_BARS}`;
  const response = requireOk(await guardedFetch(url, { timeoutMs: 10_000 }), `chronicle live ${code}`);
  const bars = parseEastDay(JSON.parse(response.text()) as unknown);
  if (bars.length === 0) throw new Error(`eastmoney kline: no bars for ${code}`);
  return dayPayload(code, SOURCE_EASTMONEY, bars);
}

async function tencentMinutes(code: LiveIndex, base: string): Promise<LivePayload> {
  const tencent = CODES[code].tencent;
  const url = `${base}/appstock/app/minute/query?code=${tencent}`;
  const response = requireOk(await guardedFetch(url, { timeoutMs: 10_000 }), `chronicle live ${code}`);
  const { preClose, minutes } = parseTencentMinutes(JSON.parse(response.text()) as unknown, tencent);
  if (minutes.length === 0) throw new Error(`tencent minute: no points for ${code}`);
  return minutePayload(code, SOURCE_TENCENT, preClose, minutes);
}

async function tencentDay(code: LiveIndex, base: string): Promise<LivePayload> {
  const bars = await fetchDayBars(CODES[code].tencent, { count: DAY_BARS }, `${base}/appstock/app/fqkline/get`);
  if (bars.length === 0) throw new Error(`tencent kline: no bars for ${code}`);
  return dayPayload(code, SOURCE_TENCENT, [...bars].sort((a, b) => a.date.localeCompare(b.date)));
}

/** 抓一只指数的一份实时数据：东财为主，失败回退腾讯。`base` 供测试指向本地假服务。 */
export async function fetchLive(
  code: LiveIndex,
  kind: LiveKind,
  base: { minute: readonly string[]; day: readonly string[]; tencent: string } = {
    minute: EASTMONEY_MINUTE_HOSTS, day: EASTMONEY_DAY_HOSTS, tencent: TENCENT,
  },
): Promise<LivePayload> {
  for (const host of kind === "minute" ? base.minute : base.day) {
    try {
      return kind === "minute" ? await eastMinutes(code, host) : await eastDay(code, host);
    } catch {
      // 这个主机不行（连不上、302 回首页、回空表或坏数据），换下一个。
    }
  }
  return kind === "minute" ? await tencentMinutes(code, base.tencent) : await tencentDay(code, base.tencent);
}

const cache = new Map<string, { at: number; payload: LivePayload }>();

/** 带 15 秒缓存的读取：网页每次轮询都打这里，第三方一个窗口内只被访问一次。 */
export async function loadLive(code: LiveIndex, kind: LiveKind): Promise<LivePayload> {
  const key = `${code}:${kind}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.payload;
  const payload = await fetchLive(code, kind);
  cache.set(key, { at: Date.now(), payload });
  return payload;
}
