// 费用看板模块的后端插口：后台 /api/admin/costs 读出窗口内按渠道与模型的 token 与费用
// （adminHandler 守卫，只有管理员能看）。窗口天数由页面给（days），越界收敛到 1..365。
import type { FastifyInstance } from "fastify";
import { defineServerModule } from "@aihot/backend/modules";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { costsReport } from "./backend/report.ts";

export default defineServerModule({
  name: "costs",
  http(app: FastifyInstance) {
    app.get("/api/admin/costs", adminHandler(async (req, reply) => {
      const days = Math.floor(Number((req.query as { days?: string }).days));
      return reply.send(await costsReport(Number.isFinite(days) ? days : 14));
    }));
  },
});
