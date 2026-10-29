// 编年史模块的后端插口。
// 1) 图表数据从 /api/chronicle/ 发出去：接上真实行情的图从库里现算，其余发随包的静态文件；
// 2) 交易日收盘后刷新一次指数日线（schedules）；
// 3) 给主题页提供「相关知识」那一块：点名的行业或指数跳到编年史对应的图表。
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { sendFile } from "@aihot/api/routes/static";
import { defineServerModule } from "@aihot/backend/modules";
import { LIVE_CHARTS, LIVE_SOURCE, GROUPS, liveChart, pageOf } from "./catalog.ts";
import { liveChartJson } from "./backend/charts.ts";
import { quotesFetchedAt, refreshQuotes } from "./backend/quotes.ts";
// 主题 → 图表的对应表在 topic-map.ts，网页侧也读它（借类型）。
import { chronicleForTopic } from "./topic-map.ts";

/** 随包的示例文件是不变的，缓存一天；实时图一天变一次，缓存一刻钟就够。 */
const DATA = path.join(import.meta.dirname, "data");
const CACHE = "public, max-age=86400, stale-while-revalidate=604800";
const LIVE_CACHE = "public, max-age=900, stale-while-revalidate=86400";

export default defineServerModule({
  name: "chronicle",
  http(app: FastifyInstance) {
    // 版本、行情最后的写入时间与三组地址；行情还没抓到时 lastUpdated 是 null。
    app.get("/api/chronicle/_manifest.json", async (req, reply) => {
      const manifest = {
        name: "chronicle",
        source: LIVE_SOURCE,
        lastUpdated: await quotesFetchedAt(),
        endpoints: Object.fromEntries(GROUPS.map((group) => [group.key, `/api/chronicle/${group.key}/`])),
        live: LIVE_CHARTS.map((chart) => `${chart.group}/${chart.slug}`),
      };
      return reply.header("cache-control", LIVE_CACHE).type("application/json; charset=utf-8").send(manifest);
    });

    // 分组与 slug 先在目录里校验，再读数据：不认得的地址是 404，也挡住了路径穿越。
    app.get("/api/chronicle/:group/:file", async (req, reply) => {
      const { group, file } = req.params as { group: string; file: string };
      if (!file.endsWith(".json")) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
      const slug = file.slice(0, -".json".length);
      if (!pageOf(group, slug)) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
      const chart = liveChart(group, slug);
      // 库里还没有这只指数的日线时（第一次刷新还没跑）退回随包的示例文件。
      const live = chart ? await liveChartJson(chart) : null;
      if (live) return reply.header("cache-control", LIVE_CACHE).type("application/json; charset=utf-8").send(live);
      return sendFile(req, reply, path.join(DATA, group, `${slug}.json`), { cacheControl: CACHE });
    });
  },
  // 交易日收盘后刷新：把当天的日线写进 chronicle_quotes，页面上的图第二天就是新的。
  schedules: [
    {
      name: "chronicle.quotes",
      cron: "40 15 * * 1-5",
      missed: "once",
      when: () => process.env.COLLECT_ENABLED === "true",
      run: () => refreshQuotes(),
    },
  ],
  // 这一块只讲“这个主题该看哪几张图”，与主题下的条目无关，所以 recheck 是空的。
  topics: {
    page: {
      read: (ask) => {
        const part = chronicleForTopic(ask.topic.slug);
        return part ? { recheck: [], part: () => part } : null;
      },
    },
  },
});
