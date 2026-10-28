// 这个行业的分类体系：类别、标签词表、机构（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（教程、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * tagColor 是飞书推送卡片里跟在标题后面的这一类小标签的颜色（飞书 text_tag 的颜色名）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  { key: "ai-finance", tagColor: "indigo", label: "AI金融", feedLabel: "AI 金融", section: "AI 与金融科技", guide: "人工智能在金融领域的落地进展：金融大模型与智能投顾、量化与算法交易、风控反欺诈与合规科技、征信与支付科技、金融机构自己或与科技公司的 AI 合作。只讲 AI 本身而与金融无关的进展归行业动态；纯行情播报归市场。" },
  { key: "policy", tagColor: "carmine", label: "政策监管", feedLabel: "政策与监管", section: "政策与监管", guide: "监管机构与交易所的规则、通知、征求意见、答记者问、处罚与立案；货币政策与财政政策；法律法规与自律规则的制定和修订。政策本身归这里，市场对政策的反应归市场。一条政策由当事人自己发布、带有态度，也不因此变成观点。" },
  { key: "market", tagColor: "orange", label: "市场", feedLabel: "A 股市场", section: "市场与交易", guide: "A 股为主，兼顾港股与美股：指数与板块走势、个股的重大异动与涨跌停、成交与资金面、北向与两融、新股上市与打新、交易机制变化。收的是影响面大的行情与资金变化，不是每日收盘播报；对行情的解释与判断归研究或观点。" },
  { key: "funds", tagColor: "turquoise", label: "公募私募", feedLabel: "公募/私募", section: "公募与私募", guide: "公募基金、私募基金、券商资管与银行理财等产品的发行募集、产品设计与费率、申赎限购、净值与业绩排名、基金经理与投研团队变动、备案登记与运作公告，以及直接决定这些的产品政策。基金公司自身的经营与人事归行业动态。" },
  { key: "industry", tagColor: "blue", label: "行业动态", feedLabel: "行业动态", section: "行业动态", guide: "证券公司、银行、保险、基金公司、交易所、评级与数据服务机构的经营动态、人事任免、战略合作、并购与处罚，以及不在其他类别里的金融行业新闻。融资并购归这里，与 AI 落地直接相关的进展才归 AI金融。" },
  { key: "research", tagColor: "violet", label: "研究", feedLabel: "券商研究", section: "研究与观点", guide: "券商研究所与投行的研究报告、评级与目标价、策略与行业深度、经济学家与分析师的观点、投研方法论。重点是给出论据的判断与可复用的分析框架；纯行情搬报归市场，只有态度和预测而无依据的短评归观点，学术论文与量化方法研究也归这里。" },
  { key: "opinion", tagColor: "purple", label: "观点", section: "研究与观点", guide: "重点是作者的解释、判断、主张、预测、评论或访谈观点。讨论市场不自动归行业，作者是名人不自动归观点，转述他人判断而无自己论据的仍归研究。", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布（金融行业是新基金发行）：日报报头的“N 只新基金”、改分类后修订已出的报告都按它数。
 * category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "funds", tag: "产品发行", unit: "只新基金" };

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = ["a股", "港股", "美股", "etf", "ipo", "gdp", "cpi", "ppi", "pmi", "lpr", "ceo", "cfo", "ai"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["product_launch", "policy_release", "market_move", "deal_event", "research_report", "institution_news", "opinion_analysis", "explainer"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "产品发行", "产品更新", "政策/监管", "市场/行情", "机构动态", "研报/研究", "数据/统计", "并购/融资", "人事/团队", "风险/处罚", "观点/策略", "宏观/货币",
  "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "AI金融", "量化交易", "智能投顾", "风控/反欺诈", "公募", "私募", "ETF/指数", "债券", "衍生品", "并购重组", "IPO/再融资", "银行", "保险", "券商", "信托/资管", "数字资产",
] as const;

/** 可选的实体标签（机构、平台）。 */
export const ENTITY_TAGS = ["央行", "证监会", "金融监管总局", "上交所", "深交所", "中金公司", "中信证券", "华泰证券", "东方财富", "易方达基金", "幻方量化", "蚂蚁集团"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  基金发行: "产品发行", 新基金: "产品发行", 募集: "产品发行", 首发: "产品发行", 发行: "产品发行", 新发: "产品发行", 成立: "产品发行",
  产品: "产品更新", 更新: "产品更新", 上线: "产品更新", 功能更新: "产品更新", 服务更新: "产品更新",
  政策: "政策/监管", 监管: "政策/监管", 法规: "政策/监管", 规则: "政策/监管", 立法: "政策/监管", 备案: "政策/监管",
  行情: "市场/行情", 市场: "市场/行情", 股市: "市场/行情", 股价: "市场/行情", 指数: "市场/行情", 大盘: "市场/行情", 交易: "市场/行情",
  公司动态: "机构动态", 经营动态: "机构动态", 动态: "机构动态", 机构: "机构动态", 战略: "机构动态", 合作: "机构动态", 业务: "机构动态",
  研报: "研报/研究", 研究报告: "研报/研究", 研究: "研报/研究", 报告: "研报/研究", 分析师: "研报/研究", 评级: "研报/研究", 目标价: "研报/研究", 论文: "研报/研究", paper: "研报/研究", papers: "研报/研究",
  数据: "数据/统计", 统计: "数据/统计", 排行: "数据/统计", 榜单: "数据/统计",
  融资: "并购/融资", 并购: "并购/融资", 收购: "并购/融资", 投资: "并购/融资", 重组: "并购/融资", 上市: "并购/融资", ipo: "并购/融资", IPO: "并购/融资", 再融资: "并购/融资", 增发: "并购/融资",
  人事: "人事/团队", 任命: "人事/团队", 高管变动: "人事/团队", 离职: "人事/团队", 团队: "人事/团队", 招聘: "人事/团队",
  处罚: "风险/处罚", 罚单: "风险/处罚", 立案: "风险/处罚", 风险: "风险/处罚", 违约: "风险/处罚", 爆雷: "风险/处罚", 合规: "风险/处罚", 诉讼: "风险/处罚",
  观点: "观点/策略", 策略: "观点/策略", 预测: "观点/策略", 评论: "观点/策略", 复盘: "观点/策略", 访谈: "观点/策略",
  宏观: "宏观/货币", 货币政策: "宏观/货币", 财政政策: "宏观/货币", 降准: "宏观/货币", 降息: "宏观/货币", 加息: "宏观/货币", 利率: "宏观/货币", 汇率: "宏观/货币", 通胀: "宏观/货币",
  其他: "其他", 综合: "其他", 非金融: "其他",
};

// ── 机构与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 机构主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；orgNames 是这家机构发消息时开头用的组织名，在它自己的主题页上读者知道说的是谁，
 * 可以省去；otherNames 是机构的其他称呼（官方账号名、子品牌）。
 * 所有这些名字都用来认出说的是哪家机构，比如把事实的主体对到发布方。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  pbc: { name: "中国人民银行", displayTag: "央行", aliases: ["中国人民银行", "央行", "人民银行", "PBoC"], orgNames: ["中国人民银行", "央行", "人民银行"] },
  csrc: { name: "中国证监会", displayTag: "证监会", aliases: ["中国证监会", "证监会", "CSRC"], orgNames: ["中国证监会", "证监会"] },
  nfra: { name: "国家金融监督管理总局", displayTag: "金融监管总局", aliases: ["国家金融监督管理总局", "金融监管总局", "银保监会", "NFRA"], orgNames: ["国家金融监督管理总局", "金融监管总局"] },
  safe: { name: "国家外汇管理局", displayTag: null, aliases: ["国家外汇管理局", "外汇局", "SAFE"], orgNames: ["国家外汇管理局", "外汇局"] },
  sse: { name: "上海证券交易所", displayTag: "上交所", aliases: ["上海证券交易所", "上交所", "SSE"], orgNames: ["上海证券交易所", "上交所"], otherNames: ["上交所发布"] },
  szse: { name: "深圳证券交易所", displayTag: "深交所", aliases: ["深圳证券交易所", "深交所", "SZSE"], orgNames: ["深圳证券交易所", "深交所"] },
  bse: { name: "北京证券交易所", displayTag: null, aliases: ["北京证券交易所", "北交所", "BSE"], orgNames: ["北京证券交易所", "北交所"] },
  csi: { name: "中证指数公司", displayTag: null, aliases: ["中证指数", "中证指数有限公司"], orgNames: ["中证指数有限公司", "中证指数"] },
  cicc: { name: "中金公司", displayTag: "中金公司", aliases: ["中金公司", "CICC"], orgNames: ["中金公司", "中国国际金融股份有限公司", "CICC"], otherNames: ["中金研究"] },
  "citic-sec": { name: "中信证券", displayTag: "中信证券", aliases: ["中信证券", "CITIC Securities"], orgNames: ["中信证券", "CITIC Securities"], otherNames: ["中信证券研究"] },
  huatai: { name: "华泰证券", displayTag: "华泰证券", aliases: ["华泰证券", "HTSC"], orgNames: ["华泰证券", "HTSC"], otherNames: ["华泰研究"] },
  "guotai-haitong": { name: "国泰海通证券", displayTag: null, aliases: ["国泰海通", "国泰君安", "海通证券"], orgNames: ["国泰海通证券", "国泰君安", "海通证券"], otherNames: ["国泰海通研究"] },
  "east-money": { name: "东方财富", displayTag: "东方财富", aliases: ["东方财富", "东方财富网", "East Money"], orgNames: ["东方财富", "东方财富网"], otherNames: ["东财", "股吧", "Choice"] },
  yifangda: { name: "易方达基金", displayTag: "易方达基金", aliases: ["易方达", "易方达基金"], orgNames: ["易方达基金", "易方达"] },
  gaoyi: { name: "高毅资产", displayTag: null, aliases: ["高毅资产"], orgNames: ["高毅资产"] },
  "high-flyer": { name: "幻方量化", displayTag: "幻方量化", aliases: ["幻方量化", "幻方", "High-Flyer"], orgNames: ["幻方量化", "幻方", "High-Flyer"] },
  ant: { name: "蚂蚁集团", displayTag: "蚂蚁集团", aliases: ["蚂蚁集团", "蚂蚁金服", "支付宝", "Ant Group"], orgNames: ["蚂蚁集团", "蚂蚁金服", "Ant Group"], otherNames: ["蚂蚁财富", "蚂蚁数科", "Alipay"] },
  pingan: { name: "中国平安", displayTag: null, aliases: ["中国平安", "平安集团", "平安银行", "平安证券", "平安资管", "Ping An"], orgNames: ["中国平安", "平安集团", "Ping An"] },
  cmb: { name: "招商银行", displayTag: null, aliases: ["招商银行", "招行", "CMB"], orgNames: ["招商银行", "招行"] },
  icbc: { name: "中国工商银行", displayTag: null, aliases: ["中国工商银行", "工商银行", "工行", "ICBC"], orgNames: ["中国工商银行", "工商银行", "工行"] },
  hundsun: { name: "恒生电子", displayTag: null, aliases: ["恒生电子", "恒生", "Hundsun"], orgNames: ["恒生电子", "Hundsun"] },
};

/**
 * 身份词典：摘要和标题里出现的机构，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "pbc", name: "中国人民银行", patterns: [/中国人民银行|人民银行|央行|\bpboc\b/i] },
  { id: "csrc", name: "中国证监会", patterns: [/证监会|\bcsrc\b/i] },
  { id: "nfra", name: "国家金融监督管理总局", patterns: [/金融监管总局|银保监会|\bnfra\b/i] },
  { id: "safe", name: "国家外汇管理局", patterns: [/外汇管理局|外汇局|\bsafe\b/] },
  { id: "sse", name: "上海证券交易所", patterns: [/上海证券交易所|上交所|\bsse\b/i] },
  { id: "szse", name: "深圳证券交易所", patterns: [/深圳证券交易所|深交所|\bszse\b/i] },
  { id: "bse", name: "北京证券交易所", patterns: [/北京证券交易所|北交所/i] },
  { id: "csi", name: "中证指数公司", patterns: [/中证指数/i] },
  { id: "cicc", name: "中金公司", patterns: [/中金公司|中金研究|\bcicc\b/i] },
  { id: "citic-sec", name: "中信证券", patterns: [/中信证券|\bcitics\b/i] },
  { id: "huatai", name: "华泰证券", patterns: [/华泰证券|\bhtsc\b/i] },
  { id: "guotai-haitong", name: "国泰海通证券", patterns: [/国泰海通|国泰君安|海通证券/i] },
  { id: "east-money", name: "东方财富", patterns: [/东方财富|东方财富网|\beast\s?money\b/i] },
  { id: "yifangda", name: "易方达基金", patterns: [/易方达/i] },
  { id: "gaoyi", name: "高毅资产", patterns: [/高毅资产/i] },
  { id: "high-flyer", name: "幻方量化", patterns: [/幻方|high-?flyer/i] },
  { id: "ant", name: "蚂蚁集团", patterns: [/蚂蚁集团|蚂蚁金服|蚂蚁数科|蚂蚁财富|支付宝|\balipay\b/i] },
  { id: "pingan", name: "中国平安", patterns: [/中国平安|平安集团|平安银行|平安证券|平安资管|平安人寿/i] },
  { id: "cmb", name: "招商银行", patterns: [/招商银行|招行|\bcmb\b/] },
  { id: "icbc", name: "中国工商银行", patterns: [/工商银行|工行|\bicbc\b/i] },
  { id: "hundsun", name: "恒生电子", patterns: [/恒生电子|\bhundsun\b/i] },
];

/** 这些域名上的文章，发布方就是对应的机构（托管平台如微信、微博不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "pbc", domains: ["pbc.gov.cn"] },
  { entityId: "csrc", domains: ["csrc.gov.cn"] },
  { entityId: "nfra", domains: ["nfra.gov.cn"] },
  { entityId: "safe", domains: ["safe.gov.cn"] },
  { entityId: "sse", domains: ["sse.com.cn"] },
  { entityId: "szse", domains: ["szse.cn"] },
  { entityId: "bse", domains: ["bse.cn"] },
  { entityId: "csi", domains: ["csindex.com.cn"] },
  { entityId: "cicc", domains: ["cicc.com"] },
  { entityId: "citic-sec", domains: ["citics.com"] },
  { entityId: "huatai", domains: ["htsc.com.cn"] },
  { entityId: "east-money", domains: ["eastmoney.com"] },
  { entityId: "yifangda", domains: ["efunds.com.cn"] },
  { entityId: "ant", domains: ["antgroup.com"] },
  { entityId: "pingan", domains: ["pingan.com"] },
  { entityId: "cmb", domains: ["cmbchina.com"] },
  { entityId: "icbc", domains: ["icbc.com.cn"] },
  { entityId: "hundsun", domains: ["hundsun.com"] },
];

/** 原文里的这些写法也算提到了对应机构。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "east-money", pattern: /@东方财富(?:网|证券)?/i },
  { entityId: "csrc", pattern: /证监会发布/i },
];
