// 编年史模块的后端插口。
// 1) 图表数据从 /api/chronicle/ 发出去：接上真实行情的图从库里现算，其余发随包的静态文件；
// 2) 交易日收盘后刷新一次指数日线（schedules）；
// 3) 给主题页提供「相关知识」那一块：点名的行业或指数跳到编年史对应的图表。
import path from "node:path";
import { findCompanies, refreshCompanies } from "./backend/companies.ts";
import { dataOverview } from "./backend/data-overview.ts";
import { readMarket, refreshMarket } from "./backend/market.ts";
import { readFundSummary, refreshFunds } from "./backend/funds.ts";
import { readProvider, refreshProvider } from "./backend/provider.ts";
import { compareBars } from "./backend/compare.ts";
import { loadLive, type LiveKind } from "./backend/live.ts";
import { loadBars } from "./backend/quotes.ts";
import { chronicleNews } from "@aihot/backend/publication/chronicle";
import { REPO_ROOT } from "@aihot/backend/config";
import { sendFile } from "@aihot/api/routes/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { readFile, stat } from "node:fs/promises";
import { defineServerModule } from "@aihot/backend/modules";
import { LIVE_CHARTS, LIVE_INDICES, LIVE_SOURCE, GROUPS, liveChart, pageOf, type LiveIndex } from "./catalog.ts";
import { liveChartJson } from "./backend/charts.ts";
import { quotesFetchedAt, refreshQuotes } from "./backend/quotes.ts";
// 主题 → 图表的对应表在 topic-map.ts，网页侧也读它（借类型）。
import { chronicleForTopic } from "./topic-map.ts";

/** 随包的示例文件是不变的，缓存一天；实时图一天变一次，缓存一刻钟就够。 */
const DATA = path.join(import.meta.dirname, "data");
const CACHE = "public, max-age=86400, stale-while-revalidate=604800";
const LIVE_CACHE = "public, max-age=900, stale-while-revalidate=86400";

// 美股编年史：整个子应用（historyofmarket）的前端产物与数据集随仓库提交，挂在这个前缀下整站发出。
// 数据集与字体换版就换内容，与入口解耦，可以放长缓存；脚本与样式为了对上源码里的 import()
// 而不带内容哈希（见 web/vite.config.js），改版后旧分包会跟新的 index.html 错配，所以每次都让
// 浏览器带 ETag 回来核对——命中时 api 从内存里直接答 304，代价很小。
const US_WEB = path.join(REPO_ROOT, "historyofmarket/web/dist");
const US_DATA = path.join(REPO_ROOT, "historyofmarket/server/cache");
const US_CACHE = "public, max-age=3600, stale-while-revalidate=86400";
const US_STABLE = /\.(?:json|woff2|webmanifest|ico|png|jpe?g|svg|webp)$/;
/** 子应用里引擎的静态表不含这几类，缺了它们浏览器会按 MIME 拒收脚本与样式。 */
const US_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

/** 把请求路径接到一个目录下；越出目录（../）返回 null。 */
function under(base: string, rel: string): string | null {
  const target = path.resolve(base, rel.replace(/^\/+/, ""));
  return target === base || target.startsWith(base + path.sep) ? target : null;
}

const isFile = (file: string) => stat(file).then((s) => s.isFile(), () => false);

/** 发子应用的一个文件：越界或不存在都是 404（sendFile 自己按扩展名与 ETag 处理）。 */
function sendUs(req: FastifyRequest, reply: FastifyReply, base: string, rel: string) {
  const file = under(base, rel);
  if (!file) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
  return sendFile(req, reply, file, { type: US_TYPES[path.extname(file)], cacheControl: US_STABLE.test(file) ? US_CACHE : "no-cache" });
}

export default defineServerModule({
  name: "chronicle",
  admin: { runs: dataOverview },
  http(app: FastifyInstance) {
    // 美股编年史子应用：/us-market/ 下整站发出（前端产物 + 数据集）。地址与网页侧一致，见 module.ts 的 apiPaths。
    // 不带尾斜杠的根地址不是站内链接，当来访是手输，转去中文首页。
    app.get("/us-market", (_req, reply) => reply.redirect("/us-market/zh-cn/", 302));
    // 数据集：/us-market/api/<…> → historyofmarket/server/cache/api/<…>（117 个随包的 JSON）。
    app.get("/us-market/api/*", (req, reply) => {
      const rest = (req.params as { "*": string })["*"];
      return sendUs(req, reply, US_DATA, path.join("api", rest));
    });
    // 前端产物：命中真实文件直接发；其余是没有扩展名的路径式路由（/us-market/zh-cn/sp500/annual/），
    // 交回单页入口由 src/router.js 还原成语言与卷。
    app.get("/us-market/*", async (req, reply) => {
      const rest = (req.params as { "*": string })["*"];
      if (rest === "openapi.json") return sendUs(req, reply, US_DATA, rest);
      const file = under(US_WEB, rest);
      if (file && (await isFile(file))) return sendUs(req, reply, US_WEB, rest);
      if (path.extname(rest)) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
      return sendFile(req, reply, path.join(US_WEB, "index.html"), { type: US_TYPES[".html"], cacheControl: "no-cache" });
    });
    app.get("/api/chronicle/companies", async(req,reply)=>{const q=String((req.query as {q?:string}).q??"");if(q.length>60)return reply.code(400).send({error:"Query too long"});return reply.header("Cache-Control","no-store").send(await findCompanies(q));});
    app.get("/api/chronicle/market", async (req,reply) => {
      const before=(req.query as {before?:string}).before;
      if(before && (!/^\d{4}-\d{2}-\d{2}$/.test(before)||!Number.isFinite(Date.parse(before))))return reply.code(400).send({error:'Invalid date'});
      return reply.header('Cache-Control','no-store').send(await readMarket(before));
    });
    app.get("/api/chronicle/funds", async (_req,reply) => reply.header('Cache-Control','no-store').send(await readFundSummary()));
    app.get("/api/chronicle/provider", async (_req, reply) => reply.header("Cache-Control", "no-store").send(await readProvider()));
    app.get("/api/chronicle/compare", async (req, reply) => {
      const q = req.query as { codes?: string; start?: string; end?: string };
      const start = q.start ?? "1990-01-01", end = q.end ?? new Date().toISOString().slice(0,10);
      const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
      const codes = [...new Set((q.codes ?? "sh000300,sh000905").split(","))];
      const charts = codes.map(code => LIVE_CHARTS.find(c => c.code === code && c.kind === "index"));
      if (!valid(start) || !valid(end) || start > end || codes.length > 6 || charts.some(c => !c)) return reply.code(400).send({error:"Invalid comparison"});
      const snapshot = await readProvider();
      const inputs = await Promise.all(charts.map(async c => {
        const code=c!.code.slice(2)+'.'+c!.code.slice(0,2).toUpperCase();
        const provider=snapshot?.indices.find(x=>x.code===code);
        const bars=provider?.bars.map(b=>({...b,open:b.close,high:b.close,low:b.close,volume:0})) ?? await loadBars(c!.code);
        return {name:c!.indexName,bars};
      }));
      return reply.header("Cache-Control","no-store").send({ ...compareBars(inputs,start,end), events:await chronicleNews(start,end), missing:inputs.filter(x=>!x.bars.length).map(x=>x.name) });
    });
    // 精选页那张实时图：分时或日K，服务端抓东财（失败回退腾讯）并缓存 15 秒。
    app.get("/api/chronicle/live", async (req, reply) => {
      const query = req.query as { code?: string; kind?: string };
      const code = query.code ?? LIVE_INDICES[0];
      const kind = query.kind ?? "minute";
      if (!(LIVE_INDICES as readonly string[]).includes(code) || (kind !== "minute" && kind !== "day")) {
        return reply.code(400).send({ error: "Invalid live query" });
      }
      return reply.header("Cache-Control", "no-store").send(await loadLive(code as LiveIndex, kind as LiveKind));
    });
    // 版本、行情最后的写入时间与三组地址；行情还没抓到时 lastUpdated 是 null。
    app.get("/api/chronicle/_manifest.json", async (req, reply) => {
      const snapshot = await readProvider();
      const manifest = {
        name: "chronicle",
        source: snapshot?.source ?? LIVE_SOURCE,
        lastUpdated: snapshot?.updatedAt ?? await quotesFetchedAt(),
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
      if ((req.query as { demo?: string }).demo === "1") {
        const demo=JSON.parse(await readFile(path.join(DATA,group,`${slug}.json`),'utf8'));
        return reply.header('Cache-Control','no-store').send({...demo,meta:{...demo.meta,status:'demo',source:'随机生成的演示数据'}});
      }
      return reply.header("cache-control", "no-store").send({ meta: { id: slug, name: pageOf(group, slug)!.chartTitle, type: "line", status: "missing", source: chart ? LIVE_SOURCE : null }, series: [] });
    });
  },
  // 交易日收盘后刷新：把当天的日线写进 chronicle_quotes，页面上的图第二天就是新的。
  schedules: [
    { name: "chronicle.market", cron: "20 9 * * 1-5", missed: "once", when: () => process.env.TUSHARE_SYNC_ENABLED === "true", run: () => refreshMarket() },
    { name: "chronicle.funds", cron: "*/30 * * * *", missed: "once", when: () => process.env.TUSHARE_FUND_SYNC_ENABLED === "true", run: () => refreshFunds() },
    { name: "chronicle.provider", cron: "30 19 * * 1-5", missed: "once", when: () => process.env.TUSHARE_SYNC_ENABLED === "true" && !!process.env.TUSHARE_TOKEN, run: async () => { await refreshProvider(); await refreshCompanies(); return refreshMarket(); } },
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
