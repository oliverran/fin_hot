// 公开页的匿名埋点：每次页面浏览、每次关键入口点击各上报一条。
// 只送浏览器本地生成的随机访客号、地址和入口名，不含 IP、账号或用户代理；板块名由服务端按地址算
// （backend/groups.ts）。入口不上报也不改各处的链接组件：这里在捕获阶段监听整页的点击。
// 后台有自己的外壳，不渲染 root.Bottom，所以后台不受影响。
import { useEffect } from "react";
import { useLocation } from "react-router";
import { readRaw, writeRaw } from "@aihot/web/lib/local-state";

/** 随机访客号：本浏览器生成一次并留存，清掉本地存储就换一个新的。 */
const VISITOR_KEY = "aihot-analytics-visitor";
const VISITOR = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_PATH = 200;
const MAX_LABEL = 24;

function randomId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.replace(/[^A-Za-z0-9]/g, "").padEnd(16, "0").slice(0, 32);
  }
}

/** 本浏览器的访客号；存不下也用这一次生成的号，不因为存储不可用就少报一笔。 */
function visitorId(): string {
  const existing = readRaw(VISITOR_KEY);
  if (existing && VISITOR.test(existing)) return existing;
  const id = randomId();
  writeRaw(VISITOR_KEY, id);
  return id;
}

/** 送一条；优先用 sendBeacon（离开页面时也能送出），否则 fetch(keepalive)。埋点失败不影响页面。 */
function send(body: { kind: "pageview" | "click"; path: string; label?: string; visitor: string }) {
  try {
    const url = "/api/analytics/collect";
    const data = JSON.stringify(body);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([data], { type: "application/json" }));
      return;
    }
    void fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: data, keepalive: true }).catch(() => {});
  } catch {
    // 埋点只是旁路，出错就算了。
  }
}

export default function Marks() {
  const { pathname, search } = useLocation();

  // 页面浏览：地址（含查询串）变化时一条，首次挂载也算一条。
  useEffect(() => {
    const path = pathname + search;
    if (path.length > MAX_PATH) return;
    send({ kind: "pageview", path, visitor: visitorId() });
  }, [pathname, search]);

  // 关键入口点击：监听整页的捕获阶段，站内锚点的去处与文字就是要上报的入口。
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href.startsWith("//") || href.length > MAX_PATH) return;
      const label = (anchor.getAttribute("aria-label") || anchor.textContent || "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
      if (!label) return;
      send({ kind: "click", path: href, label, visitor: visitorId() });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
