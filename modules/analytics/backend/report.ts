// 后台「指标监控」页的读取与每日汇总。
// 只统计「真实访客日」：同一天里同一个访客号至少留下两条事件才算人。爬虫与无头渲染器不保留
// 本地访客号，每打开一页就换一个新号，只命中一次的整条都不计——浏览、点击与访客同一套口径。
// 明细按天保留（ANALYTICS_RETENTION_DAYS），长期趋势读每日汇总：当天的数现读明细，
// 明细里还在的日子优先用明细现算（明细比汇总新），超出明细保留期的日子才退回汇总。
import { POLICY } from "@aihot/site";
import { sql } from "@aihot/backend/db";
import type { AdminAnalytics, AdminAnalyticsDay, AdminAnalyticsEntry, AdminAnalyticsRank } from "@aihot/contracts/admin";
import { addDays, beijingDate } from "@aihot/contracts/time";
import { opsReport } from "./ops.ts";

/** 每次排行榜取多少行。 */
const RANK_LIMIT = 30;
/** 明细至少保留几天：部署可以调长到隐私说明的上限，太短趋势就没几天可看。 */
const MIN_RETENTION_DAYS = 4;

/** 部署可以缩短明细保留期，最长遵循站点的隐私说明。 */
function retentionDays(): number {
  const limit = POLICY.privacy.retentionDays;
  return Math.min(limit, Math.max(MIN_RETENTION_DAYS, Math.floor(Number(process.env.ANALYTICS_RETENTION_DAYS) || limit)));
}

/**
 * 真实访客日：同一天里同一访客号至少两条事件才算人。
 * 只有一次命中的当机器流量——爬虫与无头渲染器不保留本地访客号，每开一页就换一个新号。
 * 浏览、点击与访客都只取这些日子的事件，各处的口径因此一致。明细表本身不超过保留期，这里不再按日期过滤。
 */
const realVisitorDays = () => sql`
  SELECT day, visitor FROM analytics_events
   GROUP BY day, visitor HAVING count(*) >= 2`;

export async function analyticsReport(days: number, now = new Date()): Promise<AdminAnalytics> {
  const window = Math.min(365, Math.max(1, Math.floor(days) || 30));
  const today = beijingDate(now);
  const start = addDays(today, -(window - 1));

  // 每日汇总：一天写一次的历史数字，保留期比明细长。
  const daily = await sql<AdminAnalyticsDay[]>`
    SELECT day::text AS day, views, visitors, clicks
      FROM analytics_daily WHERE day >= ${start} AND day <= ${today}`;
  // 明细：窗口内每一天现算。同一天两者都有时用明细，它比汇总新。只取真实访客日的事件。
  const live = await sql<AdminAnalyticsDay[]>`
    WITH real AS (${realVisitorDays()})
    SELECT e.day::text AS day,
           count(*) FILTER (WHERE e.kind = 'pageview') AS views,
           count(DISTINCT e.visitor) AS visitors,
           count(*) FILTER (WHERE e.kind = 'click') AS clicks
      FROM analytics_events e
      JOIN real r ON r.day = e.day AND r.visitor = e.visitor
     WHERE e.day >= ${start} AND e.day <= ${today}
     GROUP BY e.day`;

  const byDay = new Map<string, AdminAnalyticsDay>();
  for (const row of daily) byDay.set(row.day, row);
  for (const row of live) byDay.set(row.day, row);

  const trend: AdminAnalyticsDay[] = [];
  for (let i = 0; i < window; i++) {
    const day = addDays(start, i);
    trend.push(byDay.get(day) ?? { day, views: 0, visitors: 0, clicks: 0 });
  }

  const pages = await sql<AdminAnalyticsRank[]>`
    WITH real AS (${realVisitorDays()})
    SELECT e.path AS key, count(*) AS views, count(DISTINCT e.visitor) AS visitors
      FROM analytics_events e
      JOIN real r ON r.day = e.day AND r.visitor = e.visitor
     WHERE e.day >= ${start} AND e.day <= ${today} AND e.kind = 'pageview'
     GROUP BY e.path ORDER BY views DESC, key LIMIT ${RANK_LIMIT}`;
  const modules = await sql<AdminAnalyticsRank[]>`
    WITH real AS (${realVisitorDays()})
    SELECT e.module AS key, count(*) AS views, count(DISTINCT e.visitor) AS visitors
      FROM analytics_events e
      JOIN real r ON r.day = e.day AND r.visitor = e.visitor
     WHERE e.day >= ${start} AND e.day <= ${today} AND e.kind = 'pageview'
     GROUP BY e.module ORDER BY views DESC, key LIMIT ${RANK_LIMIT}`;
  const entries = await sql<AdminAnalyticsEntry[]>`
    WITH real AS (${realVisitorDays()})
    SELECT e.label AS key, count(*) AS clicks, count(DISTINCT e.visitor) AS visitors
      FROM analytics_events e
      JOIN real r ON r.day = e.day AND r.visitor = e.visitor
     WHERE e.day >= ${start} AND e.day <= ${today} AND e.kind = 'click' AND e.label IS NOT NULL
     GROUP BY e.label ORDER BY clicks DESC, key LIMIT ${RANK_LIMIT}`;

  const clientDays = Math.min(window, retentionDays());
  const clients = await sql<AdminAnalytics["clients"]>`
    WITH real AS (${realVisitorDays()})
    SELECT coalesce(e.client, 'unknown') AS key,
           count(DISTINCT e.visitor) AS visitors,
           count(*) FILTER (WHERE e.kind = 'pageview') AS views,
           count(*) FILTER (WHERE e.kind = 'click') AS clicks,
           count(*) FILTER (WHERE e.kind = 'open') AS opens
      FROM analytics_events e
      JOIN real r ON r.day = e.day AND r.visitor = e.visitor
     WHERE e.day BETWEEN ${addDays(today, 1 - clientDays)} AND ${today}
     GROUP BY e.client ORDER BY views DESC, key`;
  const ops = await opsReport(window, now);
  return { days: window, today: byDay.get(today) ?? { day: today, views: 0, visitors: 0, clicks: 0 }, trend, pages, modules, entries, clients, clientDays, ops };
}

/**
 * 每天把明细里还在的每一天重算进每日汇总（幂等），再删掉超过保留期的明细。
 * 重算覆盖整段明细窗口：明细还在的日子按最新口径对齐（含升级后第一次跑时对历史汇总的回填），
 * 明细已删的日子保留上次写下的汇总值。浏览、点击与访客同一套口径。
 */
export async function analyticsRetention(now: Date): Promise<Record<string, unknown>> {
  const today = beijingDate(now);
  const rolled = await sql`
    WITH real AS (${realVisitorDays()})
    INSERT INTO analytics_daily (day, views, visitors, clicks)
    SELECT e.day,
           count(*) FILTER (WHERE e.kind = 'pageview'),
           count(DISTINCT e.visitor),
           count(*) FILTER (WHERE e.kind = 'click')
      FROM analytics_events e
      JOIN real r ON r.day = e.day AND r.visitor = e.visitor
     WHERE e.day < ${today}
     GROUP BY e.day
    ON CONFLICT (day) DO UPDATE
       SET views = excluded.views, visitors = excluded.visitors, clicks = excluded.clicks`;
  const deleted = await sql`DELETE FROM analytics_events WHERE day < ${addDays(today, 1 - retentionDays())}`;
  return { analyticsRolled: rolled.count, analyticsDeleted: deleted.count };
}
