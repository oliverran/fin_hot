// 访客指标：上报校验、板块归组、落库后的查询、每日汇总重算与清理，以及两个接口的对外行为；
// 运维指标：接口耗时按天×路由累计与 p95、进程采样、模型与采集与队列的窗口汇总。
// 只用本文件自己的库副本（databases.ts），行会写进去。
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../../../apps/api/src/app.ts";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { addDays, beijingDate } from "@aihot/contracts/time";
import { readEvent, recordEvent } from "../backend/collect.ts";
import { groupOf } from "../backend/groups.ts";
import { flushHttp, httpReport, noteHttp } from "../backend/http.ts";
import { opsReport, processSample, sampleProcess } from "../backend/ops.ts";
import { analyticsReport, analyticsRetention } from "../backend/report.ts";
import analytics from "../server.ts";

// 引擎的两条接口由这个模块注册，先把它装上再建 app（进程入口平时做的事）。
installModules([analytics]);
const app = await buildApp();
// 队列积压读 pgboss.job，schema 由 pg-boss 自己建（生产里 worker 先起过）。
await getBoss();

after(async () => {
  await app.close();
  await stopBoss();
  installModules([]);
  await closeDb();
});

test("上报校验：不认得的字段组合整个丢掉", () => {
  const ok = { kind: "pageview", path: "/", visitor: "visitor123" };
  assert.deepEqual(readEvent(ok), { kind: "pageview", path: "/", label: null, visitor: "visitor123" });
  assert.equal(readEvent(null), null);
  assert.equal(readEvent({ ...ok, kind: "other" }), null);
  assert.equal(readEvent({ ...ok, path: "hot" }), null); // 不以 / 开头
  assert.equal(readEvent({ ...ok, path: "//evil" }), null); // 协议相对
  assert.equal(readEvent({ ...ok, path: `/x${"a".repeat(250)}` }), null); // 过长
  assert.equal(readEvent({ ...ok, path: "/a b" }), null); // 含空白
  assert.equal(readEvent({ ...ok, visitor: "short" }), null); // 短于 8
  assert.equal(readEvent({ ...ok, visitor: "bad/visitor" }), null); // 非法字符
  assert.equal(readEvent({ kind: "click", path: "/hot", visitor: "visitor123" }), null); // 点击缺入口名
  // 浏览不带入口名；点击的入口名去空白、压空格
  assert.equal(readEvent({ ...ok, label: "导航" })?.label, null);
  assert.deepEqual(readEvent({ kind: "click", path: "/hot", label: "  热   点  ", visitor: "visitor123" }), {
    kind: "click", path: "/hot", label: "热 点", visitor: "visitor123",
  });
});

test("板块归组：按地址前缀，不认得的归精选", () => {
  assert.equal(groupOf(""), "精选");
  assert.equal(groupOf("/"), "精选");
  assert.equal(groupOf("/unknown"), "精选");
  assert.equal(groupOf("/chronicle"), "编年史");
  assert.equal(groupOf("/chronicle/sectors/"), "编年史");
  assert.equal(groupOf("/us-market/"), "美股编年史");
  assert.equal(groupOf("/us-market/foo"), "美股编年史");
  assert.equal(groupOf("/hot?page=2"), "热点榜");
  assert.equal(groupOf("/items/123"), "内容详情");
  assert.equal(groupOf("/story/9"), "内容详情");
});

test("上报接口：合法与不认得的上报都收，未登录的后台查询回 401", async () => {
  // 限流窗口是本进程的，这条测试先跑，才能数准这几次上报。
  process.env.ANALYTICS_RATE_LIMIT = "2";
  try {
    const valid = { kind: "pageview", path: "/hot", visitor: "visitor-http" };
    const first = await app.inject({ method: "POST", url: "/api/analytics/collect", payload: valid });
    assert.equal(first.statusCode, 204);
    assert.equal(first.headers["cache-control"], "no-store");
    const second = await app.inject({ method: "POST", url: "/api/analytics/collect", payload: { kind: "nope" } });
    assert.equal(second.statusCode, 204); // 不认得也回 204，不给前端报错
    const third = await app.inject({ method: "POST", url: "/api/analytics/collect", payload: valid });
    assert.equal(third.statusCode, 429); // 超过每分钟上限
  } finally {
    delete process.env.ANALYTICS_RATE_LIMIT;
  }
  const denied = await app.inject({ method: "GET", url: "/api/admin/analytics" });
  assert.equal(denied.statusCode, 401);
});

test("落库与查询：今日浏览、访客、点击与三张排行", async () => {
  await sql`DELETE FROM analytics_events`;
  const now = new Date("2026-05-10T04:00:00Z"); // 北京 2026-05-10 12:00
  const record = (kind: "pageview" | "click", path: string, visitor: string, label: string | null = null) =>
    recordEvent({ kind, path, label, visitor }, now);
  await record("pageview", "/hot", "visitor-a1");
  await record("pageview", "/hot", "visitor-a1"); // 同一访客看两次
  await record("pageview", "/chronicle", "visitor-b2");
  await record("click", "/items/1", "visitor-a1", "热点榜");
  await record("click", "/items/1", "visitor-b2", "热点榜");

  const report = await analyticsReport(30, now);
  assert.equal(report.days, 30);
  assert.equal(report.trend.length, 30);
  assert.deepEqual(report.trend.at(-1)!.day, "2026-05-10");
  assert.equal(report.today.views, 3);
  assert.equal(report.today.visitors, 2);
  assert.equal(report.today.clicks, 2);
  assert.deepEqual(report.pages[0], { key: "/hot", views: 2, visitors: 1 });
  assert.deepEqual(report.entries[0], { key: "热点榜", clicks: 2, visitors: 2 });
  assert.equal(report.modules.find((m) => m.key === "热点榜")?.views, 2);
  assert.equal(report.modules.find((m) => m.key === "编年史")?.views, 1);
});

test("每日汇总：最近几天重算、当天不写，超过保留期的明细删掉", async () => {
  await sql`DELETE FROM analytics_events`;
  await sql`DELETE FROM analytics_daily`;
  process.env.ANALYTICS_RETENTION_DAYS = "4";
  try {
    const now = new Date("2026-05-10T04:00:00Z"); // 北京 2026-05-10
    const record = (date: string, visitor: string) =>
      recordEvent({ kind: "pageview", path: "/hot", label: null, visitor }, new Date(`${date}T04:00:00Z`));
    await record("2026-05-10", "visitor-today"); // 当天：不进汇总
    await record("2026-05-09", "visitor-yest");
    await record("2026-05-09", "visitor-yest");
    await record("2026-05-05", "visitor-old"); // 5 天前：超过 4 天保留期

    const out = await analyticsRetention(now);
    assert.equal(out.analyticsDeleted, 1);

    const daily = await sql<{ day: string; views: number; visitors: number; clicks: number }[]>`
      SELECT day::text AS day, views, visitors, clicks FROM analytics_daily ORDER BY day`;
    // 只有 05-09 写进了汇总（重算窗口是 05-08 与 05-09），当天 05-10 不写
    assert.deepEqual([...daily], [{ day: "2026-05-09", views: 2, visitors: 1, clicks: 0 }]);

    const days = await sql<{ day: string }[]>`SELECT DISTINCT day::text AS day FROM analytics_events ORDER BY day`;
    assert.deepEqual(days.map((row) => row.day), ["2026-05-09", "2026-05-10"]);

    // 重算幂等：再跑一次结果不变
    await analyticsRetention(now);
    const again = await sql<{ views: number }[]>`SELECT views FROM analytics_daily`;
    assert.deepEqual([...again], [{ views: 2 }]);
  } finally {
    delete process.env.ANALYTICS_RETENTION_DAYS;
  }
});

test("查询窗口：读得到汇总里的历史日，缺的天补 0", async () => {
  await sql`DELETE FROM analytics_events`;
  await sql`DELETE FROM analytics_daily`;
  const now = new Date("2026-05-10T04:00:00Z");
  const today = beijingDate(now);
  const older = addDays(today, -10);
  // 只剩汇总的历史日（明细已过保留期），窗口内它要被读出来
  await sql`INSERT INTO analytics_daily (day, views, visitors, clicks) VALUES (${older}, 40, 30, 5)`;
  await sql`INSERT INTO analytics_daily (day, views, visitors, clicks) VALUES (${today}, 1, 1, 0)`;

  const report = await analyticsReport(30, now);
  assert.equal(report.trend.find((d) => d.day === older)?.views, 40);
  assert.equal(report.trend.find((d) => d.day === addDays(today, -5))?.views, 0); // 缺的天补 0
  assert.equal(report.today.views, 1);
  assert.ok(!report.pages.length); // 没有明细就没有排行
  assert.equal(report.ops.http.trend.length, 30); // 运维半页跟访客指标同一个窗口
  assert.ok(new Date(report.ops.checkedAt).getTime() > 0);
});

test("接口指标：按天×路由在进程内累计，落库相加，p95 从桶里估", async () => {
  await flushHttp(); // 先把前面测试攒下的排干，从干净的库开始
  await sql`DELETE FROM analytics_http`;
  const now = new Date("2026-05-10T04:00:00Z"); // 北京 2026-05-10
  for (let i = 0; i < 4; i++) noteHttp("/api/hot", 200, 20, now);
  noteHttp("/api/hot", 500, 200, now);
  noteHttp("/api/other", 200, 5, now);

  // 还没落库的那一分钟也读得到
  const before = await httpReport(30, now);
  assert.equal(before.today.requests, 6);
  assert.equal(before.today.errors, 1);

  assert.equal(await flushHttp(), 2); // 两个路由各一行
  assert.equal(await flushHttp(), 0); // 排干后没有可写的

  const rows = await sql<{ path: string; requests: number; errors: number }[]>`
    SELECT path, requests::int AS requests, errors::int AS errors FROM analytics_http ORDER BY path`;
  assert.deepEqual([...rows], [
    { path: "/api/hot", requests: 5, errors: 1 },
    { path: "/api/other", requests: 1, errors: 0 },
  ]);

  const report = await httpReport(30, now);
  assert.equal(report.trend.length, 30);
  assert.equal(report.trend.at(-1)!.day, "2026-05-10");
  assert.equal(report.today.requests, 6);
  assert.equal(report.today.errors, 1);
  assert.equal(report.today.msAvg, Math.round(285 / 6)); // 4×20 + 200 + 5 = 285
  // 5 次落在 <=50、1 次落在 <=300，p95 取盖住它的那一格的上界（估出来的，不是实测值）
  assert.equal(report.today.msP95, 300);
  assert.deepEqual(report.routes.find((r) => r.key === "/api/hot"), { key: "/api/hot", requests: 5, errors: 1, msAvg: 56, msP95: 300, msMax: 200 });
  assert.deepEqual(report.routes.map((r) => r.key), ["/api/hot", "/api/other"]);

  // 再攒一次并进同一行，不是新写一行
  noteHttp("/api/hot", 200, 20, now);
  await flushHttp();
  const [after] = await sql<{ requests: number }[]>`SELECT requests::int AS requests FROM analytics_http WHERE path = '/api/hot'`;
  assert.equal(after!.requests, 6);
});

test("进程采样：给出本进程的资源占用", () => {
  const sample = sampleProcess();
  assert.equal(sample.pid, process.pid);
  assert.ok(sample.rssMb > 0);
  assert.ok(sample.heapUsedMb > 0);
  assert.ok(sample.uptimeSec >= 0);
  assert.ok(sample.cpuPercent >= 0);
  assert.ok(sample.loopLagMs >= 0);
  assert.ok(sample.load1 >= 0);
  assert.equal(processSample().pid, process.pid); // 还没采过就用最近一次
});

test("运维汇总：窗口补齐，模型、采集与队列成形", async () => {
  const now = new Date("2026-05-10T04:00:00Z");
  const ops = await opsReport(30, now);
  assert.equal(ops.process.pid, process.pid);
  assert.equal(ops.http.trend.length, 30);
  assert.equal(ops.models.trend.length, 30);
  assert.equal(ops.jobs.trend.length, 30);
  assert.equal(ops.collect.trend.length, 30);
  assert.deepEqual(ops.models.trend.at(-1), { day: "2026-05-10", calls: 0, failed: 0, cost: 0 });
  assert.deepEqual(ops.collect.trend.at(-1), { day: "2026-05-10", runs: 0, failed: 0, found: 0, fresh: 0 });
  assert.ok(Array.isArray(ops.models.rows));
  assert.ok(Array.isArray(ops.jobs.backlog));
  assert.equal(ops.collect.runs, ops.collect.trend.reduce((sum, d) => sum + d.runs, 0));
});
