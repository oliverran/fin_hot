// The worker watchdog in the api process: one alert when the heartbeat goes stale, none while it stays
// stale, one recovery when it comes back; a failed send is tried again at the next check.
import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { checkWorkerHeartbeat } from "@aihot/backend/operations/watch";
import { sendAlert } from "@aihot/backend/notify/feishu";

const T = tag();
const keys = ["heartbeat.worker", "watchdog.worker"];
const envNames = ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_ALERT_CHAT_ID", "FEISHU_ALERT_WEBHOOK_URL", "FEISHU_INTERNAL_CHAT_ID", "FEISHU_INTERNAL_ENABLED"];
const savedEnv = new Map(envNames.map((name) => [name, process.env[name]]));
const attempts: string[] = [];
const hooked: string[] = [];
const hookedAt: number[] = [];
const hookedBytes: number[] = [];
let failing = false;
const provider = await stub(async (_hit, req) => {
  if (req.url.endsWith("/auth/v3/tenant_access_token/internal")) return { code: 0, tenant_access_token: "fictional-token", expire: 7200 };
  const body = JSON.parse(req.body);
  if (req.url.endsWith(`/bot/v2/hook/test-${T}`)) {
    assert.equal(body.msg_type, "text");
    hooked.push(body.content.text as string);
    hookedAt.push(performance.now());
    hookedBytes.push(Buffer.byteLength(req.body));
    return failing ? { code: 19001, msg: "synthetic webhook failure" } : { StatusCode: 0, code: 0, msg: "success" };
  }
  assert.equal(body.receive_id, `oc_test_${T}`);
  attempts.push(JSON.parse(body.content).text as string);
  return failing ? { code: 99, msg: "synthetic send failure" } : { code: 0, data: { message_id: `message-${T}` } };
});
const realFetch = globalThis.fetch;
// Only the fictional Feishu transport goes to the local stub; any other destination is refused.
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.origin, "https://open.feishu.cn");
  return realFetch(`${provider.url}${url.pathname}${url.search}`, init);
}) as typeof fetch;

async function heartbeat(stale: boolean) {
  const at = new Date(Date.now() - (stale ? 61 * 60_000 : 0));
  await sql`INSERT INTO settings(key,value,updated_by,updated_at) VALUES('heartbeat.worker','{}','test',${at})
    ON CONFLICT(key) DO UPDATE SET updated_at=EXCLUDED.updated_at`;
}

beforeEach(async () => {
  await sql`DELETE FROM settings WHERE key=ANY(${keys})`;
  attempts.length = 0;
  hooked.length = 0;
  hookedAt.length = 0;
  hookedBytes.length = 0;
  failing = false;
  process.env.FEISHU_APP_ID = "test-app";
  process.env.FEISHU_APP_SECRET = "test-secret";
  process.env.FEISHU_ALERT_CHAT_ID = `oc_test_${T}`;
  delete process.env.FEISHU_ALERT_WEBHOOK_URL;
  delete process.env.FEISHU_INTERNAL_CHAT_ID;
  process.env.FEISHU_INTERNAL_ENABLED = "true";
});
after(async () => {
  globalThis.fetch = realFetch;
  await provider.close();
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await closeDb();
});

test("one alert when the worker stops, none while it stays stopped, one recovery when it is back", async () => {
  await heartbeat(false);
  await checkWorkerHeartbeat();
  assert.equal(attempts.length, 0, "a first check that finds the worker running only records it");
  await heartbeat(true);
  await checkWorkerHeartbeat();
  await checkWorkerHeartbeat();
  assert.equal(attempts.length, 1);
  assert.match(attempts[0]!, /后台处理服务停了/);
  await heartbeat(false);
  await checkWorkerHeartbeat();
  await checkWorkerHeartbeat();
  assert.equal(attempts.length, 2);
  assert.match(attempts[1]!, /已恢复/);
});

test("a failed send is tried again at the next check", async () => {
  await heartbeat(true);
  failing = true;
  await assert.rejects(checkWorkerHeartbeat(), /synthetic send failure/);
  failing = false;
  await checkWorkerHeartbeat();
  await checkWorkerHeartbeat();
  assert.equal(attempts.length, 2, "the failed alert goes out at the next check, and only then");
  assert.ok(attempts.every((text) => text.includes("后台处理服务停了")));
});

test("with an alert webhook, alerts go to the group bot alone and need no message app", async () => {
  process.env.FEISHU_ALERT_WEBHOOK_URL = `https://open.feishu.cn/open-apis/bot/v2/hook/test-${T}`;
  delete process.env.FEISHU_APP_ID;
  delete process.env.FEISHU_APP_SECRET;
  await heartbeat(true);
  failing = true;
  await assert.rejects(checkWorkerHeartbeat(), /synthetic webhook failure/);
  failing = false;
  await checkWorkerHeartbeat();
  assert.equal(attempts.length, 0, "nothing goes through the message app");
  assert.equal(hooked.length, 2, "a refused webhook send is tried again at the next check");
  assert.ok(hooked.every((text) => text.includes("后台处理服务停了")));
});

test("the alert webhook keeps within the custom bot's limits: 20 KB a request, 100 requests a minute", async () => {
  process.env.FEISHU_ALERT_WEBHOOK_URL = `https://open.feishu.cn/open-apis/bot/v2/hook/test-${T}`;
  const lines = Array.from({ length: 900 }, (_, i) => `第 ${i} 个信源：连续抓取失败，读者看不到它的新内容`);
  lines.push("长".repeat(9000));
  lines.push(...Array.from({ length: 400 }, () => String.raw`详情：{"error":"\"bad\" \\path\\"}`));
  await sendAlert("系统日报", lines);
  assert.ok(hooked.length >= 3);
  assert.ok(hookedBytes.every((n) => n <= 20 * 1024), `request sizes ${hookedBytes.join(", ")}`);
  assert.match(hooked.join(""), /^(【[^】]+】)?系统日报\n/);
  assert.ok(hooked.join("").endsWith(`系统日报\n${lines.join("\n")}`), "the pieces are the whole text, in order");
  for (let i = 1; i < hookedAt.length; i++) assert.ok(hookedAt[i]! - hookedAt[i - 1]! >= 590, "at most 100 a minute");
});

test("queued alert webhooks stay spaced after a slow failed send and a late timer", async (t) => {
  const webhook = `https://open.feishu.cn/open-apis/bot/v2/hook/test-${T}`;
  process.env.FEISHU_ALERT_WEBHOOK_URL = webhook;
  // Keep the virtual clock and queue private to this test instead of changing later alerts' deadlines.
  const { sendAlert: sendQueuedAlert } = await import(
    new URL("../packages/backend/src/notify/feishu.ts?watchdog-pacing", import.meta.url).href
  ) as typeof import("@aihot/backend/notify/feishu");
  let now = Math.ceil(performance.now());
  t.mock.method(performance, "now", () => now);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sentAt: number[] = [];
  let release!: () => void;
  const firstReply = new Promise<void>((resolve) => { release = resolve; });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    assert.equal(input instanceof Request ? input.url : String(input), webhook);
    sentAt.push(now);
    if (sentAt.length === 1) {
      await firstReply;
      throw new Error("synthetic transport failure");
    }
    return new Response(JSON.stringify({ code: 0 }));
  });
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
  const advance = async (ms: number) => {
    now += ms;
    t.mock.timers.tick(ms);
    await settle();
  };
  const results = Promise.allSettled([
    sendQueuedAlert("first", []), sendQueuedAlert("second", []), sendQueuedAlert("third", []),
  ]);
  await settle();
  assert.equal(sentAt.length, 1);
  await advance(10_000);
  assert.equal(sentAt.length, 1, "an unfinished request holds the next queued send");
  release();
  await settle();
  await advance(10_000);
  assert.equal(sentAt.length, 2, "an overdue timer releases only the next send");
  await advance(599);
  assert.equal(sentAt.length, 2, "the following send waits a fresh gap after the late send");
  await advance(1);
  assert.equal(sentAt.length, 3);
  assert.equal(sentAt[2]! - sentAt[1]!, 600);
  const outcomes = await results;
  assert.equal(outcomes[0]!.status, "rejected", "the failed attempt still rejects its caller");
  assert.deepEqual(outcomes.slice(1).map((outcome) => outcome.status), ["fulfilled", "fulfilled"]);
});
