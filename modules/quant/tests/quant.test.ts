// 量化模块：选股信号与策略回测两个接口的对外行为与数据口径，以及后台手动运行的两个管理员接口。
// 两个公开接口都优先读站外产物（backend/daily.ts 读 quant/daily/analysis.json，backend/snapshot.ts 读
// quant/<配置名>/ 的三件套），读不到回落到离线合成示例；几条路径都在这里守着。
// 后台接口不跑引擎：这一层只管校验参数与引擎是否就绪，真正的子进程在 worker 里（backend/runs.ts）。
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { buildApp } from "../../../apps/api/src/app.ts";
import { config } from "@aihot/backend/config";
import { closeDb } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { mcpToolName } from "@aihot/contracts/mcp";
import { beijingDate } from "@aihot/contracts/time";
import { QUANT_DEFAULTS, QUANT_SOURCE, STRATEGIES, type BacktestData, type QuantAdminStatus, type SignalsData } from "../catalog.ts";
import quant from "../server.ts";

// 引擎的两个接口由这个模块注册，先把它装上再建 app（进程入口平时做的事）。
installModules([quant]);
const app = await buildApp();

// 测试给的数据目录是空的（tests/databases.ts），所以两个接口默认都走示例数据这条路径。
const quantDir = path.join(config.dataDir, "quant");
const dailyDir = path.join(quantDir, "daily");

// 后台接口报告引擎是否就绪：把引擎目录指到一份一定不存在的路径，免得本机装了引擎就测不出「未就绪」。
const savedEngineDir = process.env.QUANT_ENGINE_DIR;
process.env.QUANT_ENGINE_DIR = path.join(config.dataDir, "no-engine");

after(async () => {
  if (savedEngineDir === undefined) delete process.env.QUANT_ENGINE_DIR;
  else process.env.QUANT_ENGINE_DIR = savedEngineDir;
  await app.close();
  installModules([]);
  await closeDb();
});

async function get<T>(url: string): Promise<T> {
  const res = await app.inject({ method: "GET", url });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "no-store");
  return res.json() as T;
}

/** 照 stock-daily-analyzer 的产物格式写一套回测快照：金额净值、权重制持仓、代码带交易所后缀。 */
function writeSnapshot(name: string) {
  const dir = path.join(quantDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "summary.json"), JSON.stringify({
    demo: false,
    data_source: "yfinance",
    symbols: ["600519.SS", "000858.SZ"],
    config: { start: "2024-01-02", end: "2024-03-25", rebalance: "W-FRI" },
    metrics: { total_return: 0.05, cagr: 0.12, sharpe: 1.5, max_drawdown: -0.0198 },
  }));
  writeFileSync(path.join(dir, "equity.csv"), [
    "Date,equity",
    "2024-01-02,100000.0",
    "2024-01-03,101000.0",
    "2024-01-04,99000.0",
    "2024-02-01,102000.0",
    "2024-03-25,105000.0",
  ].join("\n"));
  writeFileSync(path.join(dir, "holdings.csv"), [
    "Date,__CASH__,600519.SS,000858.SZ,999999.SZ",
    "2024-01-02,1.0,0.0,0.0,0.0",
    "2024-03-25,0.0,0.3,0.7,0.0",
  ].join("\n"));
}

test("选股信号：没有产物时回落示例数据，按三个策略分组、逐条候选可复现", async () => {
  const first = await get<SignalsData>("/api/quant/signals");
  const second = await get<SignalsData>("/api/quant/signals");
  assert.deepEqual(first, second); // 离线合成数据是确定性的
  assert.equal(first.source, QUANT_SOURCE);
  assert.match(first.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(first.universe > 0);
  // 分组顺序与 catalog.ts 里的策略定义一致
  assert.deepEqual(first.strategies.map((s) => s.key), STRATEGIES.map((s) => s.key));
  for (const strategy of first.strategies) {
    assert.ok(strategy.picks.length > 0, `${strategy.key} 没有候选`);
    for (const pick of strategy.picks) {
      assert.match(pick.ticker, /^\d{6}$/);
      assert.ok(pick.name.length > 0 && pick.sector.length > 0);
      assert.equal(pick.date, first.asOf); // 候选都是截至这一天的
      assert.equal(pick.recommendationType, strategy.key);
      assert.ok(pick.confidence >= 0 && pick.confidence <= 100);
      assert.ok(pick.reasoning.includes(pick.name)); // 理由点名了这只股票
    }
  }
});

test("选股信号：读到 run-daily 产物时按产物口径出数，置信度三档折成分值", async () => {
  // 照 analysis.json 的格式写一份：confidence 是「高/中/低」，macd_signal 是 bullish/bearish。
  mkdirSync(dailyDir, { recursive: true });
  writeFileSync(path.join(dailyDir, "analysis.json"), JSON.stringify({
    demo: false,
    data_source: "tushare",
    report_date: "2024-05-20",
    symbols: ["600519.SS", "000858.SZ", "600036.SS"],
    summary: { total_scanned: 3 },
    formatted_recommendations: [
      {
        date: "2024-05-20", ticker: "600519.SS", name: "贵州茅台", sector: "白酒", recommendation_type: "超卖反弹",
        price: 1700.5, rsi: 41.2, macd_signal: "bullish", volume_ratio: 1.6, confidence: "高", reasoning: "RSI=41 进入超卖区; MACD 金叉",
      },
      {
        date: "2024-05-20", ticker: "000858.SZ", name: "五粮液", sector: "白酒", recommendation_type: "趋势向好",
        price: 150.2, rsi: 58, macd_signal: "bearish", volume_ratio: 1.1, confidence: "低", reasoning: "均线多头但动能转弱",
      },
    ],
  }));

  try {
    const data = await get<SignalsData>("/api/quant/signals");
    assert.equal(data.source, "tushare");
    assert.equal(data.asOf, "2024-05-20");
    assert.equal(data.universe, 3);
    // 分组仍与 catalog.ts 一致，没有候选的策略留在页面上（空列表），顺序不变
    assert.deepEqual(data.strategies.map((s) => s.key), STRATEGIES.map((s) => s.key));
    assert.deepEqual(data.strategies.find((s) => s.key === "超卖反弹")!.picks, [{
      date: "2024-05-20", ticker: "600519", name: "贵州茅台", sector: "白酒",
      recommendationType: "超卖反弹", price: 1700.5, rsi: 41.2,
      macdSignal: "多头", volumeRatio: 1.6, confidence: 85, reasoning: "RSI=41 进入超卖区; MACD 金叉",
    }]);
    assert.equal(data.strategies.find((s) => s.key === "趋势向好")!.picks[0]!.confidence, 45);
    assert.equal(data.strategies.find((s) => s.key === "放量突破")!.picks.length, 0);
  } finally {
    rmSync(dailyDir, { recursive: true, force: true });
  }
});

test("策略回测：没有站外产物时回落到示例数据，指标与净值口径自洽", async () => {
  const data = await get<BacktestData>("/api/quant/backtest");
  assert.equal(data.source, QUANT_SOURCE);
  assert.ok(data.equity.length > 1);
  assert.equal(data.equity[0]!.equity, 1);
  for (let i = 1; i < data.equity.length; i++) {
    assert.ok(data.equity[i]!.date > data.equity[i - 1]!.date, "净值日期必须递增");
    assert.ok(data.equity[i]!.equity > 0);
  }
  assert.equal(data.config.start, data.equity[0]!.date);
  assert.equal(data.config.end, data.equity.at(-1)!.date);
  // 只有回退示例这一条配置，页面上不出现切换
  assert.deepEqual(data.snapshots, [data.config.name]);
  assert.equal(data.active, data.config.name);
  // 累计收益就是首末净值之比
  const expected = data.equity.at(-1)!.equity / data.equity[0]!.equity - 1;
  assert.ok(Math.abs(data.metrics.totalReturn - expected) < 1e-4);
  assert.ok(data.metrics.maxDrawdown <= 0);
  assert.ok(data.metrics.winRate >= 0 && data.metrics.winRate <= 1);
  // 持仓权重递减，合计为 1
  const total = data.holdings.reduce((sum, holding) => sum + holding.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-3, `持仓权重合计 ${total}`);
  for (let i = 1; i < data.holdings.length; i++) assert.ok(data.holdings[i]!.weight < data.holdings[i - 1]!.weight);
});

test("策略回测：读到站外产物时按产物口径出数，净值归一化到 1.00", async () => {
  writeSnapshot("配置A");
  try {
    const data = await get<BacktestData>("/api/quant/backtest");
    // 配置名就是数据目录名，来源直接照产物
    assert.equal(data.config.name, "配置A");
    assert.deepEqual(data.snapshots, ["配置A"]);
    assert.equal(data.active, "配置A");
    assert.equal(data.source, "yfinance");
    assert.equal(data.config.start, "2024-01-02");
    assert.equal(data.config.end, "2024-03-25");
    assert.equal(data.config.rebalance, "每周五收盘调仓");
    assert.equal(data.config.universe, "回测股票池 2 只");
    // 金额净值归一化到 1.00 起点，末值就是 1 + 累计收益
    assert.equal(data.equity.length, 5);
    assert.equal(data.equity[0]!.equity, 1);
    assert.equal(data.equity.at(-1)!.equity, 1.05);
    assert.equal(data.metrics.totalReturn, 0.05);
    assert.equal(data.metrics.cagr, 0.12);
    assert.equal(data.metrics.sharpe, 1.5);
    assert.equal(data.metrics.maxDrawdown, -0.0198);
    assert.equal(data.metrics.winRate, 0.75); // 4 个日收益里 3 个为正
    // 持仓取最后一行、去掉现金与零权重，按权重从大到小；带后缀的代码补成 6 位并配上名称
    assert.deepEqual(data.holdings, [
      { ticker: "000858", name: "五粮液", sector: "白酒", weight: 0.7 },
      { ticker: "600519", name: "贵州茅台", sector: "白酒", weight: 0.3 },
    ]);
  } finally {
    rmSync(quantDir, { recursive: true, force: true });
  }
});

test("策略回测：多份快照按名字列出，?name= 取指定的那一份，认不得的名字落回默认", async () => {
  writeSnapshot("配置A");
  writeSnapshot("配置B");
  try {
    const first = await get<BacktestData>("/api/quant/backtest");
    assert.deepEqual(first.snapshots, ["配置A", "配置B"]);
    assert.equal(first.active, "配置A"); // 默认按名字排第一的那份
    const second = await get<BacktestData>(`/api/quant/backtest?name=${encodeURIComponent("配置B")}`);
    assert.equal(second.active, "配置B");
    assert.equal(second.config.name, "配置B");
    assert.deepEqual(second.snapshots, ["配置A", "配置B"]);
    // 不在列表里的名字（含穿越字符）不认，落回默认那一份
    const unknown = await get<BacktestData>(`/api/quant/backtest?name=${encodeURIComponent("../daily")}`);
    assert.equal(unknown.active, "配置A");
  } finally {
    rmSync(quantDir, { recursive: true, force: true });
  }
});

test("后台量化接口只对管理员开放：未登录 401，写入要 CSRF，引擎没装好时明确拒绝运行", async () => {
  // 测试默认没有开发免登录管理员，先看未登录这一条。
  assert.equal((await app.inject({ url: "/api/admin/quant/status" })).statusCode, 401);
  config.devAdmin = { displayName: "quant-test" };
  try {
    const status = await app.inject({ url: "/api/admin/quant/status" });
    assert.equal(status.statusCode, 200);
    assert.equal(status.headers["cache-control"], "no-store");
    const body = status.json() as QuantAdminStatus;
    // 表单初始值就是 catalog 的默认，结束日期补成当天
    assert.deepEqual(body.defaults, { ...QUANT_DEFAULTS, end: beijingDate(new Date()) });
    // 引擎目录指到了不存在的路径，就绪状态与原因都要说清楚
    assert.equal(body.engine.ready, false);
    assert.ok(body.engine.missing && body.engine.missing.length > 0);
    // 写入必须带 CSRF：不带一律 403
    assert.equal((await app.inject({ method: "POST", url: "/api/admin/quant/run", payload: QUANT_DEFAULTS })).statusCode, 403);
    // 引擎没装好时不入队，直接 400 并说清缺的是什么
    const run = await app.inject({ method: "POST", url: "/api/admin/quant/run", headers: { "x-csrf-token": "dev" }, payload: QUANT_DEFAULTS });
    assert.equal(run.statusCode, 400);
    assert.match((run.json() as { detail: string }).detail, /引擎/);
  } finally {
    config.devAdmin = null;
  }
});

test("后台提交的参数先校验：非法配置名、保留名、区间颠倒、越界只数都拒绝", async () => {
  config.devAdmin = { displayName: "quant-test" };
  try {
    const post = (payload: Record<string, unknown>) => app.inject({ method: "POST", url: "/api/admin/quant/run", headers: { "x-csrf-token": "dev" }, payload });
    assert.equal((await post({ ...QUANT_DEFAULTS, name: "a/b" })).statusCode, 400, "配置名不能含路径分隔符");
    assert.equal((await post({ ...QUANT_DEFAULTS, name: "daily" })).statusCode, 400, "daily 是保留的产物目录名");
    assert.equal((await post({ ...QUANT_DEFAULTS, start: "2024-05-02", end: "2024-05-01" })).statusCode, 400, "结束要晚于起始");
    assert.equal((await post({ ...QUANT_DEFAULTS, maxStocks: 5 })).statusCode, 400, "只数低于下限");
  } finally {
    config.devAdmin = null;
  }
});

test("量化模块把两个工具挂到 MCP 上，答案与页面同源", async () => {
  const rpc = (mcpMethod: string, payload: Record<string, unknown>, name?: string) => app.inject({
    method: "POST", url: "/api/mcp",
    headers: {
      host: "localhost", "content-type": "application/json", accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28", "mcp-method": mcpMethod,
      ...(name ? { "mcp-name": name } : {}),
    },
    payload,
  });
  const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} };
  const list = await rpc("tools/list", { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta } });
  assert.equal(list.statusCode, 200, list.body);
  assert.ok(list.body.includes(mcpToolName("get_quant_signals")), list.body); // site 前缀由 mcpToolName 加
  assert.ok(list.body.includes(mcpToolName("get_quant_backtest")), list.body);

  // 工具名同 mcpToolName；答案与选股信号页同源（这里是回退示例的那一份）
  const call = await rpc("tools/call", {
    jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: mcpToolName("get_quant_signals"), arguments: {}, _meta: meta },
  }, mcpToolName("get_quant_signals"));
  assert.equal(call.statusCode, 200, call.body);
  assert.ok(call.body.includes("选股信号"), call.body);
  assert.ok(call.body.includes(STRATEGIES[0]!.label), call.body);
});
