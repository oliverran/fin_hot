// 这个模块的地址与图表目录：分组、每组的图表面板与每张图的文案。
// 数据文件（data/）由 server.ts 按这里的 slug 发出；网页只读这里，不读 data/。
// 内容收录自开源项目 A股编年史（oliverran/the-history-of-a-stock），文案与图表名称沿用该项目。

/** 三大分组：宽基、行业、抱团。 */
export type GroupKey = "broad" | "sectors" | "clusters";

export interface ChartSection {
  /** 章节号，与原站一致（1、2……）。 */
  n: string;
  title: string;
  /** 正文段落。 */
  paragraphs?: string[];
  /** “标签：说明”式的条目。 */
  items?: string[];
}

export interface ChartPage {
  slug: string;
  group: GroupKey;
  /** 分组页卡片上的标题与一句话说明。 */
  cardTitle: string;
  cardBlurb: string;
  /** 详情页的大标题与导语。 */
  heroTitle: string;
  heroLead: string;
  /** 图表自己的标题与说明。 */
  chartTitle: string;
  chartNote: string;
  /** 图表之外的补充章节（数据口径、阅读指南等），可选。 */
  sections?: ChartSection[];
}

export interface GroupInfo {
  key: GroupKey;
  /** 导航与面包屑里的短名。 */
  label: string;
  /** 章节号（罗马数字）。 */
  kicker: string;
  /** 英文名，用于大标题。 */
  english: string;
  /** 目录页的标题与描述。 */
  listTitle: string;
  listDescription: string;
  /** 目录页的大标题与导语。 */
  heroTitle: string;
  heroLead: string;
  /** 目录页的分节，每节列出它的图表。 */
  sections: Array<{ n: string; title: string; slugs: string[] }>;
}

/** 数据来源：页面上按它写出来，接口响应里也带上。 */
export const LIVE_SOURCE = "腾讯证券公开行情接口（指数日线）";

export const GROUPS: readonly GroupInfo[] = [
  {
    key: "broad",
    label: "宽基",
    kicker: "I",
    english: "The Market",
    listTitle: "The Market 宽基与时代",
    listDescription: "刻画 A 股的总体形貌、周期回撤及估值水位。",
    heroTitle: "The Market / 宽基",
    heroLead: "我们以核心宽基指数为锚，观测市场的长期形状。无论是草莽时代的暴涨暴跌，还是机构化时代的存量博弈，估值钟摆的规律始终在起作用。",
    sections: [
      { n: "1", title: "核心指数 (Core Indices)", slugs: ["shanghai-composite", "shenzhen-component", "hs300", "chinext", "star50", "csi500"] },
      { n: "2", title: "透视与拆解 (Anatomy & Turbulence)", slugs: ["distribution", "davis-decomposition", "intrayear-turbulence", "volatility", "sector-evolution", "roe-anchor"] },
      { n: "3", title: "周期与形貌 (Cycles & Shape)", slugs: ["annual", "drawdown", "eras"] },
      { n: "4", title: "估值与风格 (Valuation & Style)", slugs: ["valuation", "style-ratios", "seasonality"] },
    ],
  },
  {
    key: "sectors",
    label: "行业",
    kicker: "II",
    english: "The Sectors",
    listTitle: "The Sectors 行业与轮动",
    listDescription: "追踪七大核心赛道的周期起伏与资金轮动。",
    heroTitle: "The Sectors / 行业",
    heroLead: "当总量的贝塔逐渐消退，结构的阿尔法成为胜负手。我们选取了白酒、医药、新能源等七个具有时代特征的产业，追踪它们的兴衰与轮动轨迹。",
    sections: [
      { n: "1", title: "核心赛道 (Key Sectors)", slugs: ["baijiu", "pharma", "new-energy", "semi", "banks", "property", "ai"] },
      { n: "2", title: "轮动特征 (Rotation Analysis)", slugs: ["rotation", "sector-valuation"] },
    ],
  },
  {
    key: "clusters",
    label: "抱团",
    kicker: "III",
    english: "The Clusters",
    listTitle: "The Clusters 抱团与共识",
    listDescription: "记录历代抱团资产的聚变与裂变。",
    heroTitle: "The Clusters / 抱团",
    heroLead: "市场的超额收益往往来自偏见的共振。每一代抱团资产的崛起，都需要宏大叙事、流动性充裕与业绩验证的三击。当其中一环破裂，瓦解便无可避免。",
    sections: [
      { n: "1", title: "四代抱团 (Generations)", slugs: ["liquor-club", "ning-combo", "special-valuation", "ai-compute"] },
      { n: "2", title: "群体特征 (Characteristics)", slugs: ["concentration", "correlation", "predecessors"] },
    ],
  },
];

export const PAGES: readonly ChartPage[] = [
  // ---- 宽基 ----
  {
    slug: "shanghai-composite",
    group: "broad",
    cardTitle: "上证综指 (000001)",
    cardBlurb: "反映上海证券交易所上市公司的整体表现。",
    heroTitle: "上证综指",
    heroLead: "作为 A 股市场最古老、最广为人知的指数，上证综指记录了中国资本市场从无到有、从小到大的全过程。",
    chartTitle: "上证综指历史走势",
    chartNote: "包含自基日以来的所有交易日收盘价。",
    sections: [
      {
        n: "1",
        title: "数据口径 (Methodology)",
        items: [
          `数据来源：${LIVE_SOURCE}，每日收盘后自动更新。`,
          "时间范围：1990年12月19日至今。",
          "计算方法：以收盘价为准，指数本身不做除权除息处理。",
        ],
      },
      { n: "2", title: "继续阅读 (Continue Reading)", paragraphs: ["想要了解同一时期的其他市场表现？请查看深证成指，或是代表核心资产的沪深 300。"] },
    ],
  },
  {
    slug: "shenzhen-component",
    group: "broad",
    cardTitle: "深证成指 (399001)",
    cardBlurb: "反映深圳证券交易所上市公司的整体表现。",
    heroTitle: "深证成指",
    heroLead: "作为深圳市场的老牌核心指数，深证成指见证了中国民营经济的崛起与南方资本市场的繁荣。",
    chartTitle: "深证成指历史走势",
    chartNote: "自1991年基日以来的所有交易日收盘价。",
    sections: [
      {
        n: "1",
        title: "数据口径 (Methodology)",
        items: [`数据来源：${LIVE_SOURCE}，每日收盘后自动更新。`, "时间范围：1991年4月3日至今。", "成分逻辑：选取深圳证券交易所规模较大、流动性较好的500只股票。"],
      },
    ],
  },
  {
    slug: "hs300",
    group: "broad",
    cardTitle: "沪深 300 (000300)",
    cardBlurb: "沪深两市规模大、流动性好的300只核心资产。",
    heroTitle: "沪深 300",
    heroLead: "机构资金的主战场，外资流入的核心标的。沪深300指数是观察 A 股大盘蓝筹股和整体宏观经济晴雨表的最重要窗口。",
    chartTitle: "沪深 300 历史走势",
    chartNote: "中国核心资产的长牛与周期起伏。",
    sections: [
      {
        n: "1",
        title: "数据口径 (Methodology)",
        items: [`数据来源：${LIVE_SOURCE}，每日收盘后自动更新。`, "时间范围：2005年4月8日至今。", "代表意义：A股市场规模大、流动性好的300只股票，覆盖了国民经济的核心支柱产业。"],
      },
    ],
  },
  {
    slug: "chinext",
    group: "broad",
    cardTitle: "创业板指 (399006)",
    cardBlurb: "中国创新型企业与成长股的风向标。",
    heroTitle: "创业板指",
    heroLead: "从互联网+到新能源革命，创业板指汇聚了中国最具弹性和成长性的新经济企业。它的每一次爆发都伴随着强烈的产业叙事。",
    chartTitle: "创业板指历史走势",
    chartNote: "成长股的高弹性与高波动特征。",
  },
  {
    slug: "star50",
    group: "broad",
    cardTitle: "科创 50 (000688)",
    cardBlurb: "硬科技与自主可控战略的集中体现。",
    heroTitle: "科创 50",
    heroLead: "伴随注册制而生，承载着大国博弈下的“硬科技”突围使命。半导体、生物医药与高端装备构成了它的核心底色。",
    chartTitle: "科创 50 历史走势",
    chartNote: "注册制时代的硬科技试金石。",
  },
  {
    slug: "csi500",
    group: "broad",
    cardTitle: "中证 500 (000905)",
    cardBlurb: "中盘股的代表，成长与弹性的代名词。",
    heroTitle: "中证 500",
    heroLead: "当大盘蓝筹陷入拥挤，资金便会溢出到这里。中证500代表着中国A股腰部力量的活跃度，也是量化资金最爱的超额收益源泉。",
    chartTitle: "中证 500 历史走势",
    chartNote: "中小市值企业的阿尔法与贝塔交织。",
  },
  {
    slug: "distribution",
    group: "broad",
    cardTitle: "收益分布",
    cardBlurb: "打破均值幻觉：年度收益率的肥尾特征直方图。",
    heroTitle: "收益分布 (Distribution)",
    heroLead: "在金融学教科书中，股市收益率被假设为正态分布；但在现实的 A 股市场，它更像是一个肥尾的怪物。所谓的“年化 10%”，在绝大多数年份里根本不存在。",
    chartTitle: "沪深300年度收益率分布直方图",
    chartNote: "横轴为收益率区间，纵轴为出现的年份数量。",
    sections: [
      {
        n: "1",
        title: "阅读指南 (How to Read)",
        paragraphs: ["这张图揭示了 A 股“牛短熊长”与“暴涨暴跌”的本质特征。你可以看到，大量年份集中在 -20% ~ 0% 的区间，而带来超额回报的年份往往跳跃在 40% 以上的极端右尾。这告诉我们：如果错过了那几个极端上涨的年份，你的长期回报将趋近于零。"],
      },
    ],
  },
  {
    slug: "davis-decomposition",
    group: "broad",
    cardTitle: "戴维斯拆解",
    cardBlurb: "将年度涨跌幅剥离为 EPS 增长与 PE 扩张。",
    heroTitle: "戴维斯拆解 (Earnings vs Multiple)",
    heroLead: "价格的变动只有两个源泉：要么公司赚了更多的钱（EPS Growth），要么市场愿意给这些钱更高的定价（PE Expansion）。拆解它们，就是透视牛熊的本质。",
    chartTitle: "沪深300年度涨跌幅归因分析",
    chartNote: "红点为最终总回报；黑色柱体代表盈利贡献，灰色柱体代表估值贡献。",
    sections: [
      {
        n: "1",
        title: "阅读指南 (How to Read)",
        paragraphs: ["当黑柱与灰柱同向增长，这就是经典的戴维斯双击（如 2017 年）；当两者同向暴跌，便是戴维斯双杀（如 2018 年、2021 年）。而当你看到极长的灰色柱体孤立存在时，那便是一场纯粹由流动性催生的水牛泡沫（如 2014-2015 年）。"],
      },
    ],
  },
  {
    slug: "intrayear-turbulence",
    group: "broad",
    cardTitle: "年内波动",
    cardBlurb: "当年最终回报与年内最大回撤的惊人反差。",
    heroTitle: "年内波动 (Intrayear Turbulence)",
    heroLead: "年底的对账单总是平静的，但过程往往充满血雨腥风。如果你只看年度 K 线，你会觉得投资很简单；但如果你身处其中，每一次年内回撤都在考验人性的弱点。",
    chartTitle: "历年最终回报 vs 年内最大回撤",
    chartNote: "实心柱体代表年底最终涨跌幅；向下延伸的虚线框代表当年的最大回撤深度。",
    sections: [
      {
        n: "1",
        title: "阅读指南 (How to Read)",
        paragraphs: ["这张图揭示了一个残酷的事实：在 A 股，即使是最终录得大涨的牛市年份，年内也常常会经历 15% 甚至 20% 的剧烈洗盘。无法忍受过程波动的人，永远拿不到年底的奖赏。"],
      },
    ],
  },
  {
    slug: "volatility",
    group: "broad",
    cardTitle: "恐慌指数",
    cardBlurb: "观测市场极度恐慌与流动性枯竭的标尺。",
    heroTitle: "波动率与恐慌 (Volatility)",
    heroLead: "波动率是市场情绪的心电图。长期的低波动孕育着自满与脆弱，而瞬时的脉冲式飙升，则往往标志着流动性危机的爆发与恐慌极值的到来。",
    chartTitle: "A股核心资产历史波动率",
    chartNote: "日常中枢在 15% 左右，一旦突破 30% 则意味着系统性风险正在定价。",
  },
  {
    slug: "sector-evolution",
    group: "broad",
    cardTitle: "结构变迁",
    cardBlurb: "沪深300内部大类行业权重的演化史。",
    heroTitle: "结构变迁 (Sector Evolution)",
    heroLead: "指数从来不是静止的化石，而是活生生的有机体。观察沪深 300 内部的行业权重更替，就如同在阅读一部浓缩的中国宏观经济产业升级史。",
    chartTitle: "沪深300大类行业权重演变 (100%堆叠图)",
    chartNote: "从金融地产的独大，到消费医药的崛起，再到科技制造的突围。",
  },
  {
    slug: "roe-anchor",
    group: "broad",
    cardTitle: "ROE 锚点",
    cardBlurb: "指数长期复合回报率的终极物理重力。",
    heroTitle: "ROE 锚点 (Return on Equity)",
    heroLead: "短期看，股价是投票机；长期看，股价是称重机。而净资产收益率 (ROE) 就是那台称重机的刻度。一个指数的长期年化回报，最终会无可阻挡地收敛于它的 ROE 中枢。",
    chartTitle: "沪深300 历史 ROE 走势",
    chartNote: "反映了 A 股核心资产真实的赚钱效率与资本回报水平。",
  },
  {
    slug: "annual",
    group: "broad",
    cardTitle: "年度回报",
    cardBlurb: "历年宽基指数的绝对收益与胜率分布。",
    heroTitle: "年度回报",
    heroLead: "我们总是倾向于高估一年的变化，而低估十年的变化。以自然年为切片，看看时间究竟是朋友，还是敌人。",
    chartTitle: "沪深 300 历年绝对收益",
    chartNote: "红绿交织间，是牛熊周期的无声往复。",
  },
  {
    slug: "drawdown",
    group: "broad",
    cardTitle: "回撤名册",
    cardBlurb: "历次系统性风险的深度与修复耗时。",
    heroTitle: "回撤名册",
    heroLead: "深渊的凝视。相比于上涨的狂欢，回撤时的痛苦往往更加令人印象深刻。在这里，我们记录每一次泡沫破裂后的深度与漫长的修复周期。",
    chartTitle: "历史回撤幅度",
    chartNote: "从历史最高点跌落的百分比。那些深不见底的墨绿色深渊，就是所谓“绝望的底部”。",
  },
  {
    slug: "eras",
    group: "broad",
    cardTitle: "六时代",
    cardBlurb: "从庄股时代到量化时代的切片与断代史。",
    heroTitle: "六时代",
    heroLead: "A股并非线性发展，而是由一个个充满时代烙印的剧目拼接而成。从早期的庄股横行、股权分置改革，到杠杆牛、外资定价，再到如今的量化与被动时代。",
    chartTitle: "时代分幕",
    chartNote: "在长周期折线图上，寻找那些改变市场规则的底层逻辑转折点。",
  },
  {
    slug: "valuation",
    group: "broad",
    cardTitle: "估值锚点",
    cardBlurb: "市盈率与市净率的历史分位数与均值回归。",
    heroTitle: "估值锚点",
    heroLead: "万物皆周期，均值必回归。无论是情绪极度悲观时的破净潮，还是流动性泛滥时的市梦率，最终都会被万有引力拉回中枢。",
    chartTitle: "PE (TTM) 走势与标准差通道",
    chartNote: "在 +1 与 -1 标准差之间游走的估值钟摆。",
  },
  {
    slug: "style-ratios",
    group: "broad",
    cardTitle: "风格比值",
    cardBlurb: "大盘 vs 小盘，价值 vs 成长的周期往复。",
    heroTitle: "风格比值",
    heroLead: "没有永远占优的风格。当大盘蓝筹的确定性溢价被透支，资金便会去小盘股里寻找弹性；当成长股的景气度证伪，红利价值便会成为避风港。",
    chartTitle: "沪深300 / 中证1000 相对强弱",
    chartNote: "向上代表大盘占优，向下代表小盘占优。",
  },
  {
    slug: "seasonality",
    group: "broad",
    cardTitle: "季节性",
    cardBlurb: "春季躁动与日历效应的统计学验证。",
    heroTitle: "季节性",
    heroLead: "A股真的存在“春季躁动”、“五穷六绝七翻身”吗？我们通过热力图的维度，试图在混沌的月度收益率中寻找那些微弱的统计学规律。",
    chartTitle: "月度收益率热力图",
    chartNote: "深红代表当月大涨，深绿代表当月大跌。横轴为月份，纵轴为年份。",
  },

  // ---- 行业 ----
  {
    slug: "baijiu",
    group: "sectors",
    cardTitle: "白酒",
    cardBlurb: "长坡厚雪，量价齐升的消费图腾。",
    heroTitle: "白酒 (Liquor)",
    heroLead: "从周期品到消费品，再到社交货币与金融资产。白酒板块的估值重塑，是过去十年 A 股最宏大的一场关于确定性的叙事。",
    chartTitle: "中证白酒超额收益走势",
    chartNote: "相对沪深300的超额收益，记录了提价周期与外资流入的共振。",
    sections: [
      {
        n: "1",
        title: "产业逻辑 (Industry Logic)",
        items: [
          "量价齐升：伴随城镇化与消费升级，白酒完成了从“政务消费”向“商务 / 大众消费”的惊险一跃。",
          "定价权：极高的毛利率、不需要持续资本开支、越存越香的存货属性，赋予了高端白酒无可匹敌的提价权。",
          "外资重估：沪港通开通后，外资基于 DCF 模型对白酒稳定现金流进行了系统性的拔估值。",
        ],
      },
    ],
  },
  {
    slug: "pharma",
    group: "sectors",
    cardTitle: "医药",
    cardBlurb: "从仿制药到创新药的出海与集采周期。",
    heroTitle: "医药 (Pharmaceuticals)",
    heroLead: "老龄化是人类社会不可逆的趋势，而医药板块则是这一庞大需求的映射。在这里，政策的达摩克利斯之剑与创新的星辰大海反复交织。",
    chartTitle: "中证医药历史走势",
    chartNote: "经历过长牛，也经历过集采风暴的洗礼。",
  },
  {
    slug: "new-energy",
    group: "sectors",
    cardTitle: "新能源",
    cardBlurb: "渗透率的S型曲线与产能过剩的残酷出清。",
    heroTitle: "新能源 (New Energy)",
    heroLead: "从光伏补贴退坡到电动车渗透率飙升，新能源赛道完美演绎了产业生命周期理论：从导入期的混沌，到成长期的狂飙，再到成熟期的残酷价格战。",
    chartTitle: "新能源车产业链指数",
    chartNote: "景气度投资法的极致实验场。",
  },
  {
    slug: "semi",
    group: "sectors",
    cardTitle: "半导体",
    cardBlurb: "国产替代的星辰大海与周期属性的交织。",
    heroTitle: "半导体 (Semiconductors)",
    heroLead: "硅基时代的石油。半导体板块兼具强烈的成长属性（国产替代、自主可控）与残酷的周期属性（硅周期、库存水位），构成了极高的博弈难度。",
    chartTitle: "中华半导体芯片走势",
    chartNote: "科技自立自强的长征之路。",
  },
  {
    slug: "banks",
    group: "sectors",
    cardTitle: "银行",
    cardBlurb: "宏观经济的晴雨表与高股息的避风港。",
    heroTitle: "银行 (Banks)",
    heroLead: "百业之母。在狂飙突进的年代，它们是信用的水泵；在资产荒的年代，它们是提供稳定红利与高股息的避风港。",
    chartTitle: "中证银行走势",
    chartNote: "极低的估值中枢与长期稳定的ROE。",
  },
  {
    slug: "property",
    group: "sectors",
    cardTitle: "地产",
    cardBlurb: "旧时代的引擎与资产负债表的重构。",
    heroTitle: "地产 (Real Estate)",
    heroLead: "中国经济过去二十年最重要的加杠杆引擎。当人口结构与城镇化率跨过拐点，这个板块的走势便是一部宏大的资产负债表重构史。",
    chartTitle: "国证地产走势",
    chartNote: "黄金时代、白银时代与黑铁时代的切换。",
  },
  {
    slug: "ai",
    group: "sectors",
    cardTitle: "人工智能",
    cardBlurb: "算力、模型与应用的新一轮产业革命。",
    heroTitle: "人工智能 (AI)",
    heroLead: "当 ChatGPT 敲开 AGI 的大门，算力成为了新的基础设施。这里既有真实改变世界的产业革命，也有短期预期打满的泡沫炒作。",
    chartTitle: "中证人工智能走势",
    chartNote: "从算法、算力到应用场景的轮动炒作。",
  },
  {
    slug: "rotation",
    group: "sectors",
    cardTitle: "轮动总图",
    cardBlurb: "主线与支线的交替，电风扇行情的视觉化呈现。",
    heroTitle: "轮动总图 (Rotation)",
    heroLead: "市场的资金总量是有限的，当缺乏绝对主线时，资金便会在各个板块间进行高频的博弈与切换。我们将多条行业主线置于同一坐标系中，观察这台“电风扇”的运转轨迹。",
    chartTitle: "核心赛道相对走势对比",
    chartNote: "白酒、医药、新能源、半导体、银行的交叉往复。",
    sections: [
      {
        n: "1",
        title: "阅读指南 (How to Read)",
        paragraphs: ["本图通过归一化处理（以相同基期为 100），直观展示了在同一宏观环境下，不同产业资本周期的错位。你可以清晰地看到“跷跷板效应”：当新能源冲顶时，消费医药往往处于失血状态；而当成长股集体杀估值时，高股息的银行则会体现出强烈的抗跌属性。"],
      },
    ],
  },
  {
    slug: "sector-valuation",
    group: "sectors",
    cardTitle: "行业估值",
    cardBlurb: "各大行业 PE/PB 的横向对比与历史纵位。",
    heroTitle: "行业估值 (Sector Valuation)",
    heroLead: "买的好不如买的便宜。跨行业比较不仅需要看绝对景气度，还需要看当前价格是否已经透支了未来的预期。",
    chartTitle: "核心行业当前 PE 历史分位数",
    chartNote: "数值越低，代表相对其自身历史估值水平越便宜。",
  },

  // ---- 抱团 ----
  {
    slug: "liquor-club",
    group: "clusters",
    cardTitle: "茅指数",
    cardBlurb: "外资流入与消费升级共同缔造的白马盛世。",
    heroTitle: "茅指数 (The Liquor Club)",
    heroLead: "在沪港通开通与供给侧改革的交响乐中，外资带着低利率时代的 DCF 模型杀入 A 股。以贵州茅台为首的核心资产，迎来了史诗级的估值重塑。",
    chartTitle: "茅指数相对沪深300超额收益",
    chartNote: "2016-2021：长坡厚雪的黄金时代。",
    sections: [
      {
        n: "1",
        title: "抱团逻辑 (The Consensus)",
        items: [
          "宏观背景：经济增速换挡，总量贝塔消失，资金开始追逐确定性。",
          "微观基础：供给侧改革导致行业集中度提升，龙头企业展现出强大的抗风险能力。",
          "增量资金：北向资金持续净流入，彻底重塑了 A 股“炒小、炒新、炒差”的审美。",
        ],
      },
    ],
  },
  {
    slug: "ning-combo",
    group: "clusters",
    cardTitle: "宁组合",
    cardBlurb: "能源革命与高景气赛道的极致拔估值。",
    heroTitle: "宁组合 (The Ning Combo)",
    heroLead: "当茅指数的估值被推向高处不胜寒的位置，资金急需寻找下一个宏大叙事。碳中和的时代浪潮，将以宁德时代为首的新能源产业链推上了神坛。",
    chartTitle: "宁组合相对沪深300超额收益",
    chartNote: "景气度投资法的盛极而衰。",
  },
  {
    slug: "special-valuation",
    group: "clusters",
    cardTitle: "中特估",
    cardBlurb: "资产荒背景下的红利重估与央国企价值发现。",
    heroTitle: "中特估 (Special Valuation)",
    heroLead: "在长端利率不断下行、成长赛道集体杀估值的凛冬，“中国特色估值体系”横空出世。高股息与稳定分红成为了资金最后的避风港。",
    chartTitle: "中特估组合相对沪深300超额收益",
    chartNote: "从无人问津到全网追捧的价值重估。",
  },
  {
    slug: "ai-compute",
    group: "clusters",
    cardTitle: "AI 算力",
    cardBlurb: "AGI 浪潮下，对卖铲人的狂热追逐。",
    heroTitle: "AI 算力 (AI Compute)",
    heroLead: "ChatGPT 的爆火点燃了 AGI 的引信。在模型层竞争尚不明朗之际，卖铲子的人——光模块、服务器与算力租赁，成为了资金最疯狂的博弈阵地。",
    chartTitle: "AI算力组合相对沪深300超额收益",
    chartNote: "算力即权力的时代叙事。",
  },
  {
    slug: "concentration",
    group: "clusters",
    cardTitle: "集中度",
    cardBlurb: "市场交易拥挤度的量化刻画。",
    heroTitle: "集中度 (Concentration)",
    heroLead: "抱团的本质是资金的聚变。当全市场前 5% 的股票吸走了超过一半的流动性，这不仅是共识的巅峰，往往也是瓦解的前兆。",
    chartTitle: "前5%个股成交额占比",
    chartNote: "数值越高，代表交易越拥挤，虹吸效应越明显。",
  },
  {
    slug: "correlation",
    group: "clusters",
    cardTitle: "相关性",
    cardBlurb: "当万物齐涨齐跌，分散投资如何失效。",
    heroTitle: "相关性 (Correlation)",
    heroLead: "在系统性崩溃的末期，或者抱团瓦解的泥沙俱下阶段，所有资产的相关性都会急剧趋近于 1。这时候，任何基于行业分散的理论都会失效。",
    chartTitle: "沪深300成分股平均相关系数",
    chartNote: "相关性飙升，往往伴随着宏观流动性冲击。",
  },
  {
    slug: "predecessors",
    group: "clusters",
    cardTitle: "历史祖谱",
    cardBlurb: "从五朵金花到煤飞色舞：更早期的抱团史。",
    heroTitle: "历史祖谱 (Predecessors)",
    heroLead: "阳光之下并无新事。茅宁之前，A股同样经历过“五朵金花”与“煤飞色舞”的狂热。每一次抱团，都刻着那个时代最鲜明的宏观烙印。",
    chartTitle: "古早抱团史：金融地产煤炭有色",
    chartNote: "城镇化与重工业化全速推进时代的王冠。",
  },
];

/** 首页三章：每章一组，列出要点进去的几张图。 */
export const HOME_SECTIONS: ReadonlyArray<{ group: GroupKey; lead: string; slugs: string[] }> = [
  {
    group: "broad",
    lead: "市场是一个复杂的非线性系统，但拉长周期，依然能看到清晰的估值钟摆与时代分幕。本章通过各大宽基指数及历史回撤数据，刻画 A 股的总体形貌。",
    slugs: ["shanghai-composite", "hs300", "eras", "drawdown"],
  },
  {
    group: "sectors",
    lead: "存量博弈下，资金在不同产业间如同潮汐般涌动。本章追踪白酒、新能源、半导体等七大核心赛道的周期起伏。",
    slugs: ["baijiu", "new-energy", "rotation"],
  },
  {
    group: "clusters",
    lead: "每一次大牛市的背后，都有一套逻辑自洽的宏大叙事。本章记录历代抱团资产的聚变与裂变。",
    slugs: ["liquor-club", "ning-combo", "special-valuation", "ai-compute"],
  },
];

/** 真实行情图的算法：直接从指数日线画，或由日线现算的派生量。 */
export type LiveKind = "index" | "drawdown" | "annual" | "turbulence" | "volatility" | "seasonality" | "distribution";

export interface LiveChart {
  group: GroupKey;
  slug: string;
  kind: LiveKind;
  /** 行情代码（腾讯的写法：sh000300）；派生图填它算自的那只指数。 */
  code: string;
  /** 这只指数的中文名，用来写数据来源。 */
  indexName: string;
}

/**
 * 实时更新的图表：宽基指数走势，以及只靠指数日线就能算出来的沪深 300 派生图。
 * 其余的图（估值、行业权重、抱团等）没有公开免费口径，仍是随包的示例数据。
 */
export const LIVE_CHARTS: readonly LiveChart[] = [
  { group: "broad", slug: "shanghai-composite", kind: "index", code: "sh000001", indexName: "上证综指" },
  { group: "broad", slug: "shenzhen-component", kind: "index", code: "sz399001", indexName: "深证成指" },
  { group: "broad", slug: "hs300", kind: "index", code: "sh000300", indexName: "沪深 300" },
  { group: "broad", slug: "chinext", kind: "index", code: "sz399006", indexName: "创业板指" },
  { group: "broad", slug: "star50", kind: "index", code: "sh000688", indexName: "科创 50" },
  { group: "broad", slug: "csi500", kind: "index", code: "sh000905", indexName: "中证 500" },
  { group: "broad", slug: "drawdown", kind: "drawdown", code: "sh000300", indexName: "沪深 300" },
  { group: "broad", slug: "annual", kind: "annual", code: "sh000300", indexName: "沪深 300" },
  { group: "broad", slug: "intrayear-turbulence", kind: "turbulence", code: "sh000300", indexName: "沪深 300" },
  { group: "broad", slug: "volatility", kind: "volatility", code: "sh000300", indexName: "沪深 300" },
  { group: "broad", slug: "seasonality", kind: "seasonality", code: "sh000300", indexName: "沪深 300" },
  { group: "broad", slug: "distribution", kind: "distribution", code: "sh000300", indexName: "沪深 300" },
];

const BY_KEY = new Map(PAGES.map((page) => [`${page.group}/${page.slug}`, page]));
const GROUP_BY_KEY = new Map(GROUPS.map((group) => [group.key, group]));
const LIVE_BY_KEY = new Map(LIVE_CHARTS.map((chart) => [`${chart.group}/${chart.slug}`, chart]));

/** 这张图是不是接上了真实行情；不是的话数据是随包的示例。 */
export function liveChart(group: string, slug: string): LiveChart | undefined {
  return LIVE_BY_KEY.get(`${group}/${slug}`);
}

/** 页面与接口上写出来的数据来源。 */
export function dataSourceOf(group: string, slug: string): string {
  const chart = liveChart(group, slug);
  return chart ? `${LIVE_SOURCE}，每日收盘后更新` : "示例数据（随机生成）";
}

/** 一张图的全部文案；地址里的分组与 slug 不认得时返回 undefined。 */
export function pageOf(group: string, slug: string): ChartPage | undefined {
  return BY_KEY.get(`${group}/${slug}`);
}

/** 一个分组的目录信息。 */
export function groupOf(key: string): GroupInfo | undefined {
  return GROUP_BY_KEY.get(key as GroupKey);
}

/** 这个模块的地址：目录页、详情页、方法与接口说明页。 */
export const ROUTES = {
  home: "/chronicle",
  group: (key: GroupKey) => `/chronicle/${key}`,
  page: (group: GroupKey, slug: string) => `/chronicle/${group}/${slug}`,
  methodology: "/chronicle/methodology",
  api: "/chronicle/api",
} as const;

/** 一张图的 JSON 数据地址（由 server.ts 提供）。 */
export function dataUrl(group: GroupKey, slug: string): string {
  return `/api/chronicle/${group}/${slug}.json`;
}
