// 机会模块的后端插口。
// 1) 读者页从 /api/opportunities 读当天与最近 7 天的机会；
// 2) 后台 /api/admin/opportunities 查看最近结果，POST /api/admin/opportunities/run 手动重跑
//    （adminHandler 守卫，只有管理员能看能跑，CSRF 与幂等键由前端的 useAdminAction 带上）；
// 3) 交易日收盘后（16:30）跑一次生成（schedules），当天已生成就跳过；
// 4) 每天清理超过保留期的结果（retention）。
import type { FastifyInstance } from "fastify";
import { defineServerModule } from "@aihot/backend/modules";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { generateOpportunities, opportunityAdmin, opportunitiesRetention, recentOpportunities } from "./backend/opportunities.ts";

export default defineServerModule({
  name: "opportunities",
  // 这一步的默认模型来自 site/models.ts 的 DEFAULTS.opportunity，可用 OPPORTUNITY_MODEL 或后台改选。
  models: {
    opportunity: { label: "投资机会（结合行情背景与已发布新闻，挑出值得观察的机会与标的）", env: "OPPORTUNITY_MODEL", purposes: ["opportunity"] },
  },
  http(app: FastifyInstance) {
    // 公开读取：窗口天数由页面给（days），越界收敛到 1..90，默认最近 7 天。
    app.get("/api/opportunities", async (req, reply) => {
      const days = Math.floor(Number((req.query as { days?: string }).days));
      return reply.header("Cache-Control", "no-store").send(await recentOpportunities(Number.isFinite(days) ? days : 7));
    });
    app.get("/api/admin/opportunities", adminHandler(async (req, reply) => {
      const days = Math.floor(Number((req.query as { days?: string }).days));
      return reply.send(await opportunityAdmin(Number.isFinite(days) ? days : 7));
    }));
    // 手动重跑：换掉当天已有的结果（generateOpportunities 的 reason 会换一笔新的模型调用）。
    app.post("/api/admin/opportunities/run", adminHandler(async (_req, reply) => {
      return reply.send(await generateOpportunities("admin"));
    }));
  },
  schedules: [
    {
      name: "opportunities.daily",
      // A 股收盘后（北京时间 16:30）的工作日跑一次；当天已生成就跳过。
      cron: "30 16 * * 1-5",
      missed: "once",
      when: () => process.env.MODEL_CALLS_ENABLED === "true",
      run: () => generateOpportunities(),
    },
  ],
  retention: (now) => opportunitiesRetention(now),
});
