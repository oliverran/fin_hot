// 费用看板与「模型与评测」页按单价把服务商没有回传费用的调用（llm 这一路写的就是 null）估成钱。
// 这里写入本部署各渠道的初始单价，幂等：已有的行不动（人工改过的单价不被覆盖）。
// 数字是「忙时」（北京时间 08:00–22:00）的价，闲时更低；改单价请直接 UPDATE service_prices。
// 可重跑：node --env-file=.env modules/costs/scripts/seed-prices.ts
// 线上：docker exec -i aihot-api-1 node --env-file=.env modules/costs/scripts/seed-prices.ts
import { closeDb, sql } from "@aihot/backend/db";

interface PriceRow {
  service: string;
  /** 空字符串是该渠道的通用行，没有精确匹配时用它。 */
  model: string;
  input: number;
  /** 命中前缀缓存的输入单价；不知道该价时留空，估算时退回输入价。 */
  cached: number | null;
  output: number;
}

const PRICES: PriceRow[] = [
  // 默认模型（site/models.ts 的 `default`，读 LLM_*）：阿里云百炼网关上的 deepseek-v4.1-flash。
  { service: "llm", model: "deepseek-v4.1-flash", input: 2, cached: 0.2, output: 8 },
  { service: "llm", model: "", input: 2, cached: 0.2, output: 8 },
  // DeepSeek 官方直连：同一款 V4.1-Flash，缓存价便宜十倍。
  { service: "deepseek", model: "deepseek-flash", input: 2, cached: 0.04, output: 8 },
  { service: "deepseek", model: "", input: 2, cached: 0.04, output: 8 },
  // 阿里云百炼上的 qwen 系列，宽召回/写作步骤用它。
  { service: "dashscope", model: "qwen3.7-flash", input: 0.2, cached: 0.04, output: 0.8 },
  { service: "dashscope", model: "qwen3.8-flash", input: 0.8, cached: null, output: 2.7 },
  // MiniMax（OpenAI 兼容）。
  { service: "minimax", model: "MiniMax-M3.1-Flash", input: 1, cached: 0.1, output: 4 },
  { service: "minimax", model: "", input: 1, cached: 0.1, output: 4 },
];

let added = 0;
for (const p of PRICES) {
  const inserted = await sql`
    INSERT INTO service_prices (service, model, currency, input_per_mtok, cached_per_mtok, output_per_mtok)
    VALUES (${p.service}, ${p.model}, 'CNY', ${p.input}, ${p.cached}, ${p.output})
    ON CONFLICT (service, model) DO NOTHING RETURNING service`;
  added += inserted.length;
}
console.log(`service_prices: ${added} added, ${PRICES.length - added} already there`);
await closeDb();
