// 数据口径：编年史图表的数据从哪来、怎么算、以及免责声明。原站《A股编年史》有同名页面。
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { pageMeta } from "@aihot/web/lib/seo";
import { Link } from "react-router";
import { ROUTES } from "../../catalog.ts";

export const handle: Screen = { tab: "chronicle", name: "数据口径" };

export function meta() {
  return pageMeta({
    title: "数据口径",
    description: "编年史图表的数据来源、处理逻辑与免责声明：指数行情图每日收盘后自动更新，其余为示例数据，不构成任何投资建议。",
    path: ROUTES.methodology,
  });
}

interface Block {
  n: string;
  title: string;
  paragraphs?: string[];
  items?: Array<[string, string]>;
}

const BLOCKS: Block[] = [
  {
    n: "1",
    title: "数据来源 (Data Sources)",
    items: [
      ["指数行情：", "上证综指、深证成指、沪深 300、创业板指、科创 50、中证 500 六只宽基指数的日线（开高低收与成交量）取自腾讯证券公开行情接口，每个交易日收盘后由本站自动刷新；回撤、年度回报、年内波动、波动率、季节性与收益分布这几张图由这份日线现算，因此同样随时间更新。"],
      ["公开接口：", "行情接口没有官方授权与可用性承诺，格式或口径可能随时调整，没有真实数据时显示缺失状态；示例只通过独立演示入口展示。"],
      ["示例数据：", "估值、行业权重、抱团组合等没有公开免费口径的图仍是源项目脚本随机生成的示例数据，只作界面演示与学习用途，不是真实行情。"],
      ["原口径：", "源项目《A股编年史》原本的取数是：宽基与行业指数的日度、月度收盘价取自交易所及中证指数公司公开披露的原始数据。"],
      ["超额收益：", "原项目里“茅指数”“宁组合”等自定义代理组合的超额收益，统一以沪深 300 指数作为比较基准扣减。"],
      ["估值数据：", "原项目的市盈率 (PE) 统一采用 TTM（滚动市盈率）口径，并剔除负值极值干扰。"],
    ],
  },
  {
    n: "2",
    title: "处理逻辑 (Processing Logic)",
    items: [
      ["回撤计算：", "以特定周期内的最高点为基准，计算每日收盘价相对前高的跌幅百分比。"],
      ["标准化：", "在跨资产、跨行业的比较图里，为消除绝对点位差异，把起始点位归一化为 100 同基期起跑。"],
      ["缺失值填充：", "非交易日或停牌造成的数据缺失，采用前值填充 (Forward Fill)。"],
    ],
  },
  {
    n: "3",
    title: "免责声明 (Disclaimer)",
    paragraphs: [
      "《A股编年史》是一个历史复盘与学术研究的静态档案库，本模块只把它收录进来作为阅读资讯时的背景知识。",
      "本站提供的所有数据、图表、归纳性总结及编辑陈述，均不构成任何形式的投资建议或财务指导。历史收益不代表未来表现，金融市场存在不可预测的尾部风险。",
    ],
  },
];

export default function ChronicleMethodology() {
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-14">
      <PhoneBar back={{ to: ROUTES.home, label: "A股编年史" }} title="数据口径" />
      <Link viewTransition to={ROUTES.home} className="hidden py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        ← A股编年史
      </Link>
      <header className="pt-4 lg:pt-0">
        <Kicker>编年史 · 数据口径</Kicker>
        <h1 data-page-title="" className="mt-4 text-[28px] font-black leading-[1.22] tracking-[-0.02em] text-ink lg:text-[36px]">
          数据口径
        </h1>
        <p className="mt-4 text-[14.5px] leading-[1.85] text-ink-3">
          长期历史回溯里，口径的一致比数字本身更重要。这一页说明编年史每张图表背后的数据从哪来、怎么算。
        </p>
      </header>

      {BLOCKS.map((block) => (
        <section key={block.n} className="pt-9">
          <div className="flex items-baseline gap-3 border-b border-line pb-3">
            <span className="num text-[12px] font-bold tracking-[0.18em] text-accent">{block.n}</span>
            <h2 className="text-[17px] font-bold text-ink">{block.title}</h2>
          </div>
          {block.paragraphs?.map((text) => (
            <p key={text} className="mt-3 text-[14px] leading-[1.9] text-ink-2">
              {text}
            </p>
          ))}
          {block.items && (
            <ul className="mt-4 space-y-2.5">
              {block.items.map(([lead, text]) => (
                <li key={lead} className="flex gap-2.5 text-[14px] leading-[1.8] text-ink-2">
                  <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <span className="min-w-0">
                    <strong className="font-semibold text-ink">{lead}</strong>
                    {text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <footer className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-[12.5px] text-ink-4">
        <Link viewTransition to={ROUTES.api} className="transition-colors hover:text-accent">
          数据接口
        </Link>
        <span>内容收录自开源项目 A股编年史（oliverran/the-history-of-a-stock）</span>
      </footer>
    </div>
  );
}
