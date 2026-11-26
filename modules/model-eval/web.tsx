// 评测前沿模块在网页上的插口：只在后台「系统」里加一条，不进读者侧栏与手机底栏。
// 页面自身在 module.ts 里（web/），数据由 server.ts 从 /api/admin/model-eval 发出。
import { defineWebModule } from "@aihot/web/modules";

export default defineWebModule({
  name: "model-eval",
  admin: { system: [{ to: "/admin/model-eval", label: "评测前沿" }] },
});
