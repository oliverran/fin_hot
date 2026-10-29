// 编年史的行情来源：腾讯证券的公开日线接口 → chronicle_quotes 表。
// 只抓 LIVE_CHARTS 点名的那几只宽基指数；行业、抱团等没有公开免费口径的图仍用随包的示例数据。
// 抓取走 lib/http-fetch 的 guardedFetch（SSRF 守卫、超时、字节上限），单次最多取 640 条日线，
// 所以首次补齐要走多轮翻页，之后的每日刷新只取最近一页。
import { sql } from "@aihot/backend/db";
import { guardedFetch, requireOk } from "@aihot/backend/lib/http-fetch";
import { LIVE_CHARTS } from "../catalog.ts";

const ENDPOINT = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
/** 接口单次能回的最大条数，再多会返回 param error。 */
const PAGE = 640;
/** 沪深两市最早的指数数据在 1990-12-19，翻页到此为止（也挡住接口异常时的死循环）。 */
const EARLIEST = "1990-01-01";
const SOURCE = "tencent";

export interface QuoteBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

/** 要抓的指数代码。 */
export const QUOTE_CODES: readonly string[] = [...new Set(LIVE_CHARTS.map((chart) => chart.code))];

/** 一天前，用来把翻页的区间往前挪。 */
function dayBefore(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

/** 腾讯的响应 → 日线数组；不认得的形状与不成行的数据都丢掉。 */
export function parseDayBars(payload: unknown, code: string): QuoteBar[] {
  const day = (payload as { data?: Record<string, { day?: unknown; qfqday?: unknown }> } | null)?.data?.[code];
  const rows = day?.qfqday ?? day?.day;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    // 每一行是 [日期, 开, 收, 高, 低, 成交量]。
    if (!Array.isArray(row) || row.length < 6) return [];
    const [date, open, close, high, low, volume] = row as string[];
    const bar = {
      date: date!, open: Number(open), close: Number(close), high: Number(high), low: Number(low),
      volume: Number.isFinite(Number(volume)) ? Math.round(Number(volume)) : 0,
    };
    return /^\d{4}-\d{2}-\d{2}$/.test(bar.date) && [bar.open, bar.close, bar.high, bar.low].every(Number.isFinite) ? [bar] : [];
  });
}

/**
 * 取一页日线。腾讯的参数是 `代码,周期,起始,结束,条数,复权`，返回区间内**最后** count 条，
 * 所以起始与结束都留空就是最近的 count 条，给结束日期就往前翻页，给起始日期就往后取新数据。
 */
export async function fetchDayBars(
  code: string,
  opts: { start?: string; end?: string; count: number },
  endpoint = ENDPOINT,
): Promise<QuoteBar[]> {
  const param = `${code},day,${opts.start ?? ""},${opts.end ?? ""},${opts.count},qfq`;
  const res = requireOk(await guardedFetch(`${endpoint}?param=${param}`, { timeoutMs: 30_000 }), `chronicle quotes ${code}`);
  const payload = JSON.parse(res.text()) as { code?: number; msg?: string };
  if (payload.code !== 0) throw new Error(`tencent quotes ${code}: ${payload.msg || "unexpected response"}`);
  return parseDayBars(payload, code);
}

/** 首次补齐一只指数的全部历史：每次带着上一页最早的那天往前翻一页。 */
export async function backfillBars(code: string, fetchBars = fetchDayBars): Promise<QuoteBar[]> {
  const all: QuoteBar[] = [];
  let end: string | undefined;
  for (;;) {
    const page = await fetchBars(code, { end, count: PAGE });
    if (page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE) break;
    // 接口的行序不保证：取这一页里最早的那天，再往前一天当作下一页的区间右端。
    const oldest = page.reduce((min, bar) => (bar.date < min ? bar.date : min), page[0]!.date);
    end = dayBefore(oldest);
    if (end <= EARLIEST) break;
  }
  return all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 库里这只指数最后一个交易日；还没有数据时是 null。 */
async function lastDate(code: string): Promise<string | null> {
  const [row] = await sql<{ last: string | null }[]>`
    SELECT to_char(max(trade_date), 'YYYY-MM-DD') AS last FROM chronicle_quotes WHERE code = ${code}`;
  return row?.last ?? null;
}

/** 写库：同一 (指数, 交易日) 只留一份，重跑或接口事后修正都以最新一次为准。 */
async function storeBars(code: string, bars: readonly QuoteBar[]): Promise<number> {
  if (bars.length === 0) return 0;
  for (let i = 0; i < bars.length; i += 500) {
    const rows = bars.slice(i, i + 500).map((bar) => ({
      code, trade_date: bar.date, open: bar.open, close: bar.close, high: bar.high, low: bar.low, volume: bar.volume, source: SOURCE,
    }));
    await sql`INSERT INTO chronicle_quotes ${sql(rows)}
      ON CONFLICT (code, trade_date) DO UPDATE SET open = EXCLUDED.open, close = EXCLUDED.close,
        high = EXCLUDED.high, low = EXCLUDED.low, volume = EXCLUDED.volume, source = EXCLUDED.source, fetched_at = now()`;
  }
  return bars.length;
}

/** 刷新一只指数：库里没有就从最早补起，有就从上次那天起再取一页（接口事后修正与新增的交易日都会一并写入）。 */
export async function refreshCode(code: string, fetchBars = fetchDayBars): Promise<{ code: string; bars: number; last: string | null }> {
  const last = await lastDate(code);
  const bars = last ? await fetchBars(code, { start: last, count: PAGE }) : await backfillBars(code, fetchBars);
  return { code, bars: await storeBars(code, bars), last: await lastDate(code) };
}

/** 全部指数刷新一遍：worker 在交易日收盘后跑，按顺序一只一只补。 */
export async function refreshQuotes(fetchBars = fetchDayBars): Promise<Array<{ code: string; bars: number; last: string | null }>> {
  const out: Array<{ code: string; bars: number; last: string | null }> = [];
  for (const code of QUOTE_CODES) out.push(await refreshCode(code, fetchBars));
  return out;
}

/** 一只指数的全部日线，按交易日升序。 */
export async function loadBars(code: string): Promise<QuoteBar[]> {
  return await sql<QuoteBar[]>`
    SELECT to_char(trade_date, 'YYYY-MM-DD') AS date, open, close, high, low, volume
    FROM chronicle_quotes WHERE code = ${code} ORDER BY trade_date`;
}

/** 行情最后一次写入的时间（ISO）；库里还没有行情时是 null。 */
export async function quotesFetchedAt(): Promise<string | null> {
  const [row] = await sql<{ at: Date | null }[]>`SELECT max(fetched_at) AS at FROM chronicle_quotes`;
  return row?.at ? row.at.toISOString() : null;
}
