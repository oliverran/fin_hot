// 费用看板：窗口内每一次实际发送按渠道（调用用的密钥来源）与模型汇总 token 与费用。
// 服务商回传了实付金额的按它算，没有的按 service_prices 的单价估算，没单价的记「未定价」；
// 分天按北京时间。只用本文件自己的库副本（databases.ts），行会写进去。
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../../../apps/api/src/app.ts";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { costsReport } from "../backend/report.ts";
import costs from "../server.ts";

// 引擎的接口由这个模块注册，先把它装上再建 app（进程入口平时做的事）。
installModules([costs]);
const app = await buildApp();

after(async () => {
  await app.close();
  installModules([]);
  await closeDb();
});

/** 金额是估出来的小数，按浮点近似比较。 */
const close = (got: number, want: number, eps = 1e-9) => assert.ok(Math.abs(got - want) < eps, `${got} !≈ ${want}`);

let seq = 0;
async function attempt(o: {
  service: string;
  model: string;
  status: "received" | "failed" | "unknown";
  startedAt: string;
  usage: Record<string, unknown>;
  /** 服务商回传的实付金额；不给就是没有回传，靠单价估算。 */
  cost?: number;
}) {
  const [receipt] = await sql<{ id: string }[]>`
    INSERT INTO receipts (logical_key, service, model, purpose, status, origin)
    VALUES (${`costs-test-${++seq}`}, ${o.service}, ${o.model}, 'test', 'received', 'live') RETURNING id`;
  await sql`
    INSERT INTO receipt_attempts (receipt_id, attempt, service, model, origin, status, usage, cost, currency, cost_basis, started_at)
    VALUES (${receipt!.id}, 1, ${o.service}, ${o.model}, 'live', ${o.status}, ${sql.json(o.usage as never)},
            ${o.cost ?? null}, ${o.cost === undefined ? null : "CNY"}, ${o.cost === undefined ? null : "actual"}, ${new Date(o.startedAt)})`;
}

test("聚合：按渠道与模型估费、分天、未定价与实付并存", async () => {
  await sql`DELETE FROM receipts`;
  await sql`DELETE FROM service_prices`;
  await sql`
    INSERT INTO service_prices (service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok) VALUES
      ('llm', 'deepseek-v4.1-flash', 'CNY', 2, 0.2, 8),
      ('deepseek', 'deepseek-flash', 'CNY', 2, 0.04, 8),
      ('dashscope', 'qwen3.7-flash', 'CNY', 0.2, 0.04, 0.8),
      ('minimax', 'MiniMax-M3.1-Flash', 'CNY', 1, 0.1, 4)`;

  await attempt({ service: "llm", model: "deepseek-v4.1-flash", status: "received", startedAt: "2026-05-10T04:00:00Z",
    usage: { prompt_tokens: 1000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 400 } } });
  await attempt({ service: "deepseek", model: "deepseek-flash", status: "received", startedAt: "2026-05-09T04:00:00Z",
    usage: { prompt_tokens: 2000, completion_tokens: 1000 } });
  await attempt({ service: "dashscope", model: "qwen3.7-flash", status: "failed", startedAt: "2026-05-10T04:00:00Z",
    usage: { prompt_tokens: 10000, completion_tokens: 2000 } });
  // 没有单价：只算得出 token，金额记未定价
  await attempt({ service: "zhipu", model: "glm-5.3-flash", status: "received", startedAt: "2026-05-10T04:00:00Z",
    usage: { prompt_tokens: 100, completion_tokens: 50 } });
  // 服务商回传了实付金额，不再估算
  await attempt({ service: "minimax", model: "MiniMax-M3.1-Flash", status: "received", startedAt: "2026-05-09T04:00:00Z",
    usage: { prompt_tokens: 1000, completion_tokens: 200 }, cost: 0.25 });

  const report = await costsReport(7, new Date("2026-05-10T04:00:00Z"));
  assert.equal(report.days, 7);
  assert.equal(report.trend.length, 7);
  assert.equal(report.trend.at(-1)!.day, "2026-05-10");
  assert.equal(report.totals.calls, 5);
  assert.equal(report.totals.failed, 1);
  assert.equal(report.totals.unpriced, 1);
  close(report.totals.cost, 0.27088);

  const channel = (s: string) => report.channels.find((c) => c.service === s)!;
  close(channel("llm").cost, 0.00528); // 600 全价入 + 400 缓存入 + 500 出
  close(channel("deepseek").cost, 0.012);
  close(channel("dashscope").cost, 0.0036);
  close(channel("minimax").cost, 0.25); // 回传的实付
  assert.equal(channel("zhipu").cost, 0);
  assert.equal(channel("zhipu").unpriced, 1);
  // 渠道带出密钥来源
  assert.equal(channel("llm").apiKeyEnv, "LLM_API_KEY");
  assert.equal(channel("deepseek").apiKeyEnv, "DEEPSEEK_API_KEY");
  // 按花费排序
  assert.deepEqual(report.channels.map((c) => c.service), ["minimax", "deepseek", "llm", "dashscope", "zhipu"]);

  // 分天按北京时间
  const day = (d: string) => report.trend.find((x) => x.day === d)!;
  close(day("2026-05-09").cost, 0.262);
  close(day("2026-05-10").cost, 0.00888);
  assert.equal(day("2026-05-09").calls, 2);
  assert.equal(day("2026-05-10").calls, 3);
  assert.equal(day("2026-05-04").cost, 0); // 窗口里没有数据的天补 0

  // 模型行
  assert.equal(report.models.find((m) => m.service === "llm")?.model, "deepseek-v4.1-flash");
  assert.equal(report.models.find((m) => m.service === "zhipu")?.unpriced, 1);
});

test("后台接口：未登录回 401", async () => {
  const denied = await app.inject({ method: "GET", url: "/api/admin/costs" });
  assert.equal(denied.statusCode, 401);
});
