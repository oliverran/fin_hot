// Compile the website's reading order into an offline native reader. Chart values stay on the API.
import { GROUPS, pageOf, ROUTES, type ChartPage } from "../modules/chronicle/catalog.ts";
import { SITE_PROLOGUE, VOLUME_META, chapterLead, panelOf } from "../modules/chronicle/web/narrative.ts";
import { TIMELINE } from "../modules/chronicle/web/timeline.ts";
import shell from "../historyofmarket/web/src/shell/volumes.json" with { type: "json" };
import { panels, ui } from "../historyofmarket/web/src/hom/i18n-cn.js";

const usGuides: Record<string, string> = {
  overview: "先把价格曲线拉长，再把指数拆成公司。指数可以维持一个世纪，创造财富的公司却换过好几轮。",
  sp500: "一百年的平均收益，放回一个具体年份会是什么样？先看逐年成绩，再看少数交易日、盈利和估值怎样改变结果。",
  cross: "从纳斯达克综指的起点读到纳指 100。交易所的全貌与头部公司的表现，有时会给出截然不同的市场印象。",
  semi: "从费城半导体指数走过的繁荣和衰退读起，再把芯片周期、估值与指数成分放到一起看。",
  xlk: "信息科技板块 ETF 成立不久就撞上互联网泡沫。今天回看它的曲线，还要问各个时期有哪些公司被计入科技板块。",
  fin: "金融危机在银行股曲线上留下了什么？沿着危机前后的持仓、回撤与收益率曲线，追踪金融板块的重构。",
  consumer: "用可选消费与必需消费两条线并读同一个商业周期，再看定价权、行业分类与估值怎样改变比较。",
  mag7: "七家公司共用一个名字，收入来源与投资节奏却各有不同。从组合表现读到资本支出，再对照个股之间的联动。",
  dynasties: "按年代翻阅美国市值前十的公司名册。谁留下、谁退榜，以及退榜后发生了什么，串起了行业地位的更替。",
  latest: "用专题研究回看市场集中度、回撤后的表现、股票发行与回购，以及个别公司对长期回报的贡献。"
};
const nativeUsPanel: Record<string, string> = { annual: "sp500/annual-returns", "nasdaq100-annual": "ndx/annual-returns" };
const comparisonCharts: Record<string, string[]> = {
  "ch-front-patience": ["sp500/price"], "ch-front-coordinates": ["dow/century"], "ch-nx-shape": ["ndx/price"],
};

export function androidChronicle(nativePages: readonly ChartPage[]) {
  const native = new Set(nativePages.map(p => p.group + "/" + p.slug));
  const aVolumes = GROUPS.map(g => ({
    id: g.key, title: g.label, blurb: VOLUME_META[g.key].blurb, intro: VOLUME_META[g.key].prologue,
    chapters: g.sections.map(section => ({
      id: section.n, title: section.title.split(" (")[0], lead: chapterLead(g.key, section.n),
      passages: section.slugs.map(slug => {
        const page = pageOf(g.key, slug);
        if (!page) throw new Error(`Missing chapter page ${g.key}/${slug}`);
        const id = g.key + "/" + slug;
        const extras = panelOf(g.key, slug);
        return { id, title: page.heroTitle.split(" (")[0], intro: page.heroLead, body: extras.analysis,
          chart: native.has(id) ? id : undefined, path: native.has(id) ? undefined : ROUTES.page(g.key, slug),
          notes: page.sections?.map(part => ({
            title: part.title.split(" (")[0],
            paragraphs: [...(part.paragraphs ?? []), ...(part.items ?? []).map(text =>
              text.startsWith("数据来源：") ? "数据来源以图表实际响应为准。" :
              text.startsWith("时间范围：") ? "指数基日与实际数据覆盖范围见图表标注。" : text)]
          })), related: extras.related };
      })
    }))
  }));
  const timeline = { id: "timeline", title: "大事记", blurb: "按年代回看制度变迁、市场转折与代表公司。", intro: [],
    chapters: TIMELINE.map(era => ({ id: era.key, title: era.label, lead: era.intro,
      notes: era.stocks?.length ? [{ title: "这一时期的代表公司", paragraphs: era.stocks.map(s => s.name + " · " + s.note) }] : undefined,
      passages: era.events.map(event => ({ id: era.key + "/" + event.date + "/" + event.title, title: event.title,
        caption: event.date, intro: event.summary, body: event.stocks?.map(stock => stock.name + " · " + stock.note) }))
    })) };
  const usVolumes = shell.volumes.map(volume => {
    const tab = volume.tab;
    if (!usGuides[tab]) throw new Error("Missing volume guide: " + tab);
    return { id: tab, title: ui["tab." + tab], blurb: usGuides[tab], intro: [],
      chapters: volume.chapters.map(c => ({
        id: c.slug, title: c.title.cn, lead: c.deck.cn, comparisons: comparisonCharts[c.slug],
        passages: c.panels.map(id => {
          const title = panels[id + ".title"];
          if (!title) throw new Error("Missing panel title: " + id);
          const segment = tab === "cross" ? "nasdaq" : tab;
          const path = tab === "overview" ? "/us-market/zh-cn/#panel-" + id : `/us-market/zh-cn/${segment}/${id}/`;
          return { id, title, intro: panels[id + ".plainDesc"] ?? panels[id + ".subtitle"], path,
            body: ui["note." + id + ".body"]?.split(/\n\s*\n/),
            chart: nativeUsPanel[id] ? "us/" + nativeUsPanel[id] : undefined };
        })
      })) };
  });
  return {
    a: { title: "A 股编年史", intro: SITE_PROLOGUE, volumes: [...aVolumes, timeline] },
    us: { title: "美股编年史", intro: [
      "同样是一条向上的百年曲线，沿途的经历却大不相同。先从卷首看牛熊如何交替、财富由哪些公司创造，再分别读标普 500 和纳斯达克。",
      "接下来的行业卷把半导体、科技、金融与消费放回各自的周期。最后再读七姐妹与历代市值前十，看每个时代的领跑者如何交班。"
    ], volumes: usVolumes }
  };
}
