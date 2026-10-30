// 图表选项：把服务端发来的 JSON（meta.type + series）翻成 ECharts 的 option。
// 十一种图表类型的口径与原项目一致（A股编年史 src/components/charts/ChartBox.astro）。
// 这里不放 JSX，也不依赖 echarts：选项按 JSON 逐段拼装，交给 echarts 的类型收口在 chart.tsx。
/** 一张图的 ECharts 选项。 */
export type ChartOption = Record<string, unknown>;

/** 一张图表的数据，形状由 meta.type 决定。 */
export interface ChronicleData {
  meta: { id: string; name: string; type: string; description?: string; events?: Array<{date:string;title:string}>; status?: string; source?: string; firstDate?: string; lastDate?: string; updatedAt?: string | null; preClose?: number };
  series: unknown;
}

/** 图表用到的颜色：从页面的 CSS 变量上读，跟随明暗主题。 */
export interface ChartTheme {
  /** 主线与柱体。 */
  ink: string;
  /** 轴文字。 */
  text: string;
  /** 网格与轴线。 */
  grid: string;
  /** 上涨 / 高位。 */
  up: string;
  /** 下跌 / 低位。 */
  down: string;
  /** 第三条颜色（多线图）。 */
  amber: string;
  /** 第四条颜色（多线图）。 */
  accent: string;
  /** 热力图的中性色（底色）。 */
  zero: string;
  /** 提示框底色。 */
  surface: string;
}

/** 没有 DOM（测试）时的兜底主题。 */
export const LIGHT_THEME: ChartTheme = {
  ink: "#202a30", text: "#59656b", grid: "#dfe4e1", up: "#b3402a", down: "#2f7d5c",
  amber: "#b8873a", accent: "#176b75", zero: "#faf9f6", surface: "rgba(255,255,255,.94)",
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const points = (data: ChronicleData) => data.series as Array<{ date?: string; year?: string; value: number }>;
const label = (row: { date?: string; year?: string }) => String(row.date ?? row.year ?? "");

/** 轴与框：图表类型的差异只在 data、series 与少数格式化上。 */
function frame(theme: ChartTheme, extra: { x?: Record<string, unknown>; y?: Record<string, unknown>; top?: number } = {}) {
  return {
    backgroundColor: "transparent",
    animation: false,
    tooltip: {
      trigger: "axis",
      backgroundColor: theme.surface,
      borderColor: theme.grid,
      textStyle: { color: theme.ink, fontFamily: MONO },
      axisPointer: { type: "line", lineStyle: { color: theme.grid, type: "dashed" } },
    },
    grid: { top: extra.top ?? 40, left: "5%", right: "5%", bottom: 40, containLabel: true },
    xAxis: {
      type: "category",
      axisLine: { lineStyle: { color: theme.grid } },
      axisTick: { show: false },
      // 密集的日线只留年份，草图上更干净。
      axisLabel: { color: theme.text, fontFamily: MONO, formatter: (value: string) => value.slice(0, 4) },
      ...extra.x,
    },
    yAxis: {
      type: "value",
      scale: true,
      splitLine: { show: true, lineStyle: { color: theme.grid, type: "dashed" } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: theme.text, fontFamily: MONO },
      ...extra.y,
    },
  };
}

/** 分类轴（年份、行业、分桶）显示完整标签，不做“只留前四个字符”的截断。 */
const fullAxis = (theme: ChartTheme, data: string[]) => ({ data, axisLabel: { color: theme.text, fontFamily: MONO, formatter: (value: string) => value } });

function legend(theme: ChartTheme) {
  return { show: true, top: 0, textStyle: { color: theme.text, fontFamily: MONO } };
}

function lineOption(data: ChronicleData, theme: ChartTheme) {
  const rows = points(data);
  return {
    ...frame(theme, { x: { data: rows.map(label) } }),
    series: [{
      name: data.meta.name,
      type: "line",
      data: rows.map((row) => row.value),
      showSymbol: false,
      lineStyle: { width: 1.5, color: theme.ink },
      itemStyle: { color: theme.ink },
    }],
  };
}

function barOption(data: ChronicleData, theme: ChartTheme) {
  const rows = points(data);
  return {
    ...frame(theme, { x: fullAxis(theme, rows.map(label)) }),
    series: [{
      name: data.meta.name,
      type: "bar",
      data: rows.map((row) => ({ value: row.value, itemStyle: { color: row.value >= 0 ? theme.up : theme.down } })),
    }],
  };
}

function drawdownOption(data: ChronicleData, theme: ChartTheme) {
  const rows = points(data);
  return {
    ...frame(theme, { x: { data: rows.map(label) }, y: { max: 0 } }),
    series: [{
      name: data.meta.name,
      type: "line",
      data: rows.map((row) => row.value),
      showSymbol: false,
      lineStyle: { width: 1, color: theme.down },
      areaStyle: { color: theme.down, opacity: 0.3 },
    }],
  };
}

function valuationOption(data: ChronicleData, theme: ChartTheme) {
  const rows = data.series as Array<{ date: string; value: number; mean: number; plus1: number; minus1: number }>;
  const line = (name: string, values: number[], color: string, type: string, zIndex: number) => ({
    name, type: "line", data: values, showSymbol: false, lineStyle: { width: type === "solid" ? 1.5 : 1, color, type }, zIndex,
  });
  return {
    ...frame(theme, { x: { data: rows.map((row) => row.date) } }),
    series: [
      line("PE(TTM)", rows.map((row) => row.value), theme.ink, "solid", 3),
      line("Mean", rows.map((row) => row.mean), theme.text, "dashed", 2),
      line("+1 Std Dev", rows.map((row) => row.plus1), theme.up, "dotted", 1),
      line("-1 Std Dev", rows.map((row) => row.minus1), theme.down, "dotted", 1),
    ],
  };
}

function heatmapOption(data: ChronicleData, theme: ChartTheme) {
  const series = data.series as { data: Array<[number, number, number]>; years: string[]; months: string[] };
  return {
    backgroundColor: "transparent",
    tooltip: {
      position: "top",
      backgroundColor: theme.surface,
      borderColor: theme.grid,
      textStyle: { color: theme.ink, fontFamily: MONO },
    },
    grid: { height: "70%", top: "10%" },
    xAxis: {
      type: "category",
      data: series.months,
      splitArea: { show: true, areaStyle: { color: ["transparent"] } },
      axisLine: { lineStyle: { color: theme.grid } },
      axisLabel: { color: theme.text, fontFamily: MONO },
    },
    yAxis: {
      type: "category",
      data: series.years,
      splitArea: { show: true },
      axisLine: { lineStyle: { color: theme.grid } },
      axisLabel: { color: theme.text, fontFamily: MONO },
    },
    visualMap: {
      min: -15,
      max: 15,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: "0%",
      inRange: { color: [theme.down, theme.zero, theme.up] },
      textStyle: { color: theme.text, fontFamily: MONO },
    },
    series: [{
      name: data.meta.name,
      type: "heatmap",
      data: series.data,
      label: { show: false },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0, 0, 0, 0.5)" } },
    }],
  };
}

/** 多线图与堆叠面积图共用的系列名 → 数值。 */
function seriesMap(data: ChronicleData) {
  return data.series as { dates?: string[]; years?: string[]; seriesData: Record<string, number[]> };
}

function multiLineOption(data: ChronicleData, theme: ChartTheme) {
  const series = seriesMap(data);
  const colors = [theme.up, theme.down, theme.amber, theme.accent, theme.ink];
  return {
    ...frame(theme, { x: { data: series.dates ?? [] }, top: 60 }),
    legend: legend(theme),
    series: Object.keys(series.seriesData).map((name, index) => ({
      name,
      type: "line",
      data: series.seriesData[name],
      markLine: index === 0 ? { symbol: "none", label: {show:false}, data: (data.meta.events ?? []).map(e=>({name:e.title,xAxis:e.date})) } : undefined,
      showSymbol: false,
      lineStyle: { width: 1.5 },
      itemStyle: { color: colors[index % colors.length] },
    })),
  };
}

function distributionBarOption(data: ChronicleData, theme: ChartTheme) {
  const series = data.series as { bins: string[]; counts: number[] };
  return {
    ...frame(theme, { x: fullAxis(theme, series.bins) }),
    series: [{
      name: "年份数量",
      type: "bar",
      data: series.counts,
      itemStyle: { color: theme.ink },
      label: { show: true, position: "top", fontFamily: MONO, color: theme.ink },
    }],
  };
}

function stackedBarDualOption(data: ChronicleData, theme: ChartTheme) {
  const rows = data.series as Array<{ year: string; total: number; eps: number; pe: number }>;
  return {
    ...frame(theme, { x: fullAxis(theme, rows.map((row) => row.year)), top: 60 }),
    legend: legend(theme),
    series: [
      { name: "EPS Growth", type: "bar", stack: "total", data: rows.map((row) => row.eps), itemStyle: { color: theme.ink } },
      { name: "PE Expansion", type: "bar", stack: "total", data: rows.map((row) => row.pe), itemStyle: { color: theme.text } },
      { name: "Total Return", type: "scatter", data: rows.map((row) => row.total), itemStyle: { color: theme.up }, symbolSize: 8, z: 10 },
    ],
  };
}

function rangeBarOption(data: ChronicleData, theme: ChartTheme) {
  const rows = data.series as Array<{ year: string; final: number; intrayear: number }>;
  return {
    ...frame(theme, { x: fullAxis(theme, rows.map((row) => row.year)), top: 60 }),
    legend: legend(theme),
    series: [
      {
        name: "年内最大回撤",
        type: "bar",
        data: rows.map((row) => row.intrayear),
        itemStyle: { color: "transparent", borderColor: theme.down, borderType: "dashed", borderWidth: 1 },
      },
      {
        name: "年底最终回报",
        type: "bar",
        data: rows.map((row) => row.final),
        itemStyle: { color: (params: { value: number }) => (params.value >= 0 ? theme.up : theme.down) },
      },
    ],
  };
}

function stackedAreaOption(data: ChronicleData, theme: ChartTheme) {
  const series = seriesMap(data);
  const colors = [theme.up, theme.amber, theme.down, theme.accent, theme.ink, theme.text];
  return {
    ...frame(theme, { x: fullAxis(theme, series.years ?? []), y: { max: 100 }, top: 60 }),
    legend: legend(theme),
    series: Object.keys(series.seriesData).map((name, index) => ({
      name,
      type: "line",
      stack: "total",
      areaStyle: {},
      emphasis: { focus: "series" },
      showSymbol: false,
      data: series.seriesData[name],
      itemStyle: { color: colors[index % colors.length] },
      lineStyle: { width: 0 },
    })),
  };
}

/** 实时行情（精选页那张卡）用得着的两类：分时与日K。 */
function minuteOption(data: ChronicleData, theme: ChartTheme) {
  const rows = data.series as Array<{ date: string; value: number }>;
  const preClose = data.meta.preClose;
  // 分时的线按当日涨跌染色；没有昨收时用中性色。
  const color = preClose === undefined || rows.length === 0 ? theme.ink : rows.at(-1)!.value >= preClose ? theme.up : theme.down;
  return {
    ...frame(theme, { x: { data: rows.map((row) => row.date), axisLabel: { color: theme.text, fontFamily: MONO, formatter: (value: string) => value } } }),
    series: [{
      name: data.meta.name,
      type: "line",
      data: rows.map((row) => row.value),
      showSymbol: false,
      lineStyle: { width: 1.4, color },
      itemStyle: { color },
      areaStyle: { color, opacity: 0.1 },
      markLine: preClose === undefined ? undefined : {
        symbol: "none",
        silent: true,
        label: { show: false },
        lineStyle: { color: theme.grid, type: "dashed", width: 1 },
        data: [{ yAxis: preClose }],
      },
    }],
  };
}

function candlestickOption(data: ChronicleData, theme: ChartTheme) {
  const rows = data.series as Array<{ date: string; open: number; close: number; high: number; low: number }>;
  return {
    ...frame(theme, { x: { data: rows.map((row) => row.date), axisLabel: { color: theme.text, fontFamily: MONO, formatter: (value: string) => value.slice(5) } } }),
    series: [{
      name: data.meta.name,
      type: "candlestick",
      // ECharts 的蜡烛顺序是「开、收、低、高」。
      data: rows.map((row) => [row.open, row.close, row.low, row.high]),
      itemStyle: { color: theme.up, color0: theme.down, borderColor: theme.up, borderColor0: theme.down },
    }],
  };
}

/** 一张图的 ECharts 选项；不认得的 type 按折线图处理（与原项目一致）。 */
export function chartOption(data: ChronicleData, theme: ChartTheme = LIGHT_THEME): ChartOption {
  const build = {
    bar: barOption,
    drawdown: drawdownOption,
    valuation: valuationOption,
    heatmap: heatmapOption,
    "multi-line": multiLineOption,
    "distribution-bar": distributionBarOption,
    "stacked-bar-dual": stackedBarDualOption,
    "range-bar": rangeBarOption,
    "stacked-area": stackedAreaOption,
    minute: minuteOption,
    candlestick: candlestickOption,
  }[data.meta.type] ?? lineOption;
  return build(data, theme);
}
