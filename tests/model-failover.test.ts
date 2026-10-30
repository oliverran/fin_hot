// Failure modes: outages keep charging the primary; concurrent recovery probes flood it; a restart
// forgets the outage; a saved backup answer is bought again; timeouts lose their billing history;
// budget, input and output errors accidentally trigger a second provider.
import { pointModels, Reply, stub, tag } from "./setup.ts";
import { analysisStep, SELECTING_SCORE } from "./analysis-steps.ts";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { spawn } from "node:child_process";
import { z } from "zod";
import { sql, closeDb } from "@aihot/backend/db";
import { analyzeArticle } from "@aihot/backend/editorial/analyze";
import { CAPABILITIES, type Capability } from "@aihot/backend/editorial/models";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { chatJson } from "@aihot/backend/providers/llm";
import { BudgetExceededError, failureKind, ModelOutputError, ReceiptUnknownError } from "@aihot/backend/providers/receipts";
import { autoReleaseUnknownReceipts } from "@aihot/backend/operations/recover";
import { collectFindings } from "@aihot/backend/operations/alerts";
import { navCounts } from "@aihot/backend/admin/navigation";
import { runsOverview } from "@aihot/backend/admin/runs";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";

const answer = (value: string) => ({ choices: [{ message: { content: JSON.stringify({ value }) } }] });
let primaryAnswer: () => unknown = () => answer("primary");
let backupAnswer: () => unknown = () => answer("backup");
const primary = await stub(() => primaryAnswer());
const backup = await stub(() => backupAnswer());
pointModels(primary.url, ["deepseek-flash", "glm-5.3-flash"]);
pointModels(backup.url, ["qwen3.8-flash"]);
const T = tag();
const request = (name: string) => ({
  model: "deepseek-flash", fallbackModel: "qwen3.8-flash", purpose: "summarize_article",
  subject: `failover:${T}:${name}`, promptVersion: "failover-test", system: "Return the requested value.",
  user: `${T}:${name}`, schema: z.object({ value: z.string() }),
});
beforeEach(async () => {
  await sql`DELETE FROM settings WHERE key LIKE 'model.circuit.%'`;
  primaryAnswer = () => answer("primary"); backupAnswer = () => answer("backup");
});
after(async () => { await Promise.all([primary.close(), backup.close()]); await stopBoss(); await closeDb(); });

test("a 503 uses the backup and a retry reuses its saved answer after the primary recovers", async () => {
  primaryAnswer = () => new Reply(503, { error: "overloaded" });
  const first = await chatJson(request("saved"));
  assert.equal(first.model, "qwen3.8-flash");
  assert.equal(first.data.value, "backup");
  primaryAnswer = () => answer("primary");
  const calls = [primary.hits(), backup.hits()];
  const again = await chatJson(request("saved"));
  assert.equal(again.receiptId, first.receiptId);
  assert.equal(again.reused, true);
  assert.deepEqual([primary.hits(), backup.hits()], calls);
});

test("ten consecutive failures within five minutes stop primary calls across steps and a fresh process, then one probe restores it", async () => {
  primaryAnswer = () => new Reply(503, { error: "overloaded" });
  const before = primary.hits();
  for (let i = 0; i < 9; i++) await chatJson(request(`trip-${i}`));
  assert.equal(primary.hits(), before + 9);
  assert.equal((await sql`SELECT value FROM settings WHERE key='model.circuit.deepseek'`)[0]!.value.openUntil, 0);
  await chatJson(request("trip-9"));
  const calls = primary.hits();
  const grouped = await chatJson({ ...request("group-during-outage"), purpose: "group_signal" });
  assert.equal(grouped.model, "qwen3.8-flash");
  assert.equal(primary.hits(), calls);
  assert.equal((await sql`SELECT 1 FROM receipts WHERE subject = ${request("group-during-outage").subject} AND service = 'deepseek'`).length, 0,
    "an open circuit does not reserve budget or record an unsent attempt");
  const source = `import {z} from 'zod'; import {chatJson} from '@aihot/backend/providers/llm'; import {closeDb} from '@aihot/backend/db'; const r=await chatJson({...${JSON.stringify({ ...request("restart"), schema: undefined })},schema:z.object({value:z.string()})}); console.log(r.model); await closeDb();`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; let errors = "";
  child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { errors += chunk; });
  assert.equal(await new Promise(resolve => child.on("exit", resolve)), 0, errors);
  assert.match(output, /qwen3\.8-flash/);
  assert.equal(primary.hits(), calls);
  await sql`UPDATE settings SET value = jsonb_set(value, '{openUntil}', ${sql.json(Date.now() - 1)}) WHERE key = 'model.circuit.deepseek'`;
  let release!: () => void; let started!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  primaryAnswer = async () => { started(); await waiting; return answer("primary"); };
  const probe = chatJson(request("probe"));
  await entered;
  try {
    assert.equal((await chatJson(request("while-probing"))).model, "qwen3.8-flash");
    assert.equal(primary.hits(), calls + 1);
  } finally { release(); }
  assert.equal((await probe).model, "deepseek-flash");
  primaryAnswer = () => answer("primary");
  assert.equal((await chatJson(request("restored"))).model, "deepseek-flash");
  assert.equal(primary.hits(), calls + 2);
});

test("a failed recovery probe opens the circuit again without a new batch of primary attempts", async () => {
  primaryAnswer = () => new Reply(503, { error: "overloaded" });
  for (let i = 0; i < 10; i++) await chatJson(request(`reopen-${i}`));
  await sql`UPDATE settings SET value = jsonb_set(value, '{openUntil}', ${sql.json(Date.now() - 1)}) WHERE key = 'model.circuit.deepseek'`;
  const calls = primary.hits();
  await chatJson(request("failed-probe")); await chatJson(request("after-failed-probe"));
  assert.equal(primary.hits(), calls + 1);
});

test("a timed-out primary keeps its unknown receipt after the backup succeeds, and nothing asks anyone to release it", async () => {
  primaryAnswer = async () => { await new Promise(resolve => setTimeout(resolve, 100)); return answer("too-late"); };
  const result = await chatJson({ ...request("timeout"), timeoutMs: 30 });
  assert.equal(result.model, "qwen3.8-flash");
  const [original] = await sql`SELECT id, status, request, cost FROM receipts WHERE subject = ${request("timeout").subject} AND service = 'deepseek'`;
  assert.equal(original!.status, "unknown"); assert.equal(original!.cost, null);
  assert.equal(original!.request.fallbackReceiptId, result.receiptId);
  await sql`UPDATE receipts SET updated_at = now() - interval '31 minutes' WHERE id = ${original!.id}`;
  assert.equal((await autoReleaseUnknownReceipts()).released, 0);
  assert.equal((await sql`SELECT status FROM receipts WHERE id = ${original!.id}`)[0]!.status, "unknown");
  // Kept unknown for billing only: not on the admin badge, the runs page's list or the alerts, where
  // such primaries would pile up and push out the receipts that do block work.
  assert.equal((await navCounts()).runs, 0);
  await getBoss(); // the runs page and the alerts read the job tables
  assert.equal((await runsOverview()).receipts.issues.some((receipt) => receipt.id === original!.id), false);
  assert.equal((await collectFindings()).some((finding) => finding.key === "receipts.unknown"), false);
});

test("a timeout at both providers stops and repeated work cannot buy a third request", async () => {
  primaryAnswer = backupAnswer = async () => { await new Promise(resolve => setTimeout(resolve, 100)); return answer("too-late"); };
  const opts = { ...request("both-timeout"), timeoutMs: 30 };
  await assert.rejects(chatJson(opts), ReceiptUnknownError);
  const calls = [primary.hits(), backup.hits()];
  await assert.rejects(chatJson(opts), ReceiptUnknownError);
  assert.deepEqual([primary.hits(), backup.hits()], calls);
});

test("input rejection, unusable output and a stopped budget do not switch provider", async () => {
  const calls = backup.hits();
  primaryAnswer = () => new Reply(400, { error: "invalid input" });
  await assert.rejects(chatJson(request("bad-input")), /400/);
  primaryAnswer = () => ({ choices: [{ message: { content: "broken" } }] });
  await assert.rejects(chatJson(request("bad-output")), ModelOutputError);
  await sql`UPDATE settings SET value = jsonb_set(value, '{openUntil}', ${sql.json(Date.now() + 300_000)}) WHERE key = 'model.circuit.deepseek'`;
  await sql`UPDATE budgets SET per_day = 0 WHERE service = 'deepseek'`;
  try { await assert.rejects(chatJson(request("budget")), BudgetExceededError); }
  finally { await sql`UPDATE budgets SET per_day = 30000 WHERE service = 'deepseek'`; }
  assert.equal(backup.hits(), calls);
});

// A permanent 429 must not buy a fallback or trip the temporary-outage circuit. A real
// rate limit still uses the existing fallback policy and keeps the original attempt failed.
test("429 account refusals stop at the primary while temporary throttling can use the backup", async () => {
  const calls = backup.hits();
  primaryAnswer = () => new Reply(429, { error: { code: "1113", message: "account unavailable" } });
  const opts = { ...request("429-balance"), model: "glm-5.3-flash" };
  await assert.rejects(chatJson(opts), (error: unknown) => failureKind(error) === "refused");
  assert.equal(backup.hits(), calls);
  assert.equal((await sql`SELECT value FROM settings WHERE key='model.circuit.zhipu'`)[0]!.value.failures, 0);
  assert.equal((await sql`SELECT status FROM receipt_attempts WHERE service='zhipu' ORDER BY id DESC LIMIT 1`)[0]!.status, "failed");
  // A spent account pauses the service for a cooldown (providers/receipts.ts); the throttle below is
  // about a service that can still be called.
  await sql`DELETE FROM settings WHERE key='provider.stop.zhipu:glm-5.3-flash'`;
  primaryAnswer = () => new Reply(429, { error: { code: "1302", message: "请求频率过高" } });
  assert.equal((await chatJson({ ...opts, subject: `${opts.subject}-rate`, user: "rate-limited" })).model, "qwen3.8-flash");
  assert.equal(backup.hits(), calls + 1);
});

// The site backs the default model with an independently operated provider (site/models.ts). A step
// left on the default must reach that backup when its provider is down, or the first paid call of the
// analysis stops the whole pipeline.
test("an analysis left on the default model reaches its evaluated backup when the provider is down", async () => {
  const answering = await stub((_hit, req) => {
    const step = analysisStep(req.body);
    const content = step === "prefilter" ? { label: "PASS", reason: "产品发行" }
      : step === "score" ? { attentionScore: SELECTING_SCORE }
        : step === "structure" ? { category: "funds", tags: ["产品更新"], subjects: [], fact: null }
          : { itemType: "product_launch", authorRole: "principal", tags: ["产品更新"], editorialJudgment: "有明确的规模提升", titleZh: `备用模型的标题 ${T}`, summaryZh: "由备用模型写成的摘要。第二句。" };
    return { id: "stub-backup", choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
  });
  const assigned = { LLM_BASE_URL: `${primary.url}/v1`, LLM_API_KEY: "test-key", LLM_MODEL: "one-model", KIMI_BASE_URL: `${answering.url}/v1`, KIMI_API_KEY: "test-key" };
  const saved = Object.entries(assigned).map(([key, value]) => [key, process.env[key], value] as const);
  const steps = (Object.values(CAPABILITIES) as Capability[]).map((c) => [c.env, process.env[c.env], c.default === "default" ? "" : "default"] as const);
  const source = `test-failover-analyze-${T}`;
  primaryAnswer = () => new Reply(503, { error: "overloaded" });
  for (const [key, , value] of [...saved, ...steps]) process.env[key] = value;
  try {
    await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
      VALUES (${source},'Failover analysis','rss','T1','editorial','2100-01-01')`;
    const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.com/failover-${T}`, title: `A product launch ${T}`,
      bodyText: `A company launched a product with pricing and availability. ${T} `.repeat(6), bodyStatus: "ok", via: "fetch", publishedAt: new Date() } as never);
    const res = await analyzeArticle(articleId);
    assert.equal(res?.output?.selected, true);
    assert.equal(res?.output?.titleZh, `备用模型的标题 ${T}`);
    const answered = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipts WHERE subject LIKE ${`article:${articleId}%`} AND service = 'moonshot'`;
    assert.equal(answered[0]!.n, 5, "every step of the analysis was attempted at the default provider and answered by its evaluated backup");
  } finally {
    for (const [key, value] of [...saved, ...steps]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await answering.close();
  }
});
