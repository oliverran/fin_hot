// 后台「费用看板」的读取：窗口内每一次实际发送（receipt_attempts，origin='live'）按渠道与模型
// 汇总，token 与费用都按北京时间分天。渠道就是这次调用的密钥来源——入库在 a.service 上，
// 默认模型记作 llm（读 LLM_*），具名预设各用自己的环境变量（site/models.ts）。
// 服务商没有回传费用的调用（llm 这一路写的就是 null）按 service_prices 的单价估算；
// 没有单价的调用只算得出 token，金额记进「未定价」。
import { sql } from "@aihot/backend/db";
import { MODELS } from "@aihot/backend/providers/llm";
import { addDays, beijingDate, beijingMidnight, BEIJING_TIMEZONE } from "@aihot/contracts/time";
import type { AdminCostChannel, AdminCostDay, AdminCostModel, AdminCosts } from "@aihot/contracts/admin";

interface Row {
  day: string;
  service: string;
  model: string;
  calls: number;
  ok: number;
  failed: number;
  unknown: number;
  tokens_in: string;
  tokens_out: string;
  tokens_cached: string;
  uncosted_calls: number;
  tokens_in_uncosted: string;
  tokens_out_uncosted: string;
  tokens_cached_uncosted: string;
  actual_cost: string | null;
  currency: string | null;
}

interface Price {
  service: string;
  model: string;
  currency: string;
  input_per_mtok: string | null;
  cached_per_mtok: string | null;
  output_per_mtok: string | null;
}

/** 未计费的那部分 token 按单价估成钱；没有单价就说这些调用「未定价」。 */
function priceOf(row: Row, prices: Price[]): { cost: number; currency: string | null; unpriced: number } {
  const actual = row.actual_cost === null ? 0 : Number(row.actual_cost);
  // 先找这个模型的单价，退到该渠道的通用行（model 为空）。
  const p = prices.find((x) => x.service === row.service && x.model === row.model) ?? prices.find((x) => x.service === row.service && x.model === "");
  if (!p || (!p.input_per_mtok && !p.output_per_mtok)) return { cost: actual, currency: row.currency, unpriced: row.uncosted_calls };
  const cached = Number(row.tokens_cached_uncosted);
  const fresh = Number(row.tokens_in_uncosted) - cached;
  const estimate =
    (fresh / 1e6) * Number(p.input_per_mtok ?? 0) +
    (cached / 1e6) * Number(p.cached_per_mtok ?? p.input_per_mtok ?? 0) +
    (Number(row.tokens_out_uncosted) / 1e6) * Number(p.output_per_mtok ?? 0);
  return { cost: actual + estimate, currency: row.currency ?? p.currency, unpriced: 0 };
}

interface Acc {
  calls: number;
  ok: number;
  failed: number;
  unknown: number;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  unpriced: number;
  cost: number;
  currency: string | null;
}

const emptyAcc = (): Acc => ({ calls: 0, ok: 0, failed: 0, unknown: 0, tokensIn: 0, tokensOut: 0, tokensCached: 0, unpriced: 0, cost: 0, currency: null });

function addRow(acc: Acc, row: Row, priced: { cost: number; currency: string | null; unpriced: number }): void {
  acc.calls += row.calls;
  acc.ok += row.ok;
  acc.failed += row.failed;
  acc.unknown += row.unknown;
  acc.tokensIn += Number(row.tokens_in);
  acc.tokensOut += Number(row.tokens_out);
  acc.tokensCached += Number(row.tokens_cached);
  acc.cost += priced.cost;
  acc.unpriced += priced.unpriced;
  acc.currency = acc.currency ?? priced.currency ?? row.currency;
}

/** 每个渠道的密钥与地址来自哪个环境变量：取登记里第一个用了它的模型。 */
function channelEnv(): Map<string, { apiKeyEnv: string; baseUrlEnv: string }> {
  const map = new Map<string, { apiKeyEnv: string; baseUrlEnv: string }>();
  for (const spec of Object.values(MODELS)) {
    if (!map.has(spec.service)) map.set(spec.service, { apiKeyEnv: spec.apiKeyEnv, baseUrlEnv: spec.baseUrlEnv });
  }
  return map;
}

export async function costsReport(days: number, now = new Date()): Promise<AdminCosts> {
  const window = Math.min(365, Math.max(1, Math.floor(days) || 14));
  const today = beijingDate(now);
  const startDay = addDays(today, -(window - 1));
  const start = beijingMidnight(startDay);

  const [rows, prices] = await Promise.all([
    sql<Row[]>`
      SELECT (a.started_at AT TIME ZONE ${BEIJING_TIMEZONE})::date::text AS day,
             a.service, a.model,
             count(*)::int AS calls,
             count(*) FILTER (WHERE a.status = 'received')::int AS ok,
             count(*) FILTER (WHERE a.status = 'failed')::int AS failed,
             count(*) FILTER (WHERE a.status = 'unknown')::int AS unknown,
             coalesce(sum((a.usage->>'prompt_tokens')::bigint), 0) AS tokens_in,
             coalesce(sum((a.usage->>'completion_tokens')::bigint), 0) AS tokens_out,
             coalesce(sum(coalesce((a.usage->'prompt_tokens_details'->>'cached_tokens')::bigint, (a.usage->>'prompt_cache_hit_tokens')::bigint, 0)), 0) AS tokens_cached,
             count(*) FILTER (WHERE a.cost IS NULL)::int AS uncosted_calls,
             coalesce(sum((a.usage->>'prompt_tokens')::bigint) FILTER (WHERE a.cost IS NULL), 0) AS tokens_in_uncosted,
             coalesce(sum((a.usage->>'completion_tokens')::bigint) FILTER (WHERE a.cost IS NULL), 0) AS tokens_out_uncosted,
             coalesce(sum(coalesce((a.usage->'prompt_tokens_details'->>'cached_tokens')::bigint, (a.usage->>'prompt_cache_hit_tokens')::bigint, 0)) FILTER (WHERE a.cost IS NULL), 0) AS tokens_cached_uncosted,
             sum(a.cost) FILTER (WHERE a.cost_basis = 'actual') AS actual_cost,
             max(a.currency) FILTER (WHERE a.cost_basis = 'actual' AND a.cost IS NOT NULL) AS currency
        FROM receipt_attempts a
       WHERE a.started_at >= ${start} AND a.origin = 'live' AND a.model IS NOT NULL
       GROUP BY 1, 2, 3`,
    sql<Price[]>`SELECT service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok FROM service_prices`,
  ]);

  const byDay = new Map<string, Acc>();
  const byChannel = new Map<string, Acc>();
  const byModel = new Map<string, Acc>();
  const totals = emptyAcc();
  for (const row of rows) {
    const priced = priceOf(row, prices);
    for (const [map, key] of [[byDay, row.day], [byChannel, row.service], [byModel, `${row.service}\u0000${row.model}`]] as const) {
      const acc = map.get(key) ?? emptyAcc();
      map.set(key, acc);
      addRow(acc, row, priced);
    }
    addRow(totals, row, priced);
  }

  const trend: AdminCostDay[] = Array.from({ length: window }, (_, i) => {
    const day = addDays(startDay, i);
    const acc = byDay.get(day);
    return { day, calls: acc?.calls ?? 0, failed: acc?.failed ?? 0, tokensIn: acc?.tokensIn ?? 0, tokensOut: acc?.tokensOut ?? 0, tokensCached: acc?.tokensCached ?? 0, cost: acc?.cost ?? 0 };
  });

  const env = channelEnv();
  const channels: AdminCostChannel[] = [...byChannel.entries()]
    .map(([service, acc]) => ({
      service,
      apiKeyEnv: env.get(service)?.apiKeyEnv ?? null,
      baseUrlEnv: env.get(service)?.baseUrlEnv ?? null,
      calls: acc.calls, ok: acc.ok, failed: acc.failed, unknown: acc.unknown,
      tokensIn: acc.tokensIn, tokensOut: acc.tokensOut, tokensCached: acc.tokensCached,
      unpriced: acc.unpriced, cost: acc.cost, currency: acc.currency,
    }))
    .sort((a, b) => b.cost - a.cost || a.service.localeCompare(b.service));

  const models: AdminCostModel[] = [...byModel.entries()]
    .map(([key, acc]) => {
      const [service, model] = key.split("\u0000") as [string, string];
      return {
        service, model,
        calls: acc.calls, ok: acc.ok, failed: acc.failed, unknown: acc.unknown,
        tokensIn: acc.tokensIn, tokensOut: acc.tokensOut, tokensCached: acc.tokensCached,
        unpriced: acc.unpriced, cost: acc.cost, currency: acc.currency,
      };
    })
    .sort((a, b) => b.cost - a.cost || a.service.localeCompare(b.service) || a.model.localeCompare(b.model));

  return {
    days: window,
    totals: { calls: totals.calls, failed: totals.failed, tokensIn: totals.tokensIn, tokensOut: totals.tokensOut, tokensCached: totals.tokensCached, unpriced: totals.unpriced, cost: totals.cost, currency: totals.currency },
    trend,
    channels,
    models,
  };
}
