// 站外量化引擎的调用层：把表单参数写成引擎认得的实验配置，再用子进程跑 finhot_export.py，
// 产物落到共享数据目录（AIHOT_DATA_DIR 的 quant/）。引擎（Python + akshare + stock-daily-analyzer）
// 不随镜像发布，用 QUANT_ENGINE_DIR 指到它所在的目录；没装好时接口明确说不具备条件，不假装能跑。
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@aihot/backend/config";
import { beijingDate } from "@aihot/contracts/time";
import { MAIN_BOARD_PREFIX, type QuantParams } from "../catalog.ts";

/** 引擎目录：里面要有 finhot_export.py 与 stock-daily-analyzer 的工具代码。 */
export const engineDir = () => process.env.QUANT_ENGINE_DIR || path.join(config.dataDir, "quant-engine");

/** 跑引擎用的解释器。 */
export const pythonBin = () => process.env.QUANT_PYTHON || "python3";

/** 引擎的入口脚本。 */
export const exportScript = () => path.join(engineDir(), "finhot_export.py");

/** 每次提交写下的实验配置；放在数据目录里，不写进引擎目录。 */
export const configDir = () => path.join(config.dataDir, "quant", "configs");

/** 一次运行最久等多久：拉几百只股票的前复权日线，跑回测通常几分钟。 */
const RUN_TIMEOUT_MS = 30 * 60_000;

/** 单只股票回看的交易日，与引擎的因子层口径一致。 */
const LOOKBACK_DAYS = 20;

const exists = (file: string) => access(file).then(() => true, () => false);

/** 引擎是否装好：同步判断，供调度器在 worker 启动时决定要不要注册夜间扫描。 */
export const engineInstalled = () => existsSync(exportScript());

export interface EngineStatus {
  /** 目录与脚本都在，才谈得上运行；解释器能否加载依赖由运行时反馈。 */
  ready: boolean;
  dir: string;
  python: string;
  script: string;
  /** ready 为 false 时缺的是什么，直接给管理员看。 */
  missing?: string;
}

export async function engineStatus(): Promise<EngineStatus> {
  const info = { dir: engineDir(), python: pythonBin(), script: exportScript() };
  if (await exists(info.script)) return { ...info, ready: true };
  return { ...info, ready: false, missing: `引擎脚本不在：${info.script}。把 stock-daily-analyzer 装到这一目录，或用 QUANT_ENGINE_DIR 指到它所在的位置。` };
}

/** 表单参数 → 引擎的实验配置；回测区间与因子权重照表单，其余沿用引擎的默认口径。 */
export function experimentJson(params: QuantParams) {
  const main = params.universe === "main";
  return {
    name: params.name,
    market: "A股",
    frequency: "日频",
    seed: 42,
    universe: {
      include_prefix: main ? MAIN_BOARD_PREFIX : null,
      exclude_prefix: main ? ["300", "301"] : [],
      exclude_st: true,
      max_stocks: params.maxStocks,
    },
    data: { provider: "akshare", cache_dir: "data/cache_prices", timeout_seconds: 10 },
    factors: { lookback_days: LOOKBACK_DAYS, weights: params.weights },
    portfolio: { top_k: params.topK, max_weight_per_name: params.maxWeightPerName },
    risk: { max_drawdown_halt: params.maxDrawdownHalt > 0 ? params.maxDrawdownHalt : null },
    trading: { t_plus_one: true, limit_up: 0.099, limit_down: -0.099, stamp_duty_bps: 10.0, allow_buy_limit_up: false, allow_sell_limit_down: false },
    backtest: {
      start: params.start,
      end: params.end || beijingDate(new Date()),
      rebalance: params.rebalance,
      commission_bps: 1.0,
      slippage_bps: 2.0,
      initial_cash: 1_000_000.0,
    },
  };
}

/** 把一次提交的参数写成实验配置，返回文件路径（引擎的 --config 用绝对路径）。 */
export async function writeExperiment(params: QuantParams): Promise<string> {
  const file = path.join(configDir(), `${params.name}.json`);
  await mkdir(configDir(), { recursive: true });
  await writeFile(file, `${JSON.stringify(experimentJson(params), null, 2)}\n`, "utf8");
  return file;
}

/**
 * 跑一次 finhot_export.py，把它的输出汇总成一段文字（只看尾部）。超时或非零退出都抛错，
 * 错误连同尾部输出会记进这次运行，管理员在后台看得到。
 */
export async function runExport(args: string[], timeoutMs = RUN_TIMEOUT_MS): Promise<string> {
  const child = spawn(pythonBin(), [exportScript(), ...args], { cwd: engineDir() });
  let out = "";
  const collect = (chunk: Buffer) => { out = (out + chunk.toString()).slice(-100_000); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (timedOut) throw new Error(`引擎运行超过 ${Math.round(timeoutMs / 60_000)} 分钟，已终止`);
    if (code !== 0) throw new Error(`引擎以退出码 ${code} 结束：${out.trim().slice(-1500)}`);
    return out;
  } finally {
    clearTimeout(timer);
  }
}
