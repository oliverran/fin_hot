// 编年史图表（浏览器侧）：取 /api/chronicle 的 JSON，动态载入 echarts 画出来。
// 颜色取自页面上的语义变量，明暗切换与容器宽度变化都跟着变；服务端不下载 echarts。
import { useEffect, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import { watchAppearance } from "@aihot/web/lib/local-state";
import { chartOption, LIGHT_THEME, type ChartTheme, type ChronicleData } from "./options.ts";

const loadEcharts = () => import("echarts");
type Echarts = typeof import("echarts");
type Chart = ReturnType<Echarts["init"]>;

/** 图表颜色：读页面上的语义变量（`:root` 与 `[data-theme="dark"]` 各有一套），读不到就用亮色兜底。 */
function theme(): ChartTheme {
  const read = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  return {
    ink: read("--ink", LIGHT_THEME.ink),
    text: read("--ink-3", LIGHT_THEME.text),
    grid: read("--line", LIGHT_THEME.grid),
    up: read("--hot", LIGHT_THEME.up),
    down: read("--ok", LIGHT_THEME.down),
    amber: read("--amber", LIGHT_THEME.amber),
    accent: read("--accent", LIGHT_THEME.accent),
    zero: read("--bg", LIGHT_THEME.zero),
    surface: read("--surface", LIGHT_THEME.surface),
  };
}

/** 画布：容器量好以后才画，容器尺寸变了就重画一次。 */
export function Canvas({ data }: { data: ChronicleData }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let chart: Chart | null = null;
    let dropped = false;
    let frame = 0;
    const draw = () => chart?.setOption(chartOption(data, theme()) as unknown as EChartsOption, true);
    void loadEcharts().then((echarts) => {
      if (dropped) return;
      chart = echarts.init(el);
      draw();
    });
    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        chart?.resize();
      });
    });
    observer.observe(el);
    const unwatch = watchAppearance((change) => {
      if (change === "theme") draw();
    });
    return () => {
      dropped = true;
      observer.disconnect();
      unwatch();
      if (frame) cancelAnimationFrame(frame);
      chart?.dispose();
    };
  }, [data]);
  return <div ref={host} className="h-full w-full" />;
}

/** 图下方那行来源与覆盖：实时图给来源与区间，快照给来源，缺失给提示。 */
function sourceLine(meta: ChronicleData["meta"]): string {
  if (meta.status === "missing") return "尚未取得真实数据";
  const parts: string[] = [];
  if (meta.status === "stale") parts.push("尚未更新到应有交易日");
  if (meta.source) parts.push(meta.source);
  if (meta.firstDate && meta.lastDate) parts.push(`覆盖 ${meta.firstDate} 至 ${meta.lastDate}（收盘日线）`);
  return parts.join(" · ");
}

/** 详情直接出图。卷页先读目标图，其余在滚动接近时取数。 */
export function ChronicleChart({ src, name, panel, first, className = "" }: {
  src: string; name: string; panel?: string; first?: boolean; className?: string;
}) {
  const figure = useRef<HTMLElement>(null);
  const [state, setState] = useState<{ data: ChronicleData } | "error" | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let observer: IntersectionObserver | undefined;
    let started = false;
    function load() {
      if (started || controller.signal.aborted) return;
      started = true;
      observer?.disconnect();
      window.removeEventListener("hashchange", onHashChange);
      const data = fetch(src, { headers: { accept: "application/json" }, signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`api ${res.status}`);
          return res.json() as Promise<ChronicleData>;
        });
      Promise.all([data, loadEcharts()])
        .then(([data]) => { if (!controller.signal.aborted) setState({ data }); })
        .catch(() => { if (!controller.signal.aborted) setState("error"); });
    }
    function onHashChange() {
      if (location.hash === `#${panel}`) load();
    }
    if (!panel || location.hash === `#${panel}` || (first && !location.hash)) {
      load();
    } else if (figure.current) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load();
      }, { rootMargin: "320px 0px" });
      observer.observe(figure.current);
      window.addEventListener("hashchange", onHashChange);
    }
    return () => {
      controller.abort();
      observer?.disconnect();
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [src, panel, first]);
  const data = state !== null && state !== "error" ? state.data : null;
  const note = data ? sourceLine(data.meta) : "";
  return (
    <figure ref={figure} className={className}>
      {state === null && <div className="h-[320px] w-full animate-pulse rounded-tile bg-bg-sunk sm:h-[420px]" aria-hidden="true" />}
      {state === "error" && (
        <p className="well flex h-[220px] items-center justify-center rounded-card px-5 text-center text-[13px] leading-relaxed text-ink-3">
          图表数据暂时取不到，刷新页面再试。
        </p>
      )}
      {data && data.meta.status !== "missing" && (
        <div className="h-[320px] w-full sm:h-[420px]" role="img" aria-label={data.meta.name}>
          <Canvas data={data} />
        </div>
      )}
      {note && <p className="mt-3 text-sm text-ink-3" role="status">{note}</p>}
      <figcaption className="mt-2 text-[11.5px] text-ink-4">{name}</figcaption>
    </figure>
  );
}
