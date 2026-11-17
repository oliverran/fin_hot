// 抱团卷的固定成分名单：四代「抱团」专题，外加更早的四个主题。
// 名单按公开认知起草、固定等权、不调仓，只用来看「当时市场的共识」大致长什么样，
// 不是任何官方指数，也不回填今天的赢家（见 docs/chronicle-cluster-rules.md）。
// 代码用提供方式写法（600519.SH），抓日线时再换成腾讯写法（sh600519）。

/** 一个主题/专题的成分股清单。 */
export interface ClusterGroup {
  /** 组合名，同时是走势图的系列名。 */
  name: string;
  /** 成分股（提供方式代码）。 */
  stocks: readonly string[];
}

/** 四代「抱团」专题，每个各自成一张走势图。 */
export interface ClusterCombo extends ClusterGroup {
  /** 图表地址里的 slug；与 catalog.ts 的 clusters 页一一对应。 */
  slug: string;
}

export const CLUSTER_COMBOS: readonly ClusterCombo[] = [
  {
    slug: "liquor-club",
    name: "茅指数",
    stocks: [
      "600519.SH", "600809.SH", "000568.SZ", "000858.SZ", "002304.SZ", "600887.SH", "603288.SH",
      "000333.SZ", "000651.SZ", "601888.SH", "600036.SH", "600276.SH", "603259.SH", "601012.SH",
      "300750.SZ", "002594.SZ", "600309.SH", "600031.SH", "002415.SZ", "002475.SZ", "300059.SZ",
      "601899.SH", "600900.SH", "300760.SZ", "600436.SH", "000538.SZ", "601318.SH",
    ],
  },
  {
    slug: "ning-combo",
    name: "宁组合",
    stocks: [
      "300750.SZ", "002594.SZ", "601012.SH", "600438.SH", "300274.SZ", "300014.SZ", "002812.SZ",
      "002709.SZ", "002460.SZ", "002466.SZ", "603799.SH", "603659.SH", "300073.SZ", "300037.SZ",
      "300450.SZ", "300124.SZ", "002459.SZ", "688599.SH", "300763.SZ", "002850.SZ", "300568.SZ",
      "600884.SH", "601865.SH", "688063.SH",
    ],
  },
  {
    slug: "special-valuation",
    name: "中特估",
    stocks: [
      "601728.SH", "600941.SH", "601857.SH", "600028.SH", "600938.SH", "601088.SH", "601668.SH",
      "601186.SH", "601390.SH", "601800.SH", "601669.SH", "601868.SH", "601398.SH", "601939.SH",
      "601288.SH", "601988.SH", "601328.SH", "600050.SH", "601766.SH", "601985.SH", "600900.SH",
      "003816.SZ", "601628.SH", "601601.SH", "600019.SH", "601225.SH",
    ],
  },
  {
    slug: "ai-compute",
    name: "AI 算力",
    stocks: [
      "300308.SZ", "300502.SZ", "300394.SZ", "002281.SZ", "603083.SH", "300570.SZ", "601138.SH",
      "000977.SZ", "603019.SH", "000938.SZ", "688041.SH", "688256.SH", "688047.SH", "300474.SZ",
      "002463.SZ", "300476.SZ", "600183.SH", "002916.SZ", "300442.SZ", "603881.SH", "688158.SH",
      "000034.SZ", "002261.SZ", "300496.SZ",
    ],
  },
];

/** 更早的四个主题，合成「历史祖谱」那张多线图。 */
export const CLUSTER_THEMES: readonly ClusterGroup[] = [
  {
    name: "金融",
    stocks: [
      "600036.SH", "600000.SH", "600016.SH", "601398.SH", "601939.SH", "601988.SH", "601288.SH",
      "601328.SH", "601166.SH", "600030.SH", "601318.SH", "601601.SH", "600837.SH", "000001.SZ",
      "601688.SH", "600999.SH",
    ],
  },
  {
    name: "资源",
    stocks: [
      "601088.SH", "601899.SH", "600362.SH", "000878.SZ", "600547.SH", "600489.SH", "601600.SH",
      "600019.SH", "000983.SZ", "601699.SH", "600188.SH", "000933.SZ", "600123.SH", "000060.SZ",
      "000630.SZ",
    ],
  },
  {
    name: "地产",
    stocks: [
      "000002.SZ", "600048.SH", "001979.SZ", "600383.SH", "000069.SZ", "000402.SZ", "600325.SH",
      "000031.SZ", "600606.SH", "600663.SH",
    ],
  },
  {
    name: "消费",
    stocks: [
      "600519.SH", "000858.SZ", "000568.SZ", "600809.SH", "000596.SH", "002304.SZ", "600887.SH",
      "000895.SZ", "600600.SH", "000729.SZ", "000869.SZ", "603288.SH", "000651.SZ", "000333.SZ",
    ],
  },
];

/** 全部组合（四代专题 + 四个古早主题），合成走势用的是这一份。 */
export const CLUSTER_GROUPS: readonly ClusterGroup[] = [...CLUSTER_COMBOS, ...CLUSTER_THEMES];

/** 提供方式代码 → 腾讯写法：600519.SH → sh600519，000858.SZ → sz000858。 */
export function tencentCode(code: string): string {
  const [number, market] = code.split(".");
  return `${market === "SH" ? "sh" : "sz"}${number}`;
}

/** 要抓日线的成分股（去重后的腾讯写法）。 */
export const CLUSTER_CODES: readonly string[] = [
  ...new Set(CLUSTER_GROUPS.flatMap((group) => group.stocks.map(tencentCode))),
];

/** 这个 slug 对应的抱团专题名；不是抱团专题时返回 undefined。 */
export function comboNameOf(slug: string): string | undefined {
  return CLUSTER_COMBOS.find((combo) => combo.slug === slug)?.name;
}
