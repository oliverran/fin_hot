// 精选页第一屏的实时行情卡：上证综指与创业板指的分时 / 日K。
// 数据由 /api/chronicle/live 提供（后端抓东财、腾讯，前端不直连第三方）；
// 开盘时段每 15 秒轮询一次，切到后台就停，收盘后不再打接口。
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import type { LiveKind, LivePayload } from "../backend/live.ts";
import { LIVE_INDICES, indexName } from "../catalog.ts";
import { Canvas } from "./chart.tsx";
import type { ChronicleData } from "./options.ts";

const KINDS: ReadonlyArray<{ key: LiveKind; label: string }> = [
  { key: "minute", label: "分时" },
  { key: "day", label: "日K" },
];
const POLL = 15_000;

/** 现在是不是沪深交易时段（北京时间，周一至周五 9:30-11:30 与 13:00-15:00）。 */
export function tradingNow(now = new Date()): boolean {
  const day = new Date(`${beijingDate(now)}T00:00:00Z`).getUTCDay();
  if (day === 0 || day === 6) return false;
  const [hours, minutes] = beijingTime(now).split(":").map(Number);
  const at = hours! * 60 + minutes!;
  return (at >= 570 && at <= 690) || (at >= 780 && at <= 900);
}

/** 一份实时数据 → 画图要的形状；meta.type 决定 options.ts 用哪种图。 */
function chartOf(live: LivePayload): ChronicleData {
  if (live.kind === "minute") {
    return {
      meta: { id: `${live.code}-minute`, name: `${live.name} 分时`, type: "minute", preClose: live.preClose ?? undefined },
      series: live.minutes.map((minute) => ({ date: minute.time, value: minute.price })),
    };
  }
  return {
    meta: { id: `${live.code}-day`, name: `${live.name} 日K`, type: "candlestick" },
    series: live.bars.map((bar) => ({ date: bar.date, open: bar.open, close: bar.close, high: bar.high, low: bar.low })),
  };
}

const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

export default function LiveCard() {
  const { pathname } = useLocation();
  const active = pathname === "/";
  const [code, setCode] = useState<string>(LIVE_INDICES[0]);
  const [kind, setKind] = useState<LiveKind>("minute");
  const [live, setLive] = useState<LivePayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLive(null);
    setFailed(false);
    if (!active) return;
    let stopped = false;
    let timer = 0;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/chronicle/live?code=${code}&kind=${kind}`, { signal: controller.signal, headers: { accept: "application/json" } });
        if (!response.ok) throw new Error(`api ${response.status}`);
        const payload = (await response.json()) as LivePayload;
        if (!stopped) { setLive(payload); setFailed(false); }
      } catch {
        if (!stopped && !controller.signal.aborted) setFailed(true);
      }
    };
    // 回到前台补一次：后台期间停掉的轮询要接上。
    const onVisible = () => { if (document.visibilityState === "visible" && tradingNow()) void load(); };
    const tick = () => {
      if (stopped) return;
      if (tradingNow() && document.visibilityState === "visible") void load();
      timer = window.setTimeout(tick, POLL);
    };
    void load();
    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, code, kind]);

  if (!active) return null;

  const quote = live?.quote ?? null;
  const tone = quote === null || quote.change === 0 ? "text-ink-2" : quote.change > 0 ? "text-hot" : "text-ok";
  const tab = (on: boolean) => `h-7 rounded-full px-3 text-[12.5px] transition-colors ${on ? "bg-surface font-medium text-ink ring-1 ring-line" : "text-ink-3 hover:text-ink"}`;
  return (
    <aside className="card mx-auto my-4 overflow-hidden" aria-label="实时行情">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-4 py-3">
        <div className="flex items-center gap-0.5 rounded-full bg-bg-sunk p-0.5" role="tablist" aria-label="指数">
          {LIVE_INDICES.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={item === code} onClick={() => setCode(item)} className={tab(item === code)}>
              {indexName(item)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 rounded-full bg-bg-sunk p-0.5" role="tablist" aria-label="周期">
          {KINDS.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={item.key === kind} onClick={() => setKind(item.key)} className={tab(item.key === kind)}>
              {item.label}
            </button>
          ))}
        </div>
        {quote && (
          <div className={`ml-auto flex items-baseline gap-2 ${tone}`}>
            <span className="num text-[20px] font-semibold leading-none">{quote.price.toFixed(2)}</span>
            <span className="num text-[12.5px]">{signed(quote.change)} {signed(quote.changePct)}%</span>
          </div>
        )}
      </div>
      <div className="px-1 pt-2">
        {live === null
          ? <div className="mx-3 h-[240px] animate-pulse rounded-tile bg-bg-sunk sm:h-[300px]" aria-hidden="true" />
          : (
            <div className="h-[240px] w-full sm:h-[300px]" role="img" aria-label={`${live.name}${live.kind === "minute" ? "分时" : "日K"}`}>
              <Canvas data={chartOf(live)} />
            </div>
          )}
      </div>
      <p className="px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-4">
        {failed ? "行情读取失败，稍后再试。" : live ? `${live.source}${quote?.time ? ` · ${quote.time}` : ""} · 有延迟，不构成投资建议。` : "正在读取行情…"}
      </p>
    </aside>
  );
}
