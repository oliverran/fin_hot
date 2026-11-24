// 机会模块的后端：读编年史已同步的行情快照与近期已发布的新闻，调用模型挑出最多 LIMIT 条值得观察的机会，
// 标的用真实清单核对后落库。读者页只读这里发出去的当天与最近 7 天结果；后台可查看并手动重跑。
// 模型只在 worker 的排程里调用（读者打开页面不触发）；每条机会的方向措辞在页面上统一成「观察」。
import { z } from "zod";
import { addDays, beijingDate } from "@aihot/contracts/time";
import type { AdminOpportunities, AdminOpportunityCard, AdminOpportunityDay, AdminOpportunityRun, BeforeJson } from "@aihot/contracts/admin";
import { sql } from "@aihot/backend/db";
import { modelRoute } from "@aihot/backend/editorial/models";
import { promptText, promptVersion } from "@aihot/backend/editorial/prompts";
import { chatJson } from "@aihot/backend/providers/llm";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { chronicleNews } from "@aihot/backend/publication/chronicle";
import { companyRecords, latestMarketDay, type CompanyRecord, type MarketDay } from "./snapshots.ts";

/** 一天最多几条机会。 */
export const LIMIT = 5;
/** 结果保留天数：页面上能回看最近 7 天，库里多留几天。 */
const RETENTION_DAYS = 30;
/** 取最近几天的新闻给模型作依据。 */
const NEWS_DAYS = 3;

export const OPPORTUNITY_VERSION = promptVersion("opportunity");

export type Direction = "bullish" | "bearish" | "neutral";

export interface OpportunitySymbol { code: string; name: string; market: "cn" | "us"; note?: string }
/** 一条依据：报道标题、原文地址、发布日期（北京）与发布方名称。 */
export interface OpportunityEvidence { title: string; url: string; date: string; source: string }
export interface OpportunityCard {
  id: number;
  direction: Direction;
  title: string;
  /** 结论：一句话判断。 */
  summary: string;
  /** 前因与催化。 */
  catalyst: string;
  /** 逻辑链条。 */
  logic: string;
  /** 后续观察点。 */
  watch: string;
  /** 风险。 */
  risk: string;
  symbols: OpportunitySymbol[];
  evidence: OpportunityEvidence[];
}
export interface OpportunityDay { date: string; cards: OpportunityCard[] }

/** 美股常见大盘白名单：模型只能从这里选美股标的，避免编出不存在或冷门的代码。 */
const US_UNIVERSE: ReadonlyArray<{ code: string; name: string }> = [
  { code: "AAPL", name: "苹果" }, { code: "MSFT", name: "微软" }, { code: "NVDA", name: "英伟达" },
  { code: "GOOGL", name: "谷歌" }, { code: "AMZN", name: "亚马逊" }, { code: "META", name: "Meta" },
  { code: "AVGO", name: "博通" }, { code: "TSM", name: "台积电" }, { code: "AMD", name: "超威半导体" },
  { code: "TSLA", name: "特斯拉" }, { code: "QCOM", name: "高通" }, { code: "ORCL", name: "甲骨文" },
  { code: "CRM", name: "赛富时" }, { code: "ADBE", name: "Adobe" }, { code: "NFLX", name: "奈飞" },
  { code: "MU", name: "美光" }, { code: "INTC", name: "英特尔" }, { code: "SMCI", name: "超微电脑" },
];

const SymbolSchema = z.object({
  code: z.string().catch(""),
  name: z.string().catch(""),
  note: z.string().catch("").optional(),
});

const CardSchema = z.object({
  direction: z.enum(["bullish", "bearish", "neutral"]).catch("neutral"),
  title: z.string().catch(""),
  summary: z.string().catch(""),
  catalyst: z.string().catch(""),
  logic: z.string().catch(""),
  watch: z.string().catch(""),
  risk: z.string().catch(""),
  symbols: z.array(SymbolSchema).catch([]),
  /** 依据的新闻序号（从 1 起，对应给出的清单）。 */
  sources: z.array(z.number()).catch([]),
});

const ResultSchema = z.object({ opportunities: z.array(CardSchema).catch([]) });

/** 各段文字的长度上限：拦住模型偶发的长篇，正常输出远小于这些值。 */
const TEXT_LIMITS = { title: 60, summary: 200, catalyst: 600, logic: 600, watch: 600, risk: 300 } as const;

/** 一条机会在库里的行。 */
interface OpportunityRow {
  id: number;
  date: string;
  direction: Direction;
  title: string;
  summary: string;
  catalyst: string;
  logic: string;
  watch: string;
  risk: string;
  symbols: OpportunitySymbol[];
  evidence: OpportunityEvidence[];
  model: string | null;
  created_at: Date;
}

/** 当天行情背景里给模型看的那部分：宽度、几条指数、几个行业。 */
function marketBackground(day: MarketDay) {
  return {
    date: day.date,
    breadth: day.breadth,
    indices: day.indices.slice(0, 6),
    industries: day.industries.slice(0, 10),
  };
}

const toCard = (row: OpportunityRow): OpportunityCard => ({
  id: row.id, direction: row.direction, title: row.title, summary: row.summary, catalyst: row.catalyst,
  logic: row.logic, watch: row.watch, risk: row.risk, symbols: row.symbols, evidence: row.evidence,
});

/** 最近 `days` 天（含当天）的行，按日期倒序、当天内按序号。 */
function recentRows(days: number): Promise<OpportunityRow[]> {
  const span = Math.min(Math.max(1, days), 90);
  const cutoff = addDays(beijingDate(new Date()), -(span - 1));
  return sql<OpportunityRow[]>`
    SELECT id, to_char(date, 'YYYY-MM-DD') AS date, direction, title, summary, catalyst, logic, watch, risk,
           symbols, evidence, model, created_at
    FROM opportunities WHERE date >= ${cutoff} ORDER BY date DESC, seq`;
}

function groupDays(rows: OpportunityRow[]): OpportunityDay[] {
  const byDay = new Map<string, OpportunityDay>();
  for (const row of rows) {
    const day = byDay.get(row.date) ?? { date: row.date, cards: [] };
    day.cards.push(toCard(row));
    byDay.set(row.date, day);
  }
  return [...byDay.values()];
}

/** 读者页读到的：当天与最近 7 天。 */
export async function recentOpportunities(days = 7): Promise<{ updatedAt: Date | null; days: OpportunityDay[] }> {
  const rows = await recentRows(days);
  return { updatedAt: rows[0]?.created_at ?? null, days: groupDays(rows) };
}

/** 后台读到的：最近几个交易日的结果与统计。 */
export async function opportunityAdmin(days = 7): Promise<BeforeJson<AdminOpportunities>> {
  const rows = await recentRows(days);
  const items: BeforeJson<AdminOpportunityDay>[] = [];
  const byDate = new Map<string, BeforeJson<AdminOpportunityDay>>();
  for (const row of rows) {
    let day = byDate.get(row.date);
    if (!day) {
      day = { date: row.date, cards: [] };
      byDate.set(row.date, day);
      items.push(day);
    }
    const card: BeforeJson<AdminOpportunityCard> = {
      id: row.id, direction: row.direction, title: row.title, summary: row.summary, catalyst: row.catalyst,
      logic: row.logic, watch: row.watch, risk: row.risk,
      symbols: row.symbols, evidence: row.evidence, model: row.model, createdAt: row.created_at,
    };
    day.cards.push(card);
  }
  return { days: Math.min(Math.max(1, days), 90), updatedAt: rows[0]?.created_at ?? null, total: rows.length, items };
}

/** 标的核对表：A 股按全量清单的代码（含后缀与裸代码）与名称，美股按白名单。 */
function symbolIndex(records: CompanyRecord[]) {
  const byCode = new Map<string, CompanyRecord>();
  const byBare = new Map<string, CompanyRecord>();
  const byName = new Map<string, CompanyRecord>();
  for (const r of records) {
    byCode.set(r.code.toUpperCase(), r);
    byBare.set(r.code.split(".")[0]!.toUpperCase(), r);
    byName.set(r.name, r);
  }
  return { byCode, byBare, byName };
}

/**
 * 把模型给的一个标的核对成真实标的：A 股先按代码、裸代码、名称在清单里找，美股按白名单；
 * 都对不上就丢掉。代码与名称一律用清单里的写法，不用模型自己写的。
 */
function resolveSymbol(input: z.infer<typeof SymbolSchema>, index: ReturnType<typeof symbolIndex>): OpportunitySymbol | null {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  const cn = index.byCode.get(code) ?? index.byBare.get(code) ?? index.byName.get(name);
  if (cn) return { code: cn.code, name: cn.name, market: "cn", ...(input.note ? { note: input.note } : {}) };
  const us = US_UNIVERSE.find((s) => s.code === code || s.name === name);
  if (us) return { code: us.code, name: us.name, market: "us", ...(input.note ? { note: input.note } : {}) };
  return null;
}

/** 报道的发布方名称（按文章 id 查），用于给依据标注来源、供模型判断是否交叉印证。 */
async function sourceNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await sql<{ id: string; name: string }[]>`
    SELECT DISTINCT ON (p.article_id) p.article_id AS id, s.name
    FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE p.article_id = ANY(${ids}) ORDER BY p.article_id`;
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * 生成一天的机会：读当天行情背景与最近几天的新闻，让模型挑出机会与标的，核对后落库。
 * 不给 `reason`（排程里跑）时当天已经有了就跳过；给了 `reason`（后台手动重跑）就整天的结果换掉。
 */
export async function generateOpportunities(reason?: string): Promise<AdminOpportunityRun> {
  const date = beijingDate(new Date());
  const [existing] = await sql<{ n: number }[]>`SELECT count(*) AS n FROM opportunities WHERE date = ${date}`;
  if ((existing?.n ?? 0) > 0 && reason === undefined) return { date, written: existing!.n, model: null };

  const [market, records, news] = await Promise.all([
    latestMarketDay(),
    companyRecords(),
    chronicleNews(addDays(date, -NEWS_DAYS), date),
  ]);
  if (!news.length) throw new Error(`opportunities ${date}: no published news in the last ${NEWS_DAYS} days`);
  const names = await sourceNames(news.map((n) => n.id));

  const index = symbolIndex(records);
  const user = JSON.stringify({
    date,
    market: market ? marketBackground(market) : null,
    usUniverse: US_UNIVERSE.map((s) => `${s.code} ${s.name}`),
    news: news.map((n, i) => ({ i: i + 1, date: n.date, source: names.get(n.id) ?? "", title: n.title })),
  });

  const route = await modelRoute("opportunity");
  const res = await chatJson({
    ...route,
    purpose: "opportunity",
    subject: `opportunity:${date}`,
    promptVersion: OPPORTUNITY_VERSION,
    system: promptText("opportunity", { limit: String(LIMIT) }),
    user,
    schema: ResultSchema,
    temperature: 0.4,
    maxTokens: 6000,
    ...(reason === undefined ? {} : { attemptTag: `rerun:${new Date().toISOString()}` }),
  });

  const seen = new Set<string>();
  const cards = res.data.opportunities.flatMap((o) => {
    const title = o.title.trim().slice(0, TEXT_LIMITS.title);
    const summary = o.summary.trim().slice(0, TEXT_LIMITS.summary);
    const symbols = o.symbols.map((s) => resolveSymbol(s, index)).filter((s): s is OpportunitySymbol => s !== null).slice(0, 6);
    if (!title || !summary || !symbols.length || seen.has(title)) return [];
    seen.add(title);
    const evidence = [...new Set(o.sources)].map((i) => news[i - 1]).filter((n): n is typeof news[number] => !!n)
      .slice(0, 6).map((n) => ({ title: n.title, url: n.url, date: n.date, source: names.get(n.id) ?? "" }));
    return [{
      direction: o.direction, title, summary,
      catalyst: o.catalyst.trim().slice(0, TEXT_LIMITS.catalyst),
      logic: o.logic.trim().slice(0, TEXT_LIMITS.logic),
      watch: o.watch.trim().slice(0, TEXT_LIMITS.watch),
      risk: o.risk.trim().slice(0, TEXT_LIMITS.risk),
      symbols, evidence,
    }];
  }).slice(0, LIMIT);
  if (!cards.length) throw new Error(`opportunities ${date}: the model produced no opportunity matching the real symbols`);

  await sql.begin(async (tx) => {
    await tx`DELETE FROM opportunities WHERE date = ${date}`;
    for (const [i, card] of cards.entries()) {
      await tx`INSERT INTO opportunities (date, seq, direction, title, summary, catalyst, logic, watch, risk, symbols, evidence, model)
               VALUES (${date}, ${i + 1}, ${card.direction}, ${card.title}, ${card.summary}, ${card.catalyst},
                       ${card.logic}, ${card.watch}, ${card.risk},
                       ${tx.json(card.symbols as never)}, ${tx.json(card.evidence as never)}, ${route.model})`;
    }
    await completeReceipt(tx, res.receiptId);
  });
  return { date, written: cards.length, model: route.model };
}

/** 每天清理超过保留期的结果（ops.retention 调）。 */
export async function opportunitiesRetention(now: Date): Promise<Record<string, unknown>> {
  const cutoff = addDays(beijingDate(now), -RETENTION_DAYS);
  const deleted = await sql`DELETE FROM opportunities WHERE date < ${cutoff}`;
  return { opportunitiesDeleted: deleted.count };
}
