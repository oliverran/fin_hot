// 美股编年史：把 historyofmarket 子应用整页内嵌。子应用（前端产物 + 117 个数据集）由 server.ts
// 挂在 /us-market/ 前缀下发出，这里用 iframe 直接指它的中文首页，交互、语言与卷都在子应用内部完成。
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { pageMeta } from "@aihot/web/lib/seo";
import { Link } from "react-router";
import { ROUTES } from "../../catalog.ts";

export const handle: Screen = { tab: "chronicle", name: "美股编年史" };

export function meta() {
  return pageMeta({
    title: "美股编年史",
    description:
      "美股百年走势、估值与回撤：标普 500、纳斯达克、道琼斯，以及半导体、科技、金融、消费板块与七姐妹的历史数据图表（History of Market）。",
    path: ROUTES.usMarket,
  });
}

export default function UsMarketChronicle() {
  return (
    <div className="pb-4">
      <PhoneBar back={{ to: ROUTES.home, label: "A股编年史" }} title="美股编年史" />
      <Link viewTransition to={ROUTES.home} className="hidden py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        ← A股编年史
      </Link>
      <header className="pt-4 lg:pt-0">
        <Kicker>知识库 · 编年史</Kicker>
        <h1 data-page-title="" className="mt-3 text-[26px] font-black leading-[1.2] tracking-[-0.02em] text-ink lg:text-[32px]">
          美股编年史
        </h1>
        <p className="mt-3 text-[13.5px] leading-[1.8] text-ink-3">
          标普 500、纳斯达克、道琼斯与半导体、科技、金融、消费板块及七姐妹一百多年的走势、估值与回撤，画成图表。
          <Link viewTransition to={ROUTES.methodology} className="ml-1 text-accent hover:underline">
            数据口径与免责
          </Link>
        </p>
      </header>
      {/* 子应用自己有语言切换与卷内导航，地址是路径式的（/us-market/zh-cn/sp500/annual/），刷新回落单页入口。 */}
      <iframe
        src="/us-market/zh-cn/"
        title="美股编年史"
        className="mt-4 h-[calc(100dvh-250px)] min-h-[480px] w-full rounded-card border border-line bg-surface lg:h-[calc(100dvh-210px)]"
      />
      <footer className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-[12.5px] text-ink-4">
        <Link viewTransition to={ROUTES.home} className="transition-colors hover:text-accent">
          A股编年史
        </Link>
        <Link viewTransition to={ROUTES.methodology} className="transition-colors hover:text-accent">
          数据口径
        </Link>
        <span>内容收录自开源项目 History of Market</span>
      </footer>
    </div>
  );
}
