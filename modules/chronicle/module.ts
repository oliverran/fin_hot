// 编年史模块的地址：一个独立的 tab（/chronicle）分成 A股与美股两部分，下面挂分组、图表详情页、方法论与接口说明页。
// 图表数据由 server.ts 从 /api/chronicle/ 发出（apiPaths），网页只通过 HTTP 读它；
// 美股编年史是 historyofmarket 子应用，由 server.ts 整站在 /us-market/ 前缀下发出，页面用 iframe 内嵌。
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "chronicle",
  pages: [
    { path: "chronicle/companies", file: "web/pages/companies.tsx" },
    { path: "chronicle/market", file: "web/pages/market.tsx" },
    { path: "chronicle/funds", file: "web/pages/funds.tsx" },
    { path: "chronicle/sectors-live", file: "web/pages/sectors-live.tsx" },
    { path: "chronicle/compare", file: "web/pages/compare.tsx" },
    { path: "chronicle", file: "web/pages/home.tsx" },
    { path: "chronicle/methodology", file: "web/pages/methodology.tsx" },
    { path: "chronicle/api", file: "web/pages/api-doc.tsx" },
    { path: "chronicle/us-market", file: "web/pages/us-market.tsx" },
    { path: "chronicle/:group", file: "web/pages/group.tsx" },
    { path: "chronicle/:group/:slug", file: "web/pages/chart.tsx" },
  ],
  apiPaths: [/^\/api\/chronicle\//, /^\/us-market(\/|$)/],
});
