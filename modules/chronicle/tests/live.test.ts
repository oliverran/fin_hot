// 编年史的实时行情：东财为主、腾讯兜底，解析坏行整页抛错，来源挂了就换一家。
// 抓取只连本地的假服务（stub），不访问任何外部地址。
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { Reply, stub } from "../../../tests/setup.ts";
import { fetchLive, parseEastDay, parseEastMinutes, parseTencentMinutes } from "../backend/live.ts";

config.allowPrivateNetworkFetch = true;

// 东财的响应：分时带昨收，日线是 [日期,开,收,高,低,量,额]。
const eastMinutesBody = {
  data: {
    preClose: 3600.12,
    trends: [
      "2026-10-30 09:31,3602.47,3595.72,3603.49,3595.72,19138274,28800908032.00,3584.603",
      "2026-10-30 09:32,3595.72,3605.70,3606.00,3594.00,12345678,10000000000.00,3584.700",
    ],
  },
};
const eastDayBody = {
  data: {
    klines: [
      "2026-10-28,3600.00,3610.00,3620.00,3590.00,123456789,400000000000.00",
      "2026-10-29,3610.00,3605.00,3615.00,3600.00,100000000,350000000000.00",
    ],
  },
};
// 腾讯的响应：分钟行是「时间(HHMM) 价 累计量 累计额」，昨收在 qt 数组的第 5 位。
const tencentMinutesBody = {
  data: {
    sh000001: {
      data: { data: ["0930 3605.65 6231985 9297140974.10", "0931 3605.70 6235000 9298000000.00"] },
      qt: { sh000001: ["1", "上证指数", "000001", "3605.70", "3600.12"] },
    },
  },
};

const servers: Array<{ close: () => Promise<void> }> = [];
after(async () => {
  await Promise.all(servers.map((server) => server.close()));
});

test("解析东财分时：取收价与分钟量，坏行整页抛错", () => {
  const parsed = parseEastMinutes(eastMinutesBody);
  assert.equal(parsed.preClose, 3600.12);
  assert.deepEqual(parsed.minutes, [
    { time: "09:31", price: 3595.72, volume: 19138274 },
    { time: "09:32", price: 3605.7, volume: 12345678 },
  ]);
  assert.throws(() => parseEastMinutes({ data: { trends: ["garbage"] } }), /bad row/);
  assert.throws(() => parseEastMinutes({ data: {} }), /unexpected response/);
});

test("解析东财日线：高低要夹住开收，坏行整页抛错", () => {
  assert.deepEqual(parseEastDay(eastDayBody), [
    { date: "2026-10-28", open: 3600, close: 3610, high: 3620, low: 3590, volume: 123456789 },
    { date: "2026-10-29", open: 3610, close: 3605, high: 3615, low: 3600, volume: 100000000 },
  ]);
  // 低点高于开收、高点低于开收、收盘为 0，都当坏行。
  const bad = (row: string) => () => parseEastDay({ data: { klines: [row] } });
  assert.throws(bad("2026-10-29,3610.00,3605.00,3615.00,3612.00,100000000,1.00"), /bad bar/);
  assert.throws(bad("2026-10-29,3610.00,3605.00,3601.00,3600.00,100000000,1.00"), /bad bar/);
  assert.throws(bad("2026-10-29,3610.00,0,3615.00,3600.00,100000000,1.00"), /bad bar/);
});

test("解析腾讯分时：累计成交量差分出每分钟的量", () => {
  const parsed = parseTencentMinutes(tencentMinutesBody, "sh000001");
  assert.equal(parsed.preClose, 3600.12);
  assert.deepEqual(parsed.minutes, [
    { time: "09:30", price: 3605.65, volume: 6231985 },
    { time: "09:31", price: 3605.7, volume: 3015 },
  ]);
  assert.throws(() => parseTencentMinutes({ data: { sh000001: { data: { data: ["bad"] } } } }, "sh000001"), /bad row/);
});

test("东财挂了就换腾讯，东财正常就用东财", async () => {
  const dead = await stub(() => new Reply(503, {}));
  const tencent = await stub(() => tencentMinutesBody);
  servers.push(dead, tencent);

  const fallback = await fetchLive("sh000001", "minute", { minute: [dead.url], day: [dead.url], tencent: tencent.url });
  assert.equal(fallback.source, "腾讯证券公开行情接口");
  assert.equal(fallback.name, "上证综指");
  assert.equal(fallback.preClose, 3600.12);
  assert.equal(fallback.quote?.price, 3605.7);
  assert.equal(fallback.quote?.change, 5.58);
  assert.equal(fallback.quote?.high, 3605.7);
  assert.equal(fallback.quote?.low, 3605.65);

  const east = await stub(() => eastMinutesBody);
  servers.push(east);
  const primary = await fetchLive("sh000001", "minute", { minute: [east.url], day: [east.url], tencent: tencent.url });
  assert.equal(primary.source, "东方财富公开行情接口");
  assert.equal(primary.quote?.price, 3605.7);
  assert.equal(primary.minutes.length, 2);
});

test("东财有多个主机：前一个不行就试下一个，都试过没成才用腾讯", async () => {
  const first = await stub((_hit, req) => (new URL(req.url ?? "/", "http://stub").pathname.includes("trends2") ? new Reply(302, {}) : eastMinutesBody));
  const second = await stub(() => eastMinutesBody);
  const tencent = await stub(() => tencentMinutesBody);
  servers.push(first, second, tencent);
  const base = { day: [first.url, second.url], tencent: tencent.url };

  const live = await fetchLive("sh000001", "minute", { minute: [first.url, second.url], ...base });
  assert.equal(live.source, "东方财富公开行情接口");
  assert.equal(first.hits(), 1, "第一个主机只试一次");
  assert.equal(second.hits(), 1);

  const down = await stub(() => new Reply(503, {}));
  servers.push(down);
  const allDead = await fetchLive("sh000001", "minute", { minute: [first, down].map((server) => server.url), ...base });
  assert.equal(allDead.source, "腾讯证券公开行情接口");
});

test("东财的取数参数：分时带 f8 才有昨收，日K不能带 beg（带了 lmt 就失效）", async () => {
  const seen: string[] = [];
  const east = await stub((_hit, req) => {
    seen.push(req.url ?? "");
    return (req.url ?? "").includes("kline") ? eastDayBody : eastMinutesBody;
  });
  servers.push(east);
  const base = { minute: [east.url], day: [east.url], tencent: east.url };

  const minute = await fetchLive("sh000001", "minute", base);
  assert.equal(minute.preClose, 3600.12);
  assert.match(seen[0]!, /fields1=[^&]*f8/);

  await fetchLive("sh000001", "day", base);
  assert.match(seen[1]!, /[?&]lmt=120/);
  assert.doesNotMatch(seen[1]!, /beg=/);
});

test("日K的昨收取前一根收盘，日报价跟着它走", async () => {
  const east = await stub(() => eastDayBody);
  const dead = await stub(() => new Reply(503, {}));
  servers.push(east, dead);

  const live = await fetchLive("sh000001", "day", { minute: [dead.url], day: [east.url], tencent: dead.url });
  assert.equal(live.kind, "day");
  assert.equal(live.preClose, 3610);
  assert.equal(live.quote?.price, 3605);
  assert.equal(live.quote?.change, -5);
  assert.deepEqual(live.bars.map((bar) => bar.date), ["2026-10-28", "2026-10-29"]);
});
