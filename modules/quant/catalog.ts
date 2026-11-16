// 量化模块的地址、共享文案与数据形状：页面路由、三个选股策略的说明、数据来源与免责声明，
// 手动运行引擎的参数约束，以及后端从 /api/quant 发出、网页读取的数据结构。网页与后端都读这里，不各写一份。

/** 页面地址。 */
export const ROUTES = {
  home: "/quant",
  signals: "/quant/signals",
  backtest: "/quant/backtest",
} as const;

/** 后台手动配置并触发计算的那一页（module.ts 的 adminPages）。 */
export const ADMIN_PATH = "/admin/quant";

/** 三个页面之间的切换（PillTabs 的 items）。 */
export const QUANT_NAV = [
  { key: "home", label: "总览", to: ROUTES.home },
  { key: "signals", label: "选股信号", to: ROUTES.signals },
  { key: "backtest", label: "策略回测", to: ROUTES.backtest },
];

/** 一个名字在站内的两处落点：编年史背景卡与站内报道检索；只拼 URL，不跨模块引用。 */
export const companyLinks = (name: string) => ({
  chronicle: `/chronicle/companies?q=${encodeURIComponent(name)}`,
  reports: `/all?q=${encodeURIComponent(name)}`,
});

/** 读不到站外产物时的回退来源：示例数据仍用这一条标注。 */
export const QUANT_SOURCE = "离线合成示例数据（尚未接入真实行情）";

/** 站外产物自报的数据来源：合成示例点出来，没标注就照实说。 */
export const productSource = (product: { demo?: boolean; data_source?: string }) =>
  product.demo ? "工具合成示例数据" : (product.data_source ?? "未标注数据来源");

export const DISCLAIMER =
  "本工具仅供研究与学习使用，不预测也不代表未来行情，不构成任何投资建议。";

/** 三个选股策略，键与 stock-daily-analyzer 的推荐类型一致。 */
export type StrategyKey = "超卖反弹" | "趋势向好" | "放量突破";

export interface StrategyInfo {
  key: StrategyKey;
  label: string;
  /** 触发条件的一句话说明。 */
  rule: string;
  blurb: string;
}

export const STRATEGIES: readonly StrategyInfo[] = [
  { key: "超卖反弹", label: "超卖反弹", rule: "RSI < 45 且 MACD 金叉", blurb: "跌出来的技术性修复，博一段反弹。" },
  { key: "趋势向好", label: "趋势向好", rule: "均线多头 且 MACD 为正 且 40 < RSI < 70", blurb: "动能向上、尚未过热，顺着趋势走。" },
  { key: "放量突破", label: "放量突破", rule: "量比 > 1.2 且 日涨幅 > 1% 且 RSI < 75", blurb: "成交放大、价格向上突破平台。" },
];

/** 一条选股信号。 */
export interface Signal {
  date: string;
  ticker: string;
  name: string;
  sector: string;
  recommendationType: StrategyKey;
  price: number;
  rsi: number;
  macdSignal: string;
  volumeRatio: number;
  /** 0–100 的置信度。 */
  confidence: number;
  reasoning: string;
}

/** 选股页的数据：按策略分组，附当日扫描范围。 */
export interface SignalsData {
  asOf: string;
  source: string;
  /** 当日扫描的股票池大小。 */
  universe: number;
  strategies: Array<{ key: StrategyKey; label: string; rule: string; blurb: string; picks: Signal[] }>;
}

/** 净值曲线上的一个点。 */
export interface EquityPoint {
  date: string;
  equity: number;
}

/** 一次调仓保留的持仓。 */
export interface Holding {
  /** 产物里的代码，可能是 600519 或 600519.SS 这类写法。 */
  ticker: string;
  /** 名称：查得到就是中文名，查不到退回代码。 */
  name: string;
  sector: string;
  weight: number;
}

/** 一份回测快照：配置、指标、净值曲线与最近一次调仓的持仓。 */
export interface BacktestSnapshot {
  config: { name: string; universe: string; start: string; end: string; rebalance: string };
  source: string;
  metrics: { totalReturn: number; cagr: number; sharpe: number; maxDrawdown: number; winRate: number };
  equity: EquityPoint[];
  holdings: Holding[];
}

/** 回测页对外发出的一份数据：当前这一份快照，加上可切换的配置列表。 */
export interface BacktestData extends BacktestSnapshot {
  /** 数据目录下所有能读出的配置名；一份产物都没有时只有回退示例这一条。 */
  snapshots: string[];
  /** 当前展示的配置名，snapshots 里的一项。 */
  active: string;
}

/** 主板代码前缀，与站外引擎的股票池口径一致。 */
export const MAIN_BOARD_PREFIX = ["000", "001", "002", "003", "600", "601", "603", "605"];

/** 调仓节奏：每周五 / 每月末 / 每日收盘。 */
export type Rebalance = "W-FRI" | "M" | "D";

/** 因子权重，键与引擎的因子名一致。 */
export interface FactorWeights {
  momentum: number;
  volatility: number;
  rsi: number;
  volume_ratio: number;
}

/**
 * 一次手动运行要交给引擎的参数。网页的表单与后端的校验同读这一份约束，
 * 不各写一套上下限。选股扫描（daily）只用股票池那几项，其余项忽略。
 */
export interface QuantParams {
  /** daily = 当日选股扫描；backtest = 一段历史的策略回测。 */
  mode: "daily" | "backtest";
  /** 回测的配置名，同时是产物目录名（quant/<名>）；选股扫描为空串。 */
  name: string;
  /** 股票池：main = 主板，all = 沪深 A 股（去掉创业板）。 */
  universe: "main" | "all";
  /** 扫描或回测的股票只数上限。 */
  maxStocks: number;
  /** 回测区间（YYYY-MM-DD）；end 留空表示到当天。 */
  start: string;
  end: string;
  rebalance: Rebalance;
  /** 组合里最多同时持有的只数。 */
  topK: number;
  /** 单只权重上限。 */
  maxWeightPerName: number;
  /** 回撤熔断阈值（0–1），0 表示不熔断。 */
  maxDrawdownHalt: number;
  weights: FactorWeights;
}

/** 参数的上下限，表单与后端同用。 */
export const PARAM_LIMITS = {
  /** 配置名字数上限，也是产物目录名的长度。 */
  name: 24,
  maxStocks: { min: 20, max: 400 },
  topK: { min: 1, max: 50 },
  maxWeightPerName: { min: 0.02, max: 1 },
  maxDrawdownHalt: { min: 0, max: 0.9 },
  weight: { min: -3, max: 3 },
} as const;

/** 表单的初始值，也是提交时缺省项的兜底；end 由后端填成当天。 */
export const QUANT_DEFAULTS: QuantParams = {
  mode: "backtest",
  name: "主板周频轮动",
  universe: "main",
  maxStocks: 120,
  start: "2024-01-02",
  end: "",
  rebalance: "W-FRI",
  topK: 10,
  maxWeightPerName: 0.15,
  maxDrawdownHalt: 0.2,
  weights: { momentum: 1, volatility: -0.5, rsi: -0.2, volume_ratio: 0.2 },
};

/** 后台配置页读到的运行状态：引擎是否可用、表单默认值、已有快照与最近几次运行。 */
export interface QuantAdminStatus {
  engine: { ready: boolean; dir: string; python: string; script: string; missing?: string };
  /** 表单初始值（end 已填成当天）。 */
  defaults: QuantParams;
  /** 已有产物的回测配置名，就是回测页可切换的那几项。 */
  snapshots: string[];
  /** 最近几次运行（job_runs 的 quant.run）。 */
  runs: Array<{ id: number; status: string; startedAt: string; finishedAt: string | null; error: string | null; detail: unknown }>;
}
