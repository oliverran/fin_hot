// 量化模块的后端插口：选股信号与策略回测两个公开接口，从 /api/quant/ 发出；各配一条给 Agent 的 MCP 工具
// （/api/v1/agent 的地址与 MCP 注册都由 agent.abilities 自动挂上，见 apps/api/src/routes）。
// 选股信号读站外脚本（stock-daily-analyzer）落在 AIHOT_DATA_DIR/quant/daily/analysis.json 的产物；
// 策略回测读同目录下 quant/<配置名>/ 的三件套，页面上可切换配置；两者读不到都回落到离线合成示例
// （backend/demo.ts）。网页只通过 HTTP 读这些接口。
// 后台还有两个管理员接口：/api/admin/quant/status 报告引擎是否就绪、已有快照与最近几次运行；
// /api/admin/quant/run 收下参数、入 quant.run 队列，由 worker 里的子进程跑站外引擎（backend/engine.ts）。
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { enqueueOn } from "@aihot/backend/jobs/queue";
import { defineServerModule } from "@aihot/backend/modules";
import { beijingDate, isValidDate } from "@aihot/contracts/time";
import { backtestData, signalsData } from "./backend/demo.ts";
import { engineInstalled, engineStatus } from "./backend/engine.ts";
import { quantRunQueue, recentRuns } from "./backend/runs.ts";
import { listSnapshots, readBacktest } from "./backend/snapshot.ts";
import { readSignals } from "./backend/daily.ts";
import { backtestMarkdown, signalsMarkdown } from "./backend/agent.ts";
import { PARAM_LIMITS, QUANT_DEFAULTS, type BacktestData, type QuantAdminStatus, type QuantParams, type SignalsData } from "./catalog.ts";

/** 选股信号：读站外产物，读不到回落到示例数据。 */
async function signalsView(): Promise<SignalsData> {
  return (await readSignals()) ?? signalsData();
}

/** 回测：请求的配置（默认按名字排第一的那份），一份产物都没有时回退示例数据。 */
async function backtestView(requested?: string): Promise<BacktestData> {
  const names = await listSnapshots();
  // 只认数据目录里真实存在的配置名，别的（含穿越字符）一律落回默认那一份。
  const active = requested && names.includes(requested) ? requested : names[0];
  const snapshot = active ? await readBacktest(active) : null;
  return snapshot && active ? { ...snapshot, snapshots: names, active } : backtestData();
}

/** 后台配置页的初始值：缺省项照 catalog 里的默认，结束日期补成当天。 */
function defaults(): QuantParams {
  return { ...QUANT_DEFAULTS, end: beijingDate(new Date()) };
}

/** 提交的参数形状；数值上下限与表单同读 catalog 的 PARAM_LIMITS，配置名与日期在这里另做检查。 */
const paramsSchema = z.object({
  mode: z.enum(["daily", "backtest"]),
  name: z.string().trim().max(PARAM_LIMITS.name).default(""),
  universe: z.enum(["main", "all"]),
  maxStocks: z.number().int().min(PARAM_LIMITS.maxStocks.min).max(PARAM_LIMITS.maxStocks.max),
  start: z.string().default(""),
  end: z.string().default(""),
  rebalance: z.enum(["W-FRI", "M", "D"]),
  topK: z.number().int().min(PARAM_LIMITS.topK.min).max(PARAM_LIMITS.topK.max),
  maxWeightPerName: z.number().min(PARAM_LIMITS.maxWeightPerName.min).max(PARAM_LIMITS.maxWeightPerName.max),
  maxDrawdownHalt: z.number().min(PARAM_LIMITS.maxDrawdownHalt.min).max(PARAM_LIMITS.maxDrawdownHalt.max),
  weights: z.object({
    momentum: z.number().min(PARAM_LIMITS.weight.min).max(PARAM_LIMITS.weight.max),
    volatility: z.number().min(PARAM_LIMITS.weight.min).max(PARAM_LIMITS.weight.max),
    rsi: z.number().min(PARAM_LIMITS.weight.min).max(PARAM_LIMITS.weight.max),
    volume_ratio: z.number().min(PARAM_LIMITS.weight.min).max(PARAM_LIMITS.weight.max),
  }),
});

/** 配置名会变成产物目录名，只收不含路径与保留名的普通名字。 */
const NAME = /^[^\s./\\:*?"<>|\x00-\x1f][^/\\:*?"<>|\x00-\x1f]{0,23}$/;
const RESERVED = new Set(["daily", "configs"]);

const badRequest = (detail: string) => Object.assign(new Error(detail), { statusCode: 400 });

function readParams(value: unknown): QuantParams {
  const params = paramsSchema.parse(value ?? {});
  if (params.mode === "daily") return { ...params, name: "" };
  if (!NAME.test(params.name) || RESERVED.has(params.name)) throw badRequest("配置名限 24 字以内，不能用 / \\ : * ? \" < > | 等符号，也不能叫 daily 或 configs");
  if (!isValidDate(params.start)) throw badRequest("起始日期要写成 YYYY-MM-DD");
  if (params.end && !isValidDate(params.end)) throw badRequest("结束日期要写成 YYYY-MM-DD");
  if (params.end && params.start >= params.end) throw badRequest("结束日期要晚于起始日期");
  return params;
}

export default defineServerModule({
  name: "quant",
  http(app: FastifyInstance) {
    app.get("/api/quant/signals", async (_req, reply) => reply.header("Cache-Control", "no-store").send(await signalsView()));
    app.get<{ Querystring: { name?: string } }>("/api/quant/backtest", async (req, reply) =>
      reply.header("Cache-Control", "no-store").send(await backtestView(req.query.name)));
    // 后台配置页读的运行状态：引擎是否就绪、表单默认值、已有快照与最近几次运行。
    app.get("/api/admin/quant/status", adminHandler(async (_req, reply) => {
      const [engine, snapshots, runs] = await Promise.all([engineStatus(), listSnapshots(), recentRuns()]);
      const status: QuantAdminStatus = {
        engine,
        defaults: defaults(),
        snapshots,
        runs: runs.map((run) => ({
          id: run.id,
          status: run.status,
          startedAt: run.started_at.toISOString(),
          finishedAt: run.finished_at?.toISOString() ?? null,
          error: run.error,
          detail: run.detail,
        })),
      };
      return reply.send(status);
    }));
    // 后台提交一次运行：参数校验通过且引擎就绪才入队，失败由 worker 记进 job_runs。
    app.post("/api/admin/quant/run", adminHandler(async (req, reply) => {
      const params = readParams(req.body);
      const engine = await engineStatus();
      if (!engine.ready) throw badRequest(engine.missing ?? "量化引擎还没装好，无法运行");
      const id = await enqueueOn(quantRunQueue, { params });
      return reply.code(202).send({ id });
    }));
  },
  // worker 里跑站外引擎的队列；api 进程只入队。
  queues: [quantRunQueue],
  // 收盘数据就绪后自动跑一次选股扫描，让 /quant/signals 保持当天；回测仍由管理员在后台手动触发。
  // 引擎没装好时（数据卷里没有 finhot_export.py）整条调度与它的执行队列都不注册。
  schedules: [
    {
      name: "quant.scan",
      cron: "10 20 * * 1-5",
      missed: "once",
      when: engineInstalled,
      run: () => enqueueOn(quantRunQueue, { params: { ...defaults(), mode: "daily", name: "" } }),
    },
  ],
  // 让 /admin/runs 的「任务」把它们列出来（按 job_runs 的名字）。
  admin: { currentJobs: async () => ["quant.run"] },

  agent: {
    abilities: [
      {
        path: "/quant/signals",
        title: "量化选股信号",
        ask: "今天的量化选股候选（超卖反弹、趋势向好、放量突破）",
        answer: () => signalsView().then(signalsMarkdown),
        etagPrefix: "quant-signals",
        cacheControl: "no-store",
        mcp: {
          tool: "get_quant_signals",
          use: "for today's quant stock screen",
          description: "Get the site's quant stock screen: candidates from three technical strategies (oversold rebound, trend following, volume breakout) with their trigger indicators and confidence. Use this when the user asks what the quant tool screened today; it is a technical screen, not investment advice.",
          input: z.strictObject({}),
          run: async () => {
            const data = await signalsView();
            return { text: signalsMarkdown(data), structured: { schemaVersion: 1, ...data } };
          },
        },
      },
      {
        path: "/quant/backtest",
        title: "量化策略回测",
        ask: "量化组合的回测结果（净值、年化、夏普、最大回撤与持仓）",
        answer: () => backtestView().then(backtestMarkdown),
        etagPrefix: "quant-backtest",
        cacheControl: "no-store",
        mcp: {
          tool: "get_quant_backtest",
          use: "for the quant portfolio backtest",
          description: "Get a strategy backtest produced by the site's quant tool: the config, return metrics (total return, CAGR, Sharpe, max drawdown, win rate), the normalized equity curve and the latest holdings. Use this when the user asks how the quant rules performed over a past period.",
          input: z.strictObject({
            name: z.string().min(1).max(64).optional().describe("Optional snapshot name to view; omit for the default one. Only names the server lists are valid."),
          }),
          run: async (args) => {
            const data = await backtestView(typeof args.name === "string" ? args.name : undefined);
            return { text: backtestMarkdown(data), structured: { schemaVersion: 1, ...data } };
          },
        },
      },
    ],
  },
});
