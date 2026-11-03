// 访客指标模块的地址：只加一张后台页（/admin/analytics），公开页由 web.tsx 的 root.Bottom 埋点。
// 上报与查询由 server.ts 从 /api/analytics/ 与 /api/admin/analytics 发出（引擎已认领 /api/ 前缀，这里不必声明 apiPaths）。
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "analytics",
  adminPages: [{ path: "admin/analytics", file: "web/admin-analytics.tsx" }],
});
