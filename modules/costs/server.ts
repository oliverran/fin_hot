// 费用看板模块的后端插口：后台 /api/admin/costs 读出窗口内按渠道与模型的 token 与费用
// （adminHandler 守卫，只有管理员能看）。窗口天数由页面给（days），越界收敛到 1..365。
// 这里还挂了模型费用的告警：昨天一整天估算花超了阈值就通知站长（运维检查每 10 分钟收一次）。
import type { FastifyInstance } from "fastify";
import { defineServerModule } from "@aihot/backend/modules";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import type { Finding } from "@aihot/backend/notify/feishu";
import { ALERTS } from "@aihot/site";
import { addDays, beijingDate } from "@aihot/contracts/time";
import { costsReport } from "./backend/report.ts";

/** 一天（北京时间）估算的模型调用费用超过多少元才告警；设 0 关掉；环境变量优先，读到调用时。 */
const spendThreshold = () => Math.max(0, Number(process.env.ALERT_MODEL_SPEND_CNY || ALERTS.modelSpendCnyPerDay));

/**
 * 昨天一整天的估算模型费用，超过阈值就报一次。用完整的一天而不是“今天到此刻”，免得一天里刚开工就报、
 * 数字还很小；不同日期各成一条，跨天自然结束。钱的事归「today」级，只发给站长。
 */
async function spendFindings(now: number): Promise<Finding[]> {
  const threshold = spendThreshold();
  if (!threshold) return [];
  const day = addDays(beijingDate(new Date(now)), -1);
  const spent = (await costsReport(2, new Date(now))).trend.find((d) => d.day === day);
  if (!spent || spent.cost < threshold) return [];
  return [{
    key: `costs.model.spend.${day}`,
    level: "today",
    title: `${day} 的模型调用费用预计 ¥${spent.cost.toFixed(2)}，超过阈值`,
    impact: "模型调用的花费偏高，账户余额消耗比平时快",
    heals: "不会自己降下来；要查是哪些步骤花得多",
    action: "看后台「费用看板」，按渠道和模型看谁花得多，再决定降频、换更便宜的模型或收紧额度",
    detail: `当天 ${spent.calls} 次调用、失败 ${spent.failed} 次，估算 ¥${spent.cost.toFixed(2)}，阈值 ¥${threshold}`,
  }];
}

export default defineServerModule({
  name: "costs",
  http(app: FastifyInstance) {
    app.get("/api/admin/costs", adminHandler(async (req, reply) => {
      const days = Math.floor(Number((req.query as { days?: string }).days));
      return reply.send(await costsReport(Number.isFinite(days) ? days : 14));
    }));
  },
  alerts: spendFindings,
});
