// 美股编年史：把 historyofmarket 子应用整页内嵌。子应用（前端产物 + 117 个数据集）由 server.ts
// 挂在 /us-market/ 前缀下发出，这里用 iframe 直接指它的中文首页，交互、语言与卷都在子应用内部完成。
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { PillTabs } from "@aihot/web/components/ui/Tabs";
import { pageMeta } from "@aihot/web/lib/seo";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ROUTES } from "../../catalog.ts";

/**
 * 子应用首屏要下 1.7MB 的脚本，加载期间 iframe 里是白的。这里探测它自己的 #root 是否已经
 * 渲染出内容，没渲染完就一直盖着骨架。同源才能探测；探测不到（跨源或异常）就在超时后放行。
 */
function useFrameReady(maxWaitMs = 20000) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const started = Date.now();
    let timer = 0;
    const check = () => {
      let rendered = false;
      try {
        const root = ref.current?.contentDocument?.querySelector("#root");
        rendered = !!root && root.childElementCount > 0;
      } catch {
        rendered = false;
      }
      if (rendered || Date.now() - started > maxWaitMs) {
        setReady(true);
        return;
      }
      timer = window.setTimeout(check, 200);
    };
    timer = window.setTimeout(check, 200);
    return () => window.clearTimeout(timer);
  }, [ready, maxWaitMs]);
  return { ref, ready };
}

/** 加载占位：模仿子应用的版式（标题、页签、图表区），避免白屏。 */
function UsMarketSkeleton() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex flex-col gap-4 rounded-card border border-line bg-surface p-5"
    >
      <div className="h-5 w-44 animate-pulse rounded-mark bg-line" />
      <div className="flex gap-2">
        {[64, 52, 60, 56].map((w) => (
          <div key={w} className="h-7 animate-pulse rounded-full bg-line" style={{ width: w }} />
        ))}
      </div>
      <div className="min-h-0 flex-1 animate-pulse rounded-card bg-line/60" />
      <p className="text-center text-[12.5px] text-ink-4">正在加载美股编年史…</p>
    </div>
  );
}

export const handle: Screen = { tab: "chronicle", name: "美股编年史" };

/** A股 / 美股两个编年史的切换；手机底栏只有一个「编年史」页签，切换放在页内。 */
const SCOPE_TABS = [
  { key: "a-share", label: "A股编年史", to: ROUTES.home },
  { key: "us", label: "美股编年史", to: ROUTES.usMarket },
];

export function meta() {
  return pageMeta({
    title: "美股编年史",
    description:
      "美股百年走势、估值与回撤：标普 500、纳斯达克、道琼斯，以及半导体、科技、金融、消费板块与七姐妹的历史数据图表（History of Market）。",
    path: ROUTES.usMarket,
  });
}

export default function UsMarketChronicle() {
  const { ref, ready } = useFrameReady();
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
        <PillTabs items={SCOPE_TABS} active="us" layoutId="chronicle-scope" size="sm" label="编年史范围" className="mt-5" />
      </header>
      {/* 子应用自己有语言切换与卷内导航，地址是路径式的（/us-market/zh-cn/sp500/annual/），刷新回落单页入口。 */}
      <div className="relative mt-4">
        <iframe
          ref={ref}
          src="/us-market/zh-cn/"
          title="美股编年史"
          className="h-[calc(100dvh-250px)] min-h-[480px] w-full rounded-card border border-line bg-surface lg:h-[calc(100dvh-210px)]"
        />
        {!ready && <UsMarketSkeleton />}
      </div>
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
