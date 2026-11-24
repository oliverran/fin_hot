// 机会模块的后端：模型挑出的机会与标的先用真实清单核对（A 股按全量清单、美股按白名单，对不上的丢掉），
// 当天已有结果就跳过，后台手动重跑整天替换；读者页读最近 7 天、后台看统计、保留期清理，
// 以及公开与后台接口的对外行为。模型调用只连本地的假服务（stub），不访问任何外部地址。
// 只用本文件自己的库副本（databases.ts），行会写进去。
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import { buildApp } from "../../../apps/api/src/app.ts";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { addDays, beijingDate } from "@aihot/contracts/time";
import { pointModels, stub, tag } from "../../../tests/setup.ts";
import { generateOpportunities, opportunitiesRetention, opportunityAdmin, recentOpportunities } from "../backend/opportunities.ts";
import opportunities from "../server.ts";

installModules([opportunities]);
const app = await buildApp();
const today = beijingDate(new Date());
const T = tag();
const source = `opp-${T}`;

// 假模型：每个测试换一份回答（模型要的 JSON 放进 choices 里），hits 数清调用次数。
let payload: unknown = { opportunities: [] };
const provider = await stub(() => ({
  id: "local",
  choices: [{ message: { content: JSON.stringify(payload) } }],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
}));
pointModels(provider.url, ["deepseek-flash"]);

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${source}, '机会测试源', 'rss', 'T1', 'editorial', '2100-01-01')`;
});

after(async () => {
  await provider.close();
  await app.close();
  installModules([]);
  await closeDb();
});

/** 写一份编年史快照（机会模块只读这里）：最近一个交易日的行情与一份 A 股清单。 */
async function writeSnapshots() {
  const dir = path.join(config.dataDir, "chronicle");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString();
  await writeFile(path.join(dir, "market.json"), JSON.stringify({
    updatedAt: stamp,
    days: [{ date: today, breadth: { count: 5200, up: 3100, down: 1900, flat: 200, turnover: 1.2e12 },
      indices: [{ name: "上证指数", change: 0.62 }], industries: [{ name: "半导体", change: 2.1 }] }],
  }));
  await writeFile(path.join(dir, "companies.json"), JSON.stringify({
    updatedAt: stamp,
    records: [
      { code: "600519.SH", name: "贵州茅台", industry: "白酒", pe: 30, pb: 8, dividendYield: 2.1, marketValue: 2.1e12 },
      { code: "000001.SZ", name: "平安银行", industry: "银行", pe: 5, pb: 0.6, dividendYield: 5, marketValue: 2.2e11 },
    ],
  }));
}

/** 一篇文章的已发布报道；编年史新闻与行情一样从这里读。 */
async function publish(suffix: string, title: string, hoursAgo: number) {
  const id = `${T}-${suffix}`;
  const at = new Date(Date.now() - hoursAgo * 3600_000);
  const url = `https://example.org/${id}`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at, published_at)
    VALUES (${id}, ${source}, ${id}, ${url}, ${title}, ${at}, ${at}, ${at})`;
  await sql`INSERT INTO publications (article_id, source_id, title, url, timeline_at, discovered_at, published_at, sort_at,
      channel, body_mode, selected, eligible, visible_after, score, visibility)
    VALUES (${id}, ${source}, ${title}, ${url}, ${at}, ${at}, ${at}, ${at}, 'news', 'full', true, true, ${at}, 70, 'public')`;
  return { title, url };
}

/** 直接写一行机会，用来单独验证读取、窗口与保留期。 */
async function insertCard(date: string, seq: number, title: string, direction = "neutral") {
  await sql`INSERT INTO opportunities (date, seq, direction, title, summary, catalyst, logic, watch, risk, symbols, evidence, model)
    VALUES (${date}, ${seq}, ${direction}, ${title}, ${"结论"},
            ${"催化"}, ${"逻辑"}, ${"观察"}, ${"风险"},
            ${sql.json([{ code: "600519.SH", name: "贵州茅台", market: "cn" }] as never)},
            ${sql.json([] as never)}, ${"deepseek-flash"})`;
}

test("生成：标的按真实清单核对、编造与重复的丢掉，依据映射回报道，当天已有则跳过", async () => {
  await sql`DELETE FROM opportunities`;
  await writeSnapshots();
  const newer = await publish("newer", "央行降准释放流动性", 1);
  const older = await publish("older", "某芯片公司发布新品", 2);
  payload = {
    opportunities: [
      { direction: "bullish", title: "半导体景气回升", summary: "订单与价格同步回升。", catalyst: "央行降准释放流动性。", logic: "流动性宽松利好成长股。", watch: "关注成交额与北向资金。", risk: "若海外需求走弱则不及预期。", symbols: [
        { code: "600519.SH", name: "贵州茅台", note: "渠道库存回落" },
        { code: "nvidia", name: "英伟达" },
        { code: "999999.SH", name: "不存在的公司" },
      ], sources: [1, 2] },
      { direction: "bearish", title: "银行息差承压", summary: "LPR 下调挤压息差。", catalyst: "LPR 下调。", logic: "息差收窄压制利润。", watch: "关注净息差数据。", risk: "资产质量超预期恶化。", symbols: [{ code: "000001", name: "平安银行" }], sources: [1] },
      { direction: "neutral", title: "半导体景气回升", summary: "重复标题。", catalyst: "催化", logic: "逻辑", watch: "观察", risk: "风险", symbols: [{ code: "600519.SH", name: "贵州茅台" }], sources: [] },
      { direction: "bullish", title: "没有真实标的", summary: "对不上清单。", catalyst: "催化", logic: "逻辑", watch: "观察", risk: "风险", symbols: [{ code: "ZZZZ", name: "也不存在" }], sources: [1] },
    ],
  };

  const first = await generateOpportunities();
  assert.equal(first.date, today);
  assert.equal(first.written, 2);
  assert.equal(first.model, "deepseek-flash");

  const rows = await sql<{ seq: number; direction: string; title: string; symbols: unknown; evidence: unknown; model: string }[]>`
    SELECT seq, direction, title, symbols, evidence, model FROM opportunities ORDER BY seq`;
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.seq, 1);
  assert.equal(rows[0]!.direction, "bullish");
  assert.equal(rows[0]!.title, "半导体景气回升");
  // 代码与名称一律用清单里的写法；对不上清单的丢掉；美股票走白名单。
  assert.deepEqual(rows[0]!.symbols, [
    { code: "600519.SH", name: "贵州茅台", market: "cn", note: "渠道库存回落" },
    { code: "NVDA", name: "英伟达", market: "us" },
  ]);
  // 依据按模型给的序号映射回给出的报道清单（最近的一条在前），并带上发布方名称。
  assert.deepEqual(rows[0]!.evidence, [
    { title: newer.title, url: newer.url, date: today, source: "机会测试源" },
    { title: older.title, url: older.url, date: today, source: "机会测试源" },
  ]);
  assert.equal(rows[1]!.direction, "bearish");
  assert.deepEqual(rows[1]!.symbols, [{ code: "000001.SZ", name: "平安银行", market: "cn" }]);
  assert.ok(rows.every((row) => row.model === "deepseek-flash"));

  // 不给 reason（排程里跑）：当天已有就不换，也不再多花一笔。
  const hits = provider.hits();
  const skipped = await generateOpportunities();
  assert.equal(skipped.written, 2);
  assert.equal(skipped.model, null);
  assert.equal(provider.hits(), hits);
});

test("手动重跑：整天已有的结果被换掉", async () => {
  await writeSnapshots();
  await publish("rerun", "某公司获大额订单", 1);
  payload = { opportunities: [
    { direction: "bullish", title: "订单落地", summary: "上调全年指引。", catalyst: "获大额订单。", logic: "订单转收入。", watch: "关注交付节奏。", risk: "订单延迟。", symbols: [{ code: "600519.SH", name: "贵州茅台" }], sources: [1] },
  ] };

  const hits = provider.hits();
  const rerun = await generateOpportunities("admin");
  assert.equal(rerun.written, 1);
  assert.equal(provider.hits(), hits + 1);
  const rows = await sql<{ title: string }[]>`SELECT title FROM opportunities ORDER BY seq`;
  assert.deepEqual(rows.map((row) => row.title), ["订单落地"]);
});

test("读者与后台读取：按天分组、窗口收敛", async () => {
  await sql`DELETE FROM opportunities`;
  await insertCard(today, 1, "今天的机会");
  await insertCard(addDays(today, -3), 1, "三天前的机会");
  await insertCard(addDays(today, -25), 1, "二十五天前的机会");

  const week = await recentOpportunities(7);
  assert.deepEqual(week.days.map((day) => day.date), [today, addDays(today, -3)]);
  assert.equal(week.days[0]!.cards.length, 1);
  assert.ok(week.updatedAt instanceof Date);

  const month = await opportunityAdmin(30);
  assert.equal(month.total, 3);
  assert.equal(month.items.length, 3);
  assert.equal(month.items.at(-1)!.date, addDays(today, -25));
});

test("保留期：超过 30 天的结果删掉", async () => {
  await sql`DELETE FROM opportunities`;
  await insertCard(addDays(today, -40), 1, "过期");
  await insertCard(addDays(today, -10), 1, "还在保留期");

  const out = await opportunitiesRetention(new Date());
  assert.equal(out.opportunitiesDeleted, 1);
  const dates = await sql<{ date: string }[]>`SELECT to_char(date, 'YYYY-MM-DD') AS date FROM opportunities ORDER BY date`;
  assert.deepEqual(dates.map((row) => row.date), [addDays(today, -10)]);
});

test("接口：公开页读得到，后台未登录回 401", async () => {
  await sql`DELETE FROM opportunities`;
  await insertCard(today, 1, "对外的一条");

  const open = await app.inject({ method: "GET", url: "/api/opportunities?days=7" });
  assert.equal(open.statusCode, 200);
  assert.equal(open.headers["cache-control"], "no-store");
  const body = open.json() as { days: Array<{ date: string; cards: unknown[] }>; updatedAt: string | null };
  assert.equal(body.days[0]!.date, today);
  assert.equal(body.days[0]!.cards.length, 1);

  assert.equal((await app.inject({ method: "GET", url: "/api/admin/opportunities" })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/opportunities/run" })).statusCode, 401);
});
