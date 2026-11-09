// 费用看板模块的地址：只加一张后台页（/admin/costs）。读取由 server.ts 从 /api/admin/costs 给出。
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "costs",
  adminPages: [{ path: "admin/costs", file: "web/admin-costs.tsx" }],
});
