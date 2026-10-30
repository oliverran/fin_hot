// 编年史模块在网页上的插口：一个 tab、一条侧栏入口，以及主题页上的「相关知识」。
// 页面自身在 module.ts 里（web/pages/），数据由 server.ts 从 /api/chronicle 发出。
import { IconChart } from "@aihot/web/components/icons";
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
  sidebar: { section: "知识", items: [{ to: ROUTES.home, label: "编年史", icon: IconChart }] },
  tabs: [{ key: "chronicle", to: ROUTES.home, label: "编年史", icon: IconChart }],
  topicPage: () => import("./web/topic-part.tsx"),
});
