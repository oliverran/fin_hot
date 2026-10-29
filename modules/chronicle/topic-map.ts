// 「资讯 → 编年史」的对应表：哪个主题之下配哪几张编年史图表。
// 只有这一处：server.ts 用它组装主题页的那一块，网页侧只借它的类型（所以这里不放服务端依赖）。
import { ROUTES, pageOf } from "./catalog.ts";

/** 主题页上的「相关知识」：一段导语，加上要点进去的几张图。 */
export interface TopicChroniclePart {
  blurb: string;
  pages: Array<{ group: string; slug: string; title: string; blurb: string; href: string }>;
}

/**
 * 一个主题对应哪几张图（key 是 `group/slug`）。只列真正相关的：讲指数与行情的主题配宽基与轮动，
 * 讲 AI 的主题配算力抱团，讲风险的主题配回撤。没列到的主题就不出这一块。
 */
const TOPIC_CHRONICLE: Record<string, { blurb: string; pages: string[] }> = {
  market: {
    blurb: "把今天的涨跌放回长周期里看：指数的形貌、时代的分幕与资金的轮动。",
    pages: ["broad/shanghai-composite", "broad/hs300", "broad/eras", "sectors/rotation"],
  },
  etf: {
    blurb: "被动资金的锚：宽基指数的长期形状，以及行业估值的历史纵位。",
    pages: ["broad/hs300", "broad/csi500", "broad/valuation", "sectors/sector-valuation"],
  },
  bank: {
    blurb: "银行股的历史：极低的估值中枢、长期稳定的 ROE 与红利的避风港属性。",
    pages: ["sectors/banks", "clusters/special-valuation"],
  },
  insurance: {
    blurb: "险资偏爱确定性与分红，与这一轮红利重估同源。",
    pages: ["clusters/special-valuation", "sectors/banks"],
  },
  "public-funds": {
    blurb: "公募重仓审美的变迁：从茅指数到宁组合，再到中特估。",
    pages: ["clusters/liquor-club", "clusters/ning-combo", "broad/valuation"],
  },
  "private-funds": {
    blurb: "私募与量化最在意拥挤度：抱团的聚变、裂变与相关性的失灵。",
    pages: ["clusters/concentration", "clusters/correlation"],
  },
  quant: {
    blurb: "量化偏爱波动与风格切换：大小盘的往复、交易的拥挤与恐慌的脉冲。",
    pages: ["broad/style-ratios", "clusters/concentration", "broad/volatility"],
  },
  "ai-finance": {
    blurb: "AI 产业叙事的资本市场映射：AI 板块的轮动与算力抱团的狂热。",
    pages: ["sectors/ai", "clusters/ai-compute"],
  },
  "high-flyer": {
    blurb: "算力即权力：AGI 浪潮下对“卖铲人”的追逐。",
    pages: ["clusters/ai-compute", "sectors/ai"],
  },
  research: {
    blurb: "研报的估值语言：PE 的历史分位、行业纵位与戴维斯拆解。",
    pages: ["broad/valuation", "sectors/sector-valuation", "broad/davis-decomposition"],
  },
  risk: {
    blurb: "回撤名册：历次系统性风险的深度、修复耗时与收益的肥尾。",
    pages: ["broad/drawdown", "broad/distribution"],
  },
  macro: {
    blurb: "货币与财政的潮汐如何塑造市场：估值钟摆、时代分幕与日历效应。",
    pages: ["broad/valuation", "broad/eras", "broad/seasonality"],
  },
  policy: {
    blurb: "制度变迁塑造了市场：从庄股时代、股权分置到量化与被动时代。",
    pages: ["broad/eras", "broad/style-ratios"],
  },
  ipo: {
    blurb: "注册制与硬科技：科创 50 的诞生，以及成长股的高弹性。",
    pages: ["broad/star50", "broad/chinext"],
  },
  data: {
    blurb: "值得记住的数字背后：收益分布、年度胜率与季节性规律。",
    pages: ["broad/distribution", "broad/annual", "broad/seasonality"],
  },
};

/** 这个主题的编年史面板；没配图的主题（或图不在目录里）返回 null，主题页就不出这一块。 */
export function chronicleForTopic(slug: string): TopicChroniclePart | null {
  const entry = TOPIC_CHRONICLE[slug];
  if (!entry) return null;
  const pages = entry.pages.flatMap((key) => {
    const at = key.indexOf("/");
    const page = pageOf(key.slice(0, at), key.slice(at + 1));
    if (!page) return [];
    return [{ group: page.group, slug: page.slug, title: page.cardTitle, blurb: page.cardBlurb, href: ROUTES.page(page.group, page.slug) }];
  });
  return pages.length > 0 ? { blurb: entry.blurb, pages } : null;
}
