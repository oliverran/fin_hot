// 量化引擎的模块队列与运行记录：后台提交一次运行 → 队列任务（worker）→ 子进程跑引擎 → 写 job_runs。
// 不自动重试：一次回测要拉几百只股票的行情，重试只是重复等待与限流；失败由管理员在后台手动重跑。
import { sql } from "@aihot/backend/db";
import { recordRun } from "@aihot/backend/jobs/queue";
import { config } from "@aihot/backend/config";
import { defineQueue } from "@aihot/backend/modules";
import type { QuantParams } from "../catalog.ts";
import { runExport, writeExperiment } from "./engine.ts";

export interface QuantJob {
  params: QuantParams;
}

/** 日志尾部几行：够看清跑到哪一步、报了什么，又不至于把整段输出塞进运行记录。 */
const tail = (text: string) => text.trim().split("\n").slice(-12).join("\n").slice(-1200);

async function execute(params: QuantParams): Promise<Record<string, unknown>> {
  if (params.mode === "daily") {
    const output = await runExport(["daily", "--data-dir", config.dataDir, "--max-stocks", String(params.maxStocks)]);
    return { mode: "daily", maxStocks: params.maxStocks, output: tail(output) };
  }
  const file = await writeExperiment(params);
  const output = await runExport(["backtest", "--data-dir", config.dataDir, "--config", file]);
  return { mode: "backtest", name: params.name, output: tail(output) };
}

export const quantRunQueue = defineQueue<QuantJob>({
  name: "quant.run",
  // 一次运行可能十几分钟：给足时限；不重试，失败留下记录由人重跑。
  options: { policy: "short", retryLimit: 0, expireInSeconds: 3600 },
  worker: { batchSize: 1 },
  run: async (jobs) => {
    for (const job of jobs) await recordRun("quant.run", () => execute(job.params));
  },
});

/** 最近几次量化运行（job_runs 里名为 quant.run 的行），给后台配置页看。 */
export async function recentRuns(limit = 8) {
  return sql<{ id: number; status: string; started_at: Date; finished_at: Date | null; error: string | null; detail: unknown }[]>`
    SELECT id, status, started_at, finished_at, left(error, 300) AS error, detail FROM job_runs
    WHERE job = 'quant.run' ORDER BY id DESC LIMIT ${limit}`;
}
