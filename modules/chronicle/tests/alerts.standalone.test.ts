// 编年史的付费数据服务告警：只在开启定时同步时报。凭证被拒（token 过期、无效、无权限）最该被通知——
// 数据会悄悄停在最后一次成功同步，页面看不出异常；整批指数超过两天没成功更新算「同步连续失败」。
// 只读写各自的快照文件，不连数据库。
import assert from "node:assert/strict";
import { test } from "node:test";
import { rm } from "node:fs/promises";
import { saveSnapshot, snapshotFile } from "../backend/snapshots.ts";
import chronicle from "../server.ts";

const NOW = Date.parse("2026-11-13T04:00:00Z");
const at = (ms: number) => new Date(ms).toISOString();
const index = (syncedAt: string) => ({ code: "000300.SH", name: "沪深300", kind: "broad", bars: [], valuations: [], syncedAt });

test("Tushare 告警：未开同步不报；凭证被拒与整批停更各报一条", async () => {
  const alerts = chronicle.alerts!;
  const before = process.env.TUSHARE_SYNC_ENABLED;
  try {
    delete process.env.TUSHARE_SYNC_ENABLED;
    await saveSnapshot("provider", { updatedAt: at(NOW), source: "x", indices: [index(at(NOW))] });
    assert.deepEqual(await alerts(NOW), [], "关闭定时同步时不报");

    process.env.TUSHARE_SYNC_ENABLED = "true";
    await rm(snapshotFile("provider"), { force: true });
    assert.deepEqual(await alerts(NOW), [], "还没同步过时不报");

    await saveSnapshot("provider", { updatedAt: at(NOW), source: "x", indices: [index(at(NOW - 3600_000))], authError: "抱歉，您的token不对" });
    const auth = await alerts(NOW);
    assert.equal(auth.length, 1);
    assert.equal(auth[0]!.key, "chronicle.tushare.auth");
    assert.equal(auth[0]!.level, "today");

    await saveSnapshot("provider", { updatedAt: at(NOW - 48 * 3600_000), source: "x", indices: [index(at(NOW - 48 * 3600_000))], errors: ["000300.SH 同步失败"] });
    const stale = await alerts(NOW);
    assert.equal(stale.length, 1);
    assert.equal(stale[0]!.key, "chronicle.tushare.sync");
    assert.equal(stale[0]!.level, "later");

    await saveSnapshot("provider", { updatedAt: at(NOW), source: "x", indices: [index(at(NOW - 3600_000))] });
    assert.deepEqual(await alerts(NOW), [], "至少一只还在两天内就不报");
  } finally {
    if (before === undefined) delete process.env.TUSHARE_SYNC_ENABLED;
    else process.env.TUSHARE_SYNC_ENABLED = before;
  }
});
