// 访客指标在网页上的插口：一个后台条目，加上公开页的匿名埋点（root.Bottom）。
// 埋点是整页的一层事件委托，不改动导航、卡片这些入口本身。
import { defineWebModule } from "@aihot/web/modules";
import Marks from "./web/marks.tsx";

export default defineWebModule({
  name: "analytics",
  admin: { system: [{ to: "/admin/analytics", label: "指标监控" }] },
  root: { Bottom: Marks },
});
