// 指标监控模块的后端插口。
// 1) 公开页把匿名的页面浏览与关键入口点击 POST 到 /api/analytics/collect，进程内按客户端限流；
// 2) 后台 /api/admin/analytics 读出趋势与排行（adminHandler 守卫，只有管理员能看），
//    连同本进程的资源占用、接口耗时与错误率、模型调用、队列与采集；
// 3) 每分钟采一次进程资源，并把这一分钟的接口累计落库；
// 4) 每天把最近几天的明细重算进每日汇总，并清理超过保留期的明细（retention）。
import type { FastifyInstance } from "fastify";
import { defineServerModule } from "@aihot/backend/modules";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { readEvent, recordEvent } from "./backend/collect.ts";
import { flushHttp, noteHttp, UNMATCHED } from "./backend/http.ts";
import { sampleProcess, SAMPLE_MS } from "./backend/ops.ts";
import { analyticsReport, analyticsRetention } from "./backend/report.ts";

/** 每个客户端每分钟最多上报几次（ANALYTICS_RATE_LIMIT，默认 120）；0 交给前面的反向代理限流。 */
function rateLimit(): number {
  return Math.max(0, Math.floor(Number(process.env.ANALYTICS_RATE_LIMIT) || 120));
}

const windows = new Map<string, number[]>();
function limited(key: string, perMinute: number): boolean {
  const now = Date.now();
  const list = (windows.get(key) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) return true;
  list.push(now);
  windows.set(key, list);
  return false;
}

export default defineServerModule({
  name: "analytics",
  http(app: FastifyInstance) {
    // 匿名上报：只收随机访客号，不含 IP、账号或用户代理；不认得的上报整个丢掉，也不给前端报错。
    app.post("/api/analytics/collect", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const limit = rateLimit();
      if (limit > 0 && limited(`collect:${req.ip}`, limit)) return reply.code(429).header("Retry-After", "60").send({ ok: false });
      const event = readEvent(req.body);
      if (event) await recordEvent(event);
      return reply.code(204).send();
    });
    // 后台读取：窗口天数由页面给（days），越界收敛到 1..365。
    app.get("/api/admin/analytics", adminHandler(async (req, reply) => {
      const days = Math.floor(Number((req.query as { days?: string }).days));
      return reply.send(await analyticsReport(Number.isFinite(days) ? days : 30));
    }));
    // 每分钟采一次进程资源（让事件循环延迟的间隔稳定），并把这一分钟的接口累计落库；进程重启最多丢最后一分钟。
    const timer = setInterval(() => {
      sampleProcess();
      flushHttp().catch((err) => app.log.warn({ err }, "analytics: 接口指标落库失败"));
    }, SAMPLE_MS);
    timer.unref();
    app.addHook("onClose", async () => clearInterval(timer));
  },
  on: {
    // 只按路由器匹配到的路由模式聚合（未匹配的地址由访客给，不能当行键）；不 await，也不抛错。
    requestAnswered: (_req, reply, _path) => noteHttp(reply.routeOptions?.url ?? UNMATCHED, reply.statusCode, Math.round(reply.elapsedTime)),
  },
  retention: (now) => analyticsRetention(now),
});
