// 评测前沿模块的地址：一张后台页（/admin/model-eval），把每次 SelectBench 对比运行画成
// 「成本 × 质量」的帕累托前沿图。数据由 server.ts 从 /api/admin/model-eval 发出
//（引擎已认领 /api/ 前缀，这里不必声明 apiPaths）。
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "model-eval",
  adminPages: [{ path: "admin/model-eval", file: "web/admin-model-eval.tsx" }],
});
