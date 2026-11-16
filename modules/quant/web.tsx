// 量化模块在网页上的插口：侧栏新增一个「量化」分区，含总览与两个工具（选股信号 / 策略回测）；
// 后台「系统」组里加一条「量化工具」，用来手动配置并触发计算；「我的」页里再放一条入口，
// 手机端从底栏的「我的」进入（底栏不新增页签）。页面自身在 module.ts 里（web/pages/ 与 web/admin-quant.tsx）。
import { IconChart, IconFilter, IconSparkles } from "@aihot/web/components/icons";
import { defineWebModule } from "@aihot/web/modules";
import { ADMIN_PATH, ROUTES } from "./catalog.ts";

export default defineWebModule({
  name: "quant",
  sidebar: {
    section: "量化",
    items: [
      { to: ROUTES.home, label: "量化工具", icon: IconSparkles, end: true },
      { to: ROUTES.signals, label: "选股信号", icon: IconFilter },
      { to: ROUTES.backtest, label: "策略回测", icon: IconChart },
    ],
  },
  tools: [{ to: ROUTES.home, label: "量化工具", icon: <IconSparkles size={20} /> }],
  // 后台「系统」组里的入口，与「指标监控」并列：手动配置参数、触发选股扫描或策略回测。
  admin: { system: [{ to: ADMIN_PATH, label: "量化工具" }] },
});
