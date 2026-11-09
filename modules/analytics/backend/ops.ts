// 运维指标：本进程的资源占用（每钟采一次样，只留最近一次），以及模型调用、任务队列与采集
// 在窗口里的数字和每日趋势。三张引擎表按北京时间分天：时区取自 contracts/time，SQL 里用
// AT TIME ZONE 换算，不随手机会话的时区变。窗口与访客指标同一个 days。
import { loadavg } from "node:os";
import { sql } from "@aihot/backend/db";
import { addDays, beijingDate, beijingMidnight, BEIJING_TIMEZONE } from "@aihot/contracts/time";
import type { AdminAnalyticsCollect, AdminAnalyticsJobs, AdminAnalyticsModels, AdminAnalyticsOps, AdminAnalyticsProcess } from "@aihot/contracts/admin";
import { httpReport } from "./http.ts";

/** 采样周期，与 server.ts 里的定时器一致。 */
export const SAMPLE_MS = 60_000;
/** 排行取多少行。 */
const ROW_LIMIT = 30;

const round1 = (n: number) => Math.round(n * 10) / 10;

let latest: AdminAnalyticsProcess | null = null;
let sampledAt = Date.now();
let sampledCpu = process.cpuUsage();

/**
 * 采一次样：内存、CPU 占用率（这一段用掉的 CPU 时间比上经过的时间）与事件循环延迟
 * （这一觉比预期多睡了多少毫秒）。只留最近一次，页面读的就是它。
 */
export function sampleProcess(now = Date.now()): AdminAnalyticsProcess {
  const cpu = process.cpuUsage();
  const elapsed = Math.max(1, now - sampledAt);
  const usedMs = (cpu.user - sampledCpu.user + cpu.system - sampledCpu.system) / 1000;
  sampledCpu = cpu;
  sampledAt = now;
  const memory = process.memoryUsage();
  latest = {
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    rssMb: round1(memory.rss / 1_048_576),
    heapUsedMb: round1(memory.heapUsed / 1_048_576),
    cpuPercent: round1((usedMs / elapsed) * 100),
    loopLagMs: Math.round(Math.max(0, elapsed - SAMPLE_MS)),
    load1: round1(loadavg()[0] ?? 0),
  };
  return latest;
}

/** 最近一次采样；还没采过就先采一次。 */
export function processSample(): AdminAnalyticsProcess {
  return latest ?? sampleProcess();
}

/** 窗口里的每一天，缺的天补 0。 */
function fill<T extends { day: string }>(rows: T[], startDay: string, window: number, zero: (day: string) => T): T[] {
  const found = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: window }, (_, i) => {
    const day = addDays(startDay, i);
    return found.get(day) ?? zero(day);
  });
}

export async function opsReport(days: number, now = new Date()): Promise<AdminAnalyticsOps> {
  const window = Math.min(365, Math.max(1, Math.floor(days) || 30));
  const today = beijingDate(now);
  const startDay = addDays(today, -(window - 1));
  const start = beijingMidnight(startDay);
  const [http, totals, modelTrend, modelRows, backlog, jobTrend, collectTrend] = await Promise.all([
    httpReport(window, now),
    sql<{ calls: number; failed: number; cost: number; currency: string | null; tokens_in: number; tokens_out: number; p95: number | null }[]>`
      SELECT count(*)::int AS calls,
             count(*) FILTER (WHERE a.status = 'failed')::int AS failed,
             coalesce(sum(a.cost) FILTER (WHERE a.cost_basis = 'actual'), 0)::float8 AS cost,
             max(a.currency) FILTER (WHERE a.cost_basis = 'actual' AND a.cost IS NOT NULL) AS currency,
             coalesce(sum((a.usage->>'prompt_tokens')::bigint), 0)::int AS tokens_in,
             coalesce(sum((a.usage->>'completion_tokens')::bigint), 0)::int AS tokens_out,
             percentile_disc(0.95) WITHIN GROUP (ORDER BY a.latency_ms) AS p95
        FROM receipt_attempts a
       WHERE a.started_at >= ${start} AND a.origin = 'live' AND a.model IS NOT NULL`,
    sql<{ day: string; calls: number; failed: number; cost: number }[]>`
      SELECT (started_at AT TIME ZONE ${BEIJING_TIMEZONE})::date::text AS day,
             count(*)::int AS calls,
             count(*) FILTER (WHERE status = 'failed')::int AS failed,
             coalesce(sum(cost) FILTER (WHERE cost_basis = 'actual'), 0)::float8 AS cost
        FROM receipt_attempts
       WHERE started_at >= ${start} AND origin = 'live' AND model IS NOT NULL
       GROUP BY 1 ORDER BY 1`,
    sql<AdminAnalyticsModels["rows"]>`
      SELECT r.purpose, a.model, count(*)::int AS calls,
             count(*) FILTER (WHERE a.status = 'failed')::int AS failed,
             coalesce(percentile_disc(0.95) WITHIN GROUP (ORDER BY a.latency_ms), 0) AS msP95,
             coalesce(sum(a.cost) FILTER (WHERE a.cost_basis = 'actual'), 0)::float8 AS cost
        FROM receipt_attempts a JOIN receipts r ON r.id = a.receipt_id
       WHERE a.started_at >= ${start} AND a.origin = 'live' AND a.model IS NOT NULL
       GROUP BY 1, 2 ORDER BY 3 DESC, 1 LIMIT ${ROW_LIMIT}`,
    sql<{ name: string; state: string; n: number; oldest: Date | null }[]>`
      SELECT name, state, count(*)::int AS n, min(created_on) AS oldest FROM pgboss.job
       WHERE state IN ('created', 'retry', 'active') GROUP BY 1, 2 ORDER BY 1, 2`,
    sql<{ day: string; runs: number; failed: number }[]>`
      SELECT (started_at AT TIME ZONE ${BEIJING_TIMEZONE})::date::text AS day,
             count(*)::int AS runs, count(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM job_runs WHERE started_at >= ${start} GROUP BY 1 ORDER BY 1`,
    sql<{ day: string; runs: number; failed: number; found: number; fresh: number }[]>`
      SELECT (started_at AT TIME ZONE ${BEIJING_TIMEZONE})::date::text AS day,
             count(*)::int AS runs, count(*) FILTER (WHERE status = 'failed')::int AS failed,
             coalesce(sum(found_count), 0)::int AS found, coalesce(sum(new_count), 0)::int AS fresh
        FROM fetch_runs WHERE started_at >= ${start} GROUP BY 1 ORDER BY 1`,
  ]);

  const models: AdminAnalyticsModels = {
    calls: totals[0]?.calls ?? 0,
    failed: totals[0]?.failed ?? 0,
    cost: totals[0]?.cost ?? 0,
    currency: totals[0]?.currency ?? null,
    tokensIn: totals[0]?.tokens_in ?? 0,
    tokensOut: totals[0]?.tokens_out ?? 0,
    msP95: totals[0]?.p95 ?? 0,
    trend: fill(modelTrend, startDay, window, (day) => ({ day, calls: 0, failed: 0, cost: 0 })),
    rows: modelRows,
  };
  const jobs: AdminAnalyticsJobs = {
    backlog: backlog.map((row) => ({ name: row.name, state: row.state, n: row.n, oldest: row.oldest?.toISOString() ?? null })),
    trend: fill(jobTrend, startDay, window, (day) => ({ day, runs: 0, failed: 0 })),
  };
  const collect: AdminAnalyticsCollect = {
    runs: 0,
    failed: 0,
    found: 0,
    fresh: 0,
    trend: fill(collectTrend, startDay, window, (day) => ({ day, runs: 0, failed: 0, found: 0, fresh: 0 })),
  };
  for (const day of collect.trend) {
    collect.runs += day.runs;
    collect.failed += day.failed;
    collect.found += day.found;
    collect.fresh += day.fresh;
  }
  return { checkedAt: now.toISOString(), process: processSample(), http, models, jobs, collect };
}
