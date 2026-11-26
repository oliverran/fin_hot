// 后台「评测前沿」的读取：把一次 SelectBench 对比运行（selectbench_runs.summary，由
// scripts/eval-selection.ts 写入并自动导入）翻译成帕累托前沿图要用的点——每个模型的质量指标、
// 每条样本的估算成本与平均延迟。成本按 service_prices 的目录价把 summary 里记的 token 估成钱
//（输入按输入价、输出按输出价）再除以样本数；summary 没有拆分命中缓存的 token，所以这是上限。
// 渠道认不出、或该渠道没有单价时，成本记 null：这些模型不画进前沿，但仍列在表里。
import { sql } from "@aihot/backend/db";
import { MODELS } from "@aihot/backend/providers/llm";
import type { AdminModelEval, AdminModelEvalRun, BeforeJson } from "@aihot/contracts/admin";

interface RunRow {
  id: string;
  label: string;
  split: string | null;
  sample_size: number;
  prompt_version: string | null;
  models: string[];
  summary: Record<string, Record<string, number>> | null;
  created_at: Date;
}

interface PriceRow {
  service: string;
  model: string;
  currency: string;
  input_per_mtok: string | null;
  cached_per_mtok: string | null;
  output_per_mtok: string | null;
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const toRun = (row: RunRow): BeforeJson<AdminModelEvalRun> => ({
  id: row.id,
  label: row.label,
  split: row.split,
  sampleSize: row.sample_size,
  promptVersion: row.prompt_version,
  createdAt: row.created_at,
});

const NOTE =
  "成本按 service_prices 的目录价，把这次运行记录的 token 估成钱（输入按输入价、输出按输出价）再除以样本数；" +
  "没有拆分命中缓存的 token，所以是上限。渠道没有单价的模型不画进前沿，但仍列在表里。";

export async function modelEval(id?: string): Promise<BeforeJson<AdminModelEval>> {
  // 只读 summary；顺带去掉里面的 sweep 数组（它不是数字，页面用不上）。
  const runs = await sql<RunRow[]>`
    SELECT r.id, r.label, r.split, r.sample_size, r.prompt_version, r.models,
           (SELECT coalesce(jsonb_object_agg(key, value - 'sweep'), '{}'::jsonb) FROM jsonb_each(r.summary)) AS summary,
           r.created_at
    FROM selectbench_runs r ORDER BY r.created_at DESC LIMIT 50`;
  const run = (id ? runs.find((r) => r.id === id) : undefined) ?? runs[0] ?? null;
  if (!run) return { run: null, runs: [], points: [], note: NOTE };
  const prices = await sql<PriceRow[]>`SELECT service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok FROM service_prices`;
  const summary = run.summary ?? {};
  const points = run.models.map((model) => {
    const s = summary[model] ?? {};
    const spec = MODELS[model];
    const service = spec?.service ?? null;
    // 先找这个模型的单价，退到该渠道的通用行（model 为空）。
    const p = service
      ? prices.find((x) => x.service === service && x.model === spec?.model) ?? prices.find((x) => x.service === service && x.model === "")
      : undefined;
    const tokensIn = num(s.tokensIn);
    const tokensOut = num(s.tokensOut);
    const priced = p && (p.input_per_mtok || p.output_per_mtok);
    const costPerCase = priced && run.sample_size > 0
      ? ((tokensIn / 1e6) * Number(p.input_per_mtok ?? 0) + (tokensOut / 1e6) * Number(p.output_per_mtok ?? 0)) / run.sample_size
      : null;
    return {
      model,
      service,
      decisive: num(s.decisive),
      accuracy: num(s.accuracy),
      coverage: num(s.coverage),
      completeAccuracy: num(s.completeAccuracy),
      precision: num(s.precision),
      recall: num(s.recall),
      f1: num(s.f1),
      selectedRate: num(s.selectedRate),
      goldSelectRate: num(s.goldSelectRate),
      errors: num(s.errors),
      tokensIn,
      tokensOut,
      avgLatencyMs: num(s.avgLatencyMs),
      costPerCase: costPerCase === null ? null : Math.round(costPerCase * 10000) / 10000,
      currency: costPerCase === null ? null : p?.currency ?? null,
    };
  });
  return { run: toRun(run), runs: runs.map(toRun), points, note: NOTE };
}
