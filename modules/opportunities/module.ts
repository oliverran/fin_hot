// 机会模块的地址：一个公开页（/opportunities，当天与最近 7 天）与一张后台页（/admin/opportunities）。
// 数据由 server.ts 从 /api/opportunities 与 /api/admin/opportunities 发出
//（引擎已认领 /api/ 前缀，这里不必声明 apiPaths）。
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "opportunities",
  pages: [{ path: "opportunities", file: "web/pages/home.tsx" }],
  adminPages: [{ path: "admin/opportunities", file: "web/admin-opportunities.tsx" }],
});
