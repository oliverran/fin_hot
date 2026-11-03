// 接口指标：api 进程内按「北京日期 × 路由」累计，每分钟把这一分钟的增量并进 analytics_http。
// 页面读落库后的按天聚合，再加上还没落库的那一分钟；进程重启最多丢最后一分钟。
// 延迟按上界分桶累计，p95 从桶里估出来——每条请求只加几个整数，不落明细。
import { sql } from "@aihot/backend/db";
import { addDays, beijingDate } from "@aihot/contracts/time";
import type { AdminAnalyticsHttp, AdminAnalyticsHttpRoute } from "@aihot/contracts/admin";

/** 延迟分桶的上界（毫秒）；最后还有一格没有上界，落在 ms_max。 */
const BOUNDS = [50, 100, 300, 1000, 3000] as const;
/** 每次排行取多少行。 */
const ROUTE_LIMIT = 30;
/** 路由器没匹配上任何路由时的名字（地址由访客给，不能当路由名，否则行数没有上限）。 */
export const UNMATCHED = "未匹配";

/** 一段时间里累计出来的东西。 */
type Tally = { requests: number; errors: number; msTotal: number; msMax: number; buckets: number[] };

const empty = (): Tally => ({ requests: 0, errors: 0, msTotal: 0, msMax: 0, buckets: BOUNDS.map(() => 0).concat(0) });

function add(into: Tally, one: Tally): Tally {
  into.requests += one.requests;
  into.errors += one.errors;
  into.msTotal += one.msTotal;
  if (one.msMax > into.msMax) into.msMax = one.msMax;
  one.buckets.forEach((n, i) => { into.buckets[i]! += n; });
  return into;
}

/** 还没落库的累计，键是「北京日期\u0000路由」。 */
let pending = new Map<string, Tally>();

/** 一个请求答完：加进这一分钟的累计。 */
export function noteHttp(path: string, status: number, ms: number, now = new Date()): void {
  const key = `${beijingDate(now)}\u0000${path}`;
  const row = pending.get(key) ?? empty();
  row.requests += 1;
  if (status >= 500) row.errors += 1;
  row.msTotal += ms;
  if (ms > row.msMax) row.msMax = ms;
  const bucket = BOUNDS.findIndex((bound) => ms <= bound);
  row.buckets[bucket < 0 ? BOUNDS.length : bucket]! += 1;
  pending.set(key, row);
}

/** 把攒下的累计并进 analytics_http（同一天同一路由相加），返回写了几个路由；落库失败这一分钟就丢了。 */
export async function flushHttp(): Promise<number> {
  const taken = pending;
  pending = new Map();
  if (!taken.size) return 0;
  const rows = [...taken].map(([key, row]) => {
    const [day, path] = key.split("\u0000") as [string, string];
    const [le50, le100, le300, le1000, le3000, over] = row.buckets as [number, number, number, number, number, number];
    return { day, path, requests: row.requests, errors: row.errors, ms_total: row.msTotal, ms_max: row.msMax,
      le_50: le50, le_100: le100, le_300: le300, le_1000: le1000, le_3000: le3000, gt_3000: over };
  });
  await sql`
    INSERT INTO analytics_http ${sql(rows, "day", "path", "requests", "errors", "ms_total", "ms_max", "le_50", "le_100", "le_300", "le_1000", "le_3000", "gt_3000")}
    ON CONFLICT (day, path) DO UPDATE SET
      requests = analytics_http.requests + EXCLUDED.requests,
      errors = analytics_http.errors + EXCLUDED.errors,
      ms_total = analytics_http.ms_total + EXCLUDED.ms_total,
      ms_max = greatest(analytics_http.ms_max, EXCLUDED.ms_max),
      le_50 = analytics_http.le_50 + EXCLUDED.le_50,
      le_100 = analytics_http.le_100 + EXCLUDED.le_100,
      le_300 = analytics_http.le_300 + EXCLUDED.le_300,
      le_1000 = analytics_http.le_1000 + EXCLUDED.le_1000,
      le_3000 = analytics_http.le_3000 + EXCLUDED.le_3000,
      gt_3000 = analytics_http.gt_3000 + EXCLUDED.gt_3000`;
  return rows.length;
}

/** 第 95 百分位的耗时：累计到盖住 95% 的那一格，取它的上界；落在溢出格时用这段时间的最大耗时。 */
function p95(t: Tally): number {
  if (!t.requests) return 0;
  const target = Math.ceil(0.95 * t.requests);
  let seen = 0;
  for (let i = 0; i < t.buckets.length; i++) {
    seen += t.buckets[i]!;
    if (seen >= target) return i < BOUNDS.length ? BOUNDS[i]! : t.msMax;
  }
  return t.msMax;
}

const average = (t: Tally) => (t.requests ? Math.round(t.msTotal / t.requests) : 0);

interface HttpRow {
  day: string; path: string; requests: number; errors: number; ms_total: number; ms_max: number;
  le_50: number; le_100: number; le_300: number; le_1000: number; le_3000: number; gt_3000: number;
}

export async function httpReport(days: number, now = new Date()): Promise<AdminAnalyticsHttp> {
  const window = Math.min(365, Math.max(1, Math.floor(days) || 30));
  const today = beijingDate(now);
  const start = addDays(today, -(window - 1));
  const rows = await sql<HttpRow[]>`
    SELECT day::text AS day, path, requests::int AS requests, errors::int AS errors, ms_total::int AS ms_total, ms_max,
           le_50, le_100, le_300, le_1000, le_3000, gt_3000
      FROM analytics_http WHERE day >= ${start} AND day <= ${today}`;
  const byDay = new Map<string, Tally>();
  const byPath = new Map<string, Tally>();
  const into = (map: Map<string, Tally>, key: string, one: Tally) => map.set(key, add(map.get(key) ?? empty(), one));
  for (const row of rows) {
    const one = { requests: row.requests, errors: row.errors, msTotal: row.ms_total, msMax: row.ms_max,
      buckets: [row.le_50, row.le_100, row.le_300, row.le_1000, row.le_3000, row.gt_3000] };
    into(byDay, row.day, one);
    into(byPath, row.path, one);
  }
  // 还没落库的那一分钟也读出来，页面不用等下一次落库。
  for (const [key, one] of pending) {
    const [day, path] = key.split("\u0000") as [string, string];
    if (day >= start && day <= today) { into(byDay, day, one); into(byPath, path, one); }
  }

  const trend = [];
  for (let i = 0; i < window; i++) {
    const day = addDays(start, i);
    const t = byDay.get(day) ?? empty();
    trend.push({ day, requests: t.requests, errors: t.errors, msAvg: average(t), msP95: p95(t) });
  }
  const now2 = byDay.get(today) ?? empty();
  const routes: AdminAnalyticsHttpRoute[] = [...byPath]
    .map(([key, t]) => ({ key, requests: t.requests, errors: t.errors, msAvg: average(t), msP95: p95(t), msMax: t.msMax }))
    .sort((a, b) => b.requests - a.requests || a.key.localeCompare(b.key))
    .slice(0, ROUTE_LIMIT);
  return { today: { requests: now2.requests, errors: now2.errors, msAvg: average(now2), msP95: p95(now2) }, trend, routes };
}
