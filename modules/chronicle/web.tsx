// 编年史模块在网页上的插口：一个 tab、侧栏两条入口（A股 / 美股），以及主题页上的「相关知识」。
// 页面自身在 module.ts 里（web/pages/），A股数据由 server.ts 从 /api/chronicle 发出，
// 美股是 historyofmarket 子应用、由 server.ts 在 /us-market/ 前缀下整站发出。
import { IconChart, IconHistory } from "@aihot/web/components/icons";
import { defineWebModule } from "@aihot/web/modules";
import LiveCard from "./web/live-card.tsx";
import MarketCard from "./web/market-card.tsx";
import { ROUTES } from "./catalog.ts";

/** root.Top 只接一个组件：精选页挂实时行情，日报页挂市场背景，各自按地址判断该不该显示。 */
function RootTop() {
  return (
    <>
      <LiveCard />
      <MarketCard />
    </>
  );
}

export default defineWebModule({
  name: "chronicle",
  admin: { runs: () => import("./web/data-overview.tsx") },
  root: { Top: RootTop },
  // 侧栏并排两条，页签仍是一个「编年史」（手机底栏不加新 tab，见 home.tsx 的入口）。
  sidebar: {
    section: "知识",
    items: [
      { to: ROUTES.home, label: "A股编年史", icon: IconChart },
      { to: ROUTES.usMarket, label: "美股编年史", icon: IconHistory },
    ],
  },
  tabs: [{ key: "chronicle", to: ROUTES.home, label: "编年史", icon: IconChart }],
  topicPage: () => import("./web/topic-part.tsx"),
});
