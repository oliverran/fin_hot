// 量化模块的地址：一个独立分区（/quant），下挂「选股信号」与「策略回测」两个工具页，
// 后台再加一页「量化工具」用来手动配置并触发计算。
// 数据由 server.ts 从 /api/quant/ 发出（apiPaths），网页只通过 HTTP 读它。
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "quant",
  pages: [
    { path: "quant", file: "web/pages/home.tsx" },
    { path: "quant/signals", file: "web/pages/signals.tsx" },
    { path: "quant/backtest", file: "web/pages/backtest.tsx" },
  ],
  adminPages: [{ path: "admin/quant", file: "web/admin-quant.tsx" }],
  apiPaths: [/^\/api\/quant\//],
});
