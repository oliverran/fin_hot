<p align="center">
  <b>FinHOT</b><br>
  金融行业的资讯聚合与日报站：把一批金融信源里的消息筛一遍、聚成事件，再出一份读得完的日报。
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-176b75?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Node.js-24-176b75?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/PostgreSQL-17-176b75?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 17">
  <img src="https://img.shields.io/badge/Docker-Compose-176b75?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
</p>

<p align="center">
  <b>简体中文</b> · <a href="README.en.md">English</a>
</p>

<br>

## 致谢：这个项目从哪来

FinHOT **基于数字生命卡兹克（Khazix）开源的 [AIHOT](https://github.com/KKKKhazix/AIHOT) 框架改造**而来。

这个项目里真正难的那部分，全部来自 AIHOT：六种信源的采集、预筛、同一份标准独立打两次分、中文写作与翻译、事件聚簇与热度算法，以及整套公开的提示词和入选门槛。卡兹克把一套线上跑着的引擎直接开源，才让“给另一个行业做一份热点站”变得可行。**在这里向卡兹克和 AIHOT 项目致以诚挚的谢意。**

FinHOT 在 AIHOT 的框架上做的是行业替换，改的都是站点自己的东西：

- **站名与品牌**：FinHOT、行业词「金融」、首页与关于页文案、报头、MCP 前缀 `finhot`（`site/`）
- **行业分类与主题**：7 个分类（AI金融、政策监管、市场、公募私募、行业动态、研究、观点）与配套标签（`industry/taxonomy.ts`、`industry/topics.json`）
- **信源**：22 个金融示范信源，涵盖证监会、上交所、中国人民银行、财政部、国家统计局、金融监管总局等官方信源，以及东方财富研报、财联社、证券时报等财经媒体（`industry/sources.json`）
- **提示词与门槛**：17 份提示词金融化，入选门槛按信源分级设为 T1 60 / T1.5 65 / T2 76（`industry/prompts/`、`industry/selection.ts`）
- **模型**：默认模型由 `.env` 的 `LLM_*` 指定，`site/models.ts` 里把 Kimi 配成了默认模型的备用
- **编年史标签页**：把 A 股历史做成一档可以单独读的栏目，看资讯时顺手补上「这波行情、这些板块从哪来」的背景（`modules/chronicle/`）

框架本身（`apps/`、`packages/`）没有改；只有这个站要用的编年史做成了独立模块，放在 `modules/`。AIHOT 的名字和 Logo 也没有拿来用。

## 这是什么

FinHOT 每天从一批金融信源里收资料。模型先判断是不是这个行业的事、有没有实际信息，可能重要的再用同一份标准独立打两次分，写出中文标题和摘要；不同来源报道的同一件事聚成一个**事件**，按有多少人在说排热度；每天早上出一份日报，每周一出周报，每月 1 日出月报。

它只做**新闻、政策与研究**这一层：监管公告、政策解读、A 股与公募私募的市场动态、券商研报的观点与框架、行业机构的经营与人事。**不收录专业行情数据**（实时价格、K 线、盘口），也不是行情终端。编年史提供日线复盘、申万行业估值与轮动，以及基金披露持仓、ETF份额和两融等市场背景。付费数据接入与同步见 [Pro 数据说明](docs/pro-data.md)，不提供实时盘口。

## 它是怎么工作的

一条资料从信源进来，先判重，再预筛；可能重要的独立打两次分，写好中文标题和摘要，和别的报道聚成事件，算进热度。分数过了门槛、又不是精选里已有新闻的重复，才进精选；日报按规则编出当天要闻，周报、月报再从日报里汇编。每一步的提示词都在 [`industry/prompts/`](industry/prompts/)，改标准不用改代码。详见 [精选与校准](docs/selection.md)。

**聚簇与热度**：先用标题摘要的向量（没配向量服务时比文字重合度）在最近两周里找候选，再让模型判断是同一件事、后续进展，还是两件事。热度按事件算，不按文章算：48 小时内每个独立来源只算一次，24 小时减半，所以排在前面的，是真正有很多人在说的事。

## 你会得到什么

| | |
|---|---|
| **六种信源** | RSS、网页列表、JSON 接口、X 账号、微信公众号，以及你自己脚本推送进来的内容。信源分三级（官方一手、官方账号与准官方、媒体与个人），各级入选门槛不同；抓取频率按产出自动调整 |
| **精选** | 预筛，同一份评分标准独立打两次分，再按信源分级的门槛决定入选；同一条新闻只占一条，换个说法的重复不进。提示词和门槛全部可以改，用你自己标注的样本在 SelectBench 里校准 |
| **写作** | 中文标题、答案先行的摘要、推荐理由，外文全文翻译；分类、标签和新闻事实单独抽取；防止模型把原文没提到的公司写进标题 |
| **聚簇** | 不同来源报道的同一件事聚成一个事件，后续进展挂在同一个事件下，事件页有综述；人工改过的归属不会被覆盖 |
| **热点** | 按事件算热度：独立来源越多越靠前，讨论也算进来；和 6 小时前比，涨得快的标上升，新出现的标“新” |
| **日报、周报、月报** | 每天 08:00 出日报，按规则编出当天要闻；每周一 10:00 出周报、每月 1 日 10:30 出月报，从日报里汇编。出刊时间在 `site/site.ts` 的 `EDITION_TIMES` 里改 |
| **主题与搜索** | 机构与产品、方向与市场三类主题页；标题摘要搜索和全文相关搜索 |
| **编年史** | 连着资讯一起读的 A 股历史栏目：宽基指数走势、回撤、年度回报、年内波动、波动率、季节性与收益分布，以及行业的兴衰轮动；每张图配一段背景说明。核心宽基指数的行情接公开接口，每个交易日收盘后自动更新，其余为示例数据 |
| **给 Agent 用** | RSS（精选、全部、全文、日报、周报、月报）、公开 API、MCP、Agent Markdown、`llms.txt`，同一份内容给人看也给 Agent 用 |
| **后台** | 信源管理与试抓、内容诊断与人工评分更正、精选评测、每一步单独换模型、付费服务的预算熔断、运行记录与告警 |

## 跑起来

需要 [Docker](https://docs.docker.com/get-started/get-docker/)、[Node.js 24](https://nodejs.org/en/download)（运行 `init-env` 生成配置要用），和一个 OpenAI 兼容的模型 API Key。

`init-env` 默认按 DeepSeek 配置。换成别的服务商，照 `.env.example` 里的例子改 `.env` 的 `LLM_BASE_URL`、`LLM_MODEL` 和 `LLM_EXTRA_JSON`；用推理模型（先想再答）时，还要设 `LLM_REASONING_TOKENS` 给推理留出输出额度。

```bash
git clone https://github.com/oliverran/fin_hot.git finhot
cd finhot
node scripts/init-env.ts --llm-key <你的模型 API Key>
docker compose up -d --build
```

打开 <http://localhost:3000>。后台在 `/admin`，管理员密码在 `.env` 的 `ADMIN_PASSWORD` 里。一两分钟后开始有内容，第一次导入的资料大约半小时处理完。

站点跑起来后，打开 `/agent` 可以复制 MCP、RSS 或 API 的接入方式；只能读网页的 Agent 从 `/api/v1/agent` 开始；接口说明在 `/openapi-v1.json`。部署、域名与 HTTPS、在中国大陆用代理抓海外信源，见 [部署](docs/deploy.md)。

## 继续改这个站

要改的东西几乎都在 [`site/`](site/) 和 [`industry/`](industry/) 里，代码基本不用动：

| 文件 | 改什么 |
|---|---|
| `site/site.ts` | 站名、行业词、出刊时间、首页文案、关于页、条目与报告上的说法、公开接口的分类 |
| `industry/taxonomy.ts`、`industry/topics.json` | 分类、标签、主题 |
| `industry/sources.json` | 首次启动时导入的信源 |
| `industry/prompts/` | 精选标准与写作要求，**行业 KnowHow 就写在这里** |
| `industry/selection.ts` | 入选门槛 |
| `site/models.ts` | 每一步默认用哪个模型（不改也行：都用 `.env` 里配的那一个） |
| `site/brand/`、`site/pages/`、`site/public/`、`site/changelog.json` | 图标与 Logo、使用规则与隐私说明、发布在网站根目录的文件、更新日志 |
| `modules/chronicle/` | 编年史标签页：图表清单与文案（`catalog.ts`）、行情来源与刷新节奏（`backend/`）。这个站自己的模块，不随框架走 |

最值得花时间的是评分标准（`industry/prompts/selection-score.md`）和门槛：拿一两百条自己标注过的资料，用 `scripts/eval-selection.ts` 跑一遍，看它选得准不准，再回去改。怎么做写在 [精选与校准](docs/selection.md) 里。

## 文档

| 文档 | 内容 |
|---|---|
| [把它改成你的行业](docs/customize.md) | 站名、分类、主题、信源、提示词、门槛、模型、品牌，一步一步来 |
| [信源](docs/sources.md) | 六种信源怎么配，分级与全文，抓取频率，外部推送接口 |
| [精选与校准](docs/selection.md) | 一条资料怎么变成精选、怎么编进日报周报月报，怎么用自己的样本校准 |
| [事件归组与关系评测](docs/grouping.md) | 事件关系怎么判断，怎么用自己标注的成对样本评测 |
| [综述评测](docs/story-digest-evaluation.md) | 改事件综述提示词前，怎么在同一批事件上并排比较 |
| [部署](docs/deploy.md) | Docker、域名和 HTTPS、中国大陆、更新、备份、花多少钱 |
| [架构](docs/architecture.md) | 三个进程、几条不变的规则、目录、模块、数据库迁移、对外出口、测试 |

技术栈：Node.js 24 · TypeScript · React Router（服务端渲染）· Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose。

## 许可

代码沿用 AIHOT 的 [MIT 许可证](LICENSE)。**AIHOT 的名字和 Logo 不在许可范围内**，FinHOT 也没有使用它们。字体有自己的许可，见 [NOTICE](NOTICE)。

再次感谢 [数字生命卡兹克](https://github.com/KKKKhazix) 与 [AIHOT](https://github.com/KKKKhazix/AIHOT) 项目。
