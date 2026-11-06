import assert from "node:assert/strict";
import test from "node:test";
import { request } from "node:http";
import { createLabServer } from "../examples/selection-lab/server.ts";
import { evaluate, example } from "../examples/selection-lab/model.ts";
import { shownScore, scoresSelect } from "../packages/backend/src/editorial/selection-scores.ts";

const query = (value = "") => evaluate(new URLSearchParams(value));
test("tutorial uses real thresholds, full score sum, and floor only for display", () => {
  assert.equal(query().passesScoreGate, true);
  const below = query("tier=T2&first=75&second=76");
  assert.equal(below.shownScore, 75);
  assert.equal(below.sum, 151);
  assert.equal(below.passesScoreGate, false);
  assert.equal(query("tier=T2&first=75&second=77").passesScoreGate, true);
  assert.equal(query("tier=T1_5&first=65&second=65").passesScoreGate, true);
  assert.equal(query("first=0&second=0").passesScoreGate, false);
  assert.equal(query("first=100&second=100").passesScoreGate, true);
});
test("missing, refused and excluded scores cannot pass or show a score", () => {
  for (const value of ["status=missing", "status=refused", "tier=EXCLUDE_MP"]) {
    const result = query(`${value}&first=100&second=100`);
    assert.equal(result.passesScoreGate, false);
    assert.equal(result.shownScore, null);
  }
  assert.equal(scoresSelect(null), false);
  assert.equal(shownScore(null), null);
  const scores = { values: [59, 60], threshold: 60, model: "test", receiptIds: [], reused: false };
  assert.equal(scoresSelect(scores, 59.5), true);
  assert.equal(shownScore(scores), 59);
});
test("tutorial rejects invalid or ambiguous input and retains evidence", () => {
  for (const value of ["first=-1", "first=101", "first=NaN", "first=1.5", "first=", "tier=__proto__", "status=oops", "first=1&first=2", "url=https://example.com"]) assert.throws(() => query(value));
  assert.ok(example.material.includes(example.evidence));
  assert.equal(example.kind, "synthetic-tutorial");
  assert.ok(new URL(example.url).hostname.endsWith(".example"));
});
test("loopback server exposes only tutorial assets and validates requests", async () => {
  const server = createLabServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-security-policy") ?? "", /connect-src 'self'/);
    assert.match(await home.text(), /离线合成样例/);
    assert.equal((await fetch(`${base}/api/example`).then((r) => r.json())).kind, "synthetic-tutorial");
    assert.equal((await fetch(`${base}/api/evaluate`).then((r) => r.json())).passesScoreGate, true);
    for (const path of ["/.env", "/package.json", "/industry/selection.ts", "/..%2f.env"]) assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(`${base}/api/evaluate?first=101`)).status, 400);
    assert.equal((await fetch(`${base}/api/evaluate`, { method: "POST" })).status, 405);
    const denied = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(base, { headers: { Host: "attacker.example" } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
      req.on("error", reject); req.end();
    });
    assert.equal(denied, 403);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
