// 机会模块在网页上的插口：手机底栏一个 tab，电脑侧栏在「内容」里加一条，后台「系统」里加一条。
// 页面自身在 module.ts 里（web/pages/），数据由 server.ts 从 /api/opportunities 发出。
import { IconTrendUp } from "@aihot/web/components/icons";
import { defineWebModule } from "@aihot/web/modules";

export default defineWebModule({
  name: "opportunities",
  sidebar: { section: "内容", items: [{ to: "/opportunities", label: "机会", icon: IconTrendUp }] },
  tabs: [{ key: "opportunity", to: "/opportunities", label: "机会", icon: IconTrendUp }],
  admin: { system: [{ to: "/admin/opportunities", label: "机会" }] },
});
