// 费用看板在网页上的插口：系统组里的一个后台条目。页面的读取来自 server.ts 的 /api/admin/costs。
import { defineWebModule } from "@aihot/web/modules";

export default defineWebModule({
  name: "costs",
  admin: { system: [{ to: "/admin/costs", label: "费用看板" }] },
});
