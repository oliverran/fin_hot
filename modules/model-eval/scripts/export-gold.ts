// 后台「评测前沿」要有人工金标才有内容。这个脚本从本站库里抽一批「精选评分」这一步看得到的候选资料
// （分析里 relevance=pass 且打过分），写成 .data/gold.jsonl 的骨架：每行一条，字段与 docs/selection.md 一致，
// gold.decision 先留成 "?"，由你逐条标成 select / reject / either，再跑 scripts/eval-selection.ts。
//
// 抽样刻意多放难例：一半取本站已经选中的，一半取没选中但分数贴着门槛的（差一点就选），不够再补明显不该选的。
// 为免标注时被本站自己的判断带偏，写出的顺序打乱，且不把「选中/没选中」或分数写进文件；只在终端里报一下构成。
// caseId 用文章 id（fin-<id>）稳定，同一批资料重跑得到同一份；benchmarkSplit 由 id 定，约 30% 归 holdout。
//
// 用法：node --env-file=.env modules/model-eval/scripts/export-gold.ts [--out .data/gold.jsonl] [--limit 200] [--seed 7] [--holdout 0.3]
// 线上：docker exec -i aihot-api-1 node --env-file=.env modules/model-eval/scripts/export-gold.ts --out /tmp/gold.jsonl
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { tierThreshold } from "@aihot/backend/editorial/selection-scores";
import { isChineseText } from "@aihot/backend/lib/text";

/** 没选中但分数离门槛这么近的算难例（docs/selection.md 说的「差一点就该选」）。 */
const NEAR = 6;

interface Row {
  article_id: string;
  score: number;
  category: string | null;
  title: string;
  published_at: Date | null;
  body_text: string | null;
  excerpt: string | null;
  x_text: string | null;
  source_name: string;
  source_kind: string;
  tier: string;
  source_first_party: boolean;
  published_selected: boolean | null;
  pub_category: string | null;
  translation_zh: string | null;
}

/** 一行金标；字段与 scripts/eval-selection-core.ts 的 GoldRow 对齐。 */
interface GoldLine {
  caseId: string;
  material: {
    title: string;
    sourceName: string;
    originalTitle: string | null;
    publishedAt: string | null;
    bodyZh: string | null;
    bodyOriginal: string | null;
  };
  sourceFacts: { sourceKind: string; sourceTier: string; firstParty: boolean; language: string | null };
  samplingContext: { benchmarkSplit: string; samplingStratum?: string };
  gold: { decision: string };
}

const { values } = parseArgs({
  options: {
    out: { type: "string", default: ".data/gold.jsonl" },
    limit: { type: "string", default: "200" },
    seed: { type: "string", default: "7" },
    holdout: { type: "string", default: "0.3" },
  },
});

const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit <= 0) throw new Error("--limit 必须是正整数");
const seed = Number(values.seed) >>> 0;
const holdout = Number(values.holdout);
if (!(holdout >= 0 && holdout < 1)) throw new Error("--holdout 必须落在 [0, 1)");

/** 抽样用的一次性随机数（与 eval-tools.ts 的 sampleCases 同一套线性同余），改 seed 换一批。 */
let state = seed;
const rng = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const shuffle = <T>(items: T[]): T[] =>
  items.map((item) => ({ item, key: rng() })).sort((a, b) => a.key - b.key).map(({ item }) => item);

/** 开发集 / 留出集由文章 id 定，与抽哪些样本无关，重跑稳定。 */
function splitOf(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h / 2 ** 32 < holdout ? "holdout" : "development";
}

// 每篇文章取最新一次打分、且过了预筛的分析；只要精选评分看得到的那一档信源。
const rows = await sql<Row[]>`
  SELECT DISTINCT ON (ar.id)
    ar.id AS article_id, a.score::float8 AS score, a.category,
    ar.title, ar.published_at, ar.body_text, ar.excerpt, ar.x_post->>'text' AS x_text,
    s.name AS source_name, s.kind AS source_kind, s.tier, s.first_party AS source_first_party,
    p.selected AS published_selected, p.category AS pub_category,
    tr.body_text AS translation_zh
  FROM analyses a
  JOIN articles ar ON ar.id = a.article_id
  JOIN sources s ON s.id = ar.source_id
  LEFT JOIN publications p ON p.article_id = ar.id AND p.visibility = 'public'
  LEFT JOIN translations tr ON tr.article_id = ar.id AND tr.lang = 'zh' AND tr.revision >= ar.revision
  WHERE a.score IS NOT NULL AND a.relevance = 'pass' AND s.tier IN ('T1', 'T1_5', 'T2')
  ORDER BY ar.id, a.id DESC`;

type Bucket = "selected" | "near" | "rejected";
interface Candidate {
  bucket: Bucket;
  line: GoldLine;
}

const candidates: Candidate[] = [];
for (const r of rows) {
  // 只有标题、正文待补的，评分这一步根本不会跑（awaitsMaterial），收了也只会白占名额。
  const body = (r.body_text ?? "").trim() || (r.x_text ?? "").trim() || (r.excerpt ?? "").trim();
  if (!body) continue;
  const threshold = tierThreshold(r.tier);
  const selected = r.published_selected === true;
  const bucket: Bucket = selected ? "selected" : threshold !== null && r.score >= threshold - NEAR ? "near" : "rejected";
  const zh = isChineseText(body);
  candidates.push({
    bucket,
    line: {
      caseId: `fin-${r.article_id}`,
      material: {
        // 评分读的是原文标题与原文正文（editorial/analyze.ts 的 buildScoreInput），照原文填。
        title: r.title,
        sourceName: r.source_name,
        originalTitle: null,
        publishedAt: r.published_at ? r.published_at.toISOString() : null,
        bodyZh: zh ? body : r.translation_zh?.trim() || null,
        bodyOriginal: zh ? null : body,
      },
      sourceFacts: { sourceKind: r.source_kind, sourceTier: r.tier, firstParty: r.source_first_party, language: zh ? "zh" : null },
      samplingContext: { benchmarkSplit: splitOf(r.article_id), samplingStratum: r.pub_category ?? r.category ?? undefined },
      gold: { decision: "?" },
    },
  });
}

// 配额：一半取已选中的，负面里八成取卡线的难例、两成取明显不该选的（留一点好判断的做对照）。
// 哪一档不够就从别的档补，保证凑够 limit。
const queues: Record<Bucket, Candidate[]> = { selected: [], near: [], rejected: [] };
for (const c of candidates) queues[c.bucket].push(c);
for (const bucket of Object.keys(queues) as Bucket[]) queues[bucket] = shuffle(queues[bucket]);
const pull = (bucket: Bucket, n: number) => queues[bucket].splice(0, n);

const picked: Candidate[] = pull("selected", Math.ceil(limit * 0.5));
const negQuota = limit - picked.length;
picked.push(...pull("near", Math.ceil(negQuota * 0.8)));
picked.push(...pull("rejected", limit - picked.length));
for (const bucket of ["near", "selected", "rejected"] as const) {
  if (picked.length >= limit) break;
  picked.push(...pull(bucket, limit - picked.length));
}
if (!picked.length) throw new Error("库里没有可抽的候选：先让 worker 采集并打过一轮分（要有正文、relevance=pass、score 非空）");

// 打乱一次，免得文件顺序把本站的判定漏出去。
const ordered = shuffle(picked);

const HEADER = [
  "// 本文件由 modules/model-eval/scripts/export-gold.ts 生成，是「精选评分」评测的候选样本骨架。",
  "// 每行一条，字段见 docs/selection.md；gold.decision 现在都是 \"?\"，请改成 select（该选）/ reject（不该选）/ either（两可）。",
  "// 本站自己的判定与分数没有写进文件，免得标注时被带偏。标完之后跑：",
  "//   node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl --split development --label \"第一版\"",
  "// 起首带 // 的行会被评测脚本跳过。",
].join("\n");

const out = path.resolve(REPO_ROOT, values.out!);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${HEADER}\n${ordered.map((c) => JSON.stringify(c.line)).join("\n")}\n`);

const count = (bucket: Bucket) => ordered.filter((c) => c.bucket === bucket).length;
const split = (name: string) => ordered.filter((c) => c.line.samplingContext.benchmarkSplit === name).length;
console.log(`写好 ${ordered.length} 条 → ${out}`);
console.log(`  已选中 ${count("selected")} · 卡线难例 ${count("near")} · 明显不该选 ${count("rejected")}（只在这里显示，文件里看不到）`);
console.log(`  development ${split("development")} · holdout ${split("holdout")}`);
console.log(`  下一步：把每行的 gold.decision 从 "?" 改成 select/reject/either，再跑 scripts/eval-selection.ts`);
await closeDb();
