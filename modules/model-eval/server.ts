// 评测前沿模块的后端插口：后台 /api/admin/model-eval 读最近的 SelectBench 对比运行，
// 给每个模型算出质量指标、每条样本的估算成本与平均延迟，供帕累托前沿图使用
//（adminHandler 守卫，只有管理员能看）。要看哪一次由页面给（run），缺省取最新一次。
import type { FastifyInstance } from "fastify";
import { defineServerModule } from "@aihot/backend/modules";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { modelEval } from "./backend/pareto.ts";

export default defineServerModule({
  name: "model-eval",
  http(app: FastifyInstance) {
    app.get("/api/admin/model-eval", adminHandler(async (req, reply) => {
      const run = (req.query as { run?: string }).run;
      return reply.send(await modelEval(run));
    }));
  },
});
