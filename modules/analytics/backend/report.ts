// 后台「指标监控」页的读取与每日汇总。
// 明细按天保留（ANALYTICS_RETENTION_DAYS），长期趋势读每日汇总：当天的数现读明细，
// 历史日优先用明细现算（明细比汇总新），超出明细保留期的日子才退回汇总。
import { sql } from "@aihot/backend/db";
import type { AdminAnalytics, AdminAnalyticsDay, AdminAnalyticsEntry, AdminAnalyticsRank } from "@aihot/contracts/admin";
import { addDays, beijingDate } from "@aihot/contracts/time";
import { opsReport } from "./ops.ts";

/** 「重算最近几天」的上限：更早的汇总不再变，重算只是修掉跨零点边界附近写进来的那几行。 */
const RECOMPUTE_DAYS = 2;
/** 每次排行榜取多少行。 */
const RANK_LIMIT = 30;
/** 明细至少保留多久：比 RECOMPUTE_DAYS 长，重算才读不到已删的明细。 */
const MIN_RETENTION_DAYS = RECOMPUTE_DAYS + 2;

/** 明细保留天数（ANALYTICS_RETENTION_DAYS，默认 90）。 */
function retentionDays(): number {
  return Math.max(MIN_RETENTION_DAYS, Math.floor(Number(process.env.ANALYTICS_RETENTION_DAYS) || 90));
}

export async function analyticsReport(days: number, now = new Date()): Promise<AdminAnalytics> {
  const window = Math.min(365, Math.max(1, Math.floor(days) || 30));
  const today = beijingDate(now);
  const start = addDays(today, -(window - 1));

  // 每日汇总：一天写一次的历史数字，保留期比明细长。
  const daily = await sql<AdminAnalyticsDay[]>`
    SELECT day::text AS day, views, visitors, clicks
      FROM analytics_daily WHERE day >= ${start} AND day <= ${today}`;
  // 明细：窗口内每一天现算。同一天两者都有时用明细，它比汇总新。
  const live = await sql<AdminAnalyticsDay[]>`
    SELECT day::text AS day,
           count(*) FILTER (WHERE kind = 'pageview') AS views,
           count(DISTINCT visitor) AS visitors,
           count(*) FILTER (WHERE kind = 'click') AS clicks
      FROM analytics_events
     WHERE day >= ${start} AND day <= ${today}
     GROUP BY day`;

  const byDay = new Map<string, AdminAnalyticsDay>();
  for (const row of daily) byDay.set(row.day, row);
  for (const row of live) byDay.set(row.day, row);

  const trend: AdminAnalyticsDay[] = [];
  for (let i = 0; i < window; i++) {
    const day = addDays(start, i);
    trend.push(byDay.get(day) ?? { day, views: 0, visitors: 0, clicks: 0 });
  }

  const pages = await sql<AdminAnalyticsRank[]>`
    SELECT path AS key, count(*) AS views, count(DISTINCT visitor) AS visitors
      FROM analytics_events
     WHERE day >= ${start} AND kind = 'pageview'
     GROUP BY path ORDER BY views DESC, key LIMIT ${RANK_LIMIT}`;
  const modules = await sql<AdminAnalyticsRank[]>`
    SELECT module AS key, count(*) AS views, count(DISTINCT visitor) AS visitors
      FROM analytics_events
     WHERE day >= ${start} AND kind = 'pageview'
     GROUP BY module ORDER BY views DESC, key LIMIT ${RANK_LIMIT}`;
  const entries = await sql<AdminAnalyticsEntry[]>`
    SELECT label AS key, count(*) AS clicks, count(DISTINCT visitor) AS visitors
      FROM analytics_events
     WHERE day >= ${start} AND kind = 'click' AND label IS NOT NULL
     GROUP BY label ORDER BY clicks DESC, key LIMIT ${RANK_LIMIT}`;

  const ops = await opsReport(window, now);
  return { days: window, today: byDay.get(today) ?? { day: today, views: 0, visitors: 0, clicks: 0 }, trend, pages, modules, entries, ops };
}

/** 每天把最近几天的明细重算进每日汇总（幂等），并删掉超过保留期的明细。 */
export async function analyticsRetention(now: Date): Promise<Record<string, unknown>> {
  const today = beijingDate(now);
  const from = addDays(today, -RECOMPUTE_DAYS);
  const rolled = await sql`
    INSERT INTO analytics_daily (day, views, visitors, clicks)
    SELECT day,
           count(*) FILTER (WHERE kind = 'pageview'),
           count(DISTINCT visitor),
           count(*) FILTER (WHERE kind = 'click')
      FROM analytics_events
     WHERE day >= ${from} AND day < ${today}
     GROUP BY day
    ON CONFLICT (day) DO UPDATE
       SET views = excluded.views, visitors = excluded.visitors, clicks = excluded.clicks`;
  const deleted = await sql`DELETE FROM analytics_events WHERE day < ${addDays(today, -retentionDays())}`;
  return { analyticsRolled: rolled.count, analyticsDeleted: deleted.count };
}
