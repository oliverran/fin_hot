<h1 align="center">FinHOT</h1>

<p align="center">
  <b>把分散的金融资讯，整理成可追溯的事件与每日简报。</b><br>
  可自部署的金融资讯聚合站：AI 筛选与摘要、事件聚合、日报周报月报，以及 A 股与美股历史背景。
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-176b75?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/oliverran/fin_hot/actions/workflows/check.yml"><img src="https://github.com/oliverran/fin_hot/actions/workflows/check.yml/badge.svg?branch=main" alt="Check workflow status"></a>
  <img src="https://img.shields.io/badge/Node.js-24-176b75?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/Docker-Compose-176b75?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
</p>

<p align="center">
  <b>简体中文</b> · <a href="README.en.md">English</a><br>
  <a href="#快速开始">快速开始</a> · <a href="#接入你的-agent-或阅读器">Agent / RSS</a> · <a href="docs/deploy.md">部署文档</a> · <a href="#数据边界与当前状态">数据与状态</a>
</p>

基于数字生命卡兹克（Khazix）的 [AIHOT](https://github.com/KKKKhazix/AIHOT) 开源框架，面向金融行业配置了信源、评分标准与写作提示词，并扩展了编年史模块。[项目来源与许可 ↓](#项目来源与许可)

## 你能用它做什么

- **每天读一份金融简报**：从监管公告、财经媒体和研报中筛选信息，保留来源与原文链接，减少重复阅读。
- **按事件追踪进展**：把多个来源对同一件事的报道归到一起，查看后续进展和讨论热度。
- **把新闻放回市场背景**：在编年史中查看指数走势、回撤、行业轮动与历史图表，再回到资讯理解当下。
- **搭建自己的信息工作流**：通过 RSS、公开 API、MCP 或 Agent Markdown，把站内内容接入阅读器和 Agent。

适合金融资讯读者、研究者，以及想自建垂直资讯站的开发者。界面与默认生成内容以中文为主。

## 从信源到日报

```text
采集 → 去重与预筛 → 两次独立评分 → 中文标题与摘要 → 事件归组 → 精选与报告
                                                     └→ RSS / API / MCP
```

| 能力 | 当前实现 |
|---|---|
| **金融信源** | 内置 25 个示范信源配置，涵盖证监会、央行、上交所、财经媒体和东方财富研报。框架支持 RSS、网页列表、JSON 接口、X、微信公众号与外部推送；部分类型需另配服务凭据 |
| **可调整的筛选标准** | 先预筛，再按同一标准独立评分两次；官方一手、准官方、媒体与个人分别使用 T1 60 / T1.5 65 / T2 76 门槛。提示词、分类和门槛均可编辑 |
| **事件与热点** | 同一事件的多篇报道归组，后续进展关联到事件；按独立来源数与时间衰减计算热度，避免把转载数量直接当成重要性 |
| **定期简报** | 默认北京时间每天 08:00 日报、每周一 10:00 周报、每月 1 日 10:30 月报；时间可在 `site/site.ts` 修改，出刊依赖可用内容与正常运行的 worker |
| **编年史** | A 股宽基指数与历史图表、美股编年史子应用；可选接入 Tushare 的行业估值、公司指标、市场背景和基金披露持仓。数据来源与覆盖不同，见下方说明 |
| **运营后台** | 信源试抓与管理、评分诊断、精选评测、分步骤模型配置、付费请求上限、运行记录与告警 |

评分与写作提示词在 [`industry/prompts/`](industry/prompts/)。精选规则、去重与校准方法见[精选与校准](docs/selection.md)，事件归组见[归组与关系评测](docs/grouping.md)。

## 快速开始

需要 **Docker Compose**、**Node.js 24.22.1 或更新版本**，以及一个 OpenAI 兼容的模型 API Key。Docker 会启动 PostgreSQL 17、API、worker 和网页服务。

### 1. 下载并生成配置

```bash
git clone https://github.com/oliverran/fin_hot.git finhot
cd finhot
node scripts/init-env.ts
```

脚本会生成 `.env`、随机密钥与管理员密码。用本机编辑器打开 `.env`，填写 `LLM_API_KEY`；换模型服务商时，同时修改 `LLM_BASE_URL`、`LLM_MODEL` 和相应的 `LLM_EXTRA_JSON`。默认配置示例使用 DeepSeek，推理模型还需按服务要求设置 `LLM_REASONING_TOKENS`。不要提交 `.env` 或把密钥写进命令历史。

**启动前确认费用与开关：**生成的 `.env` 默认开启 `COLLECT_ENABLED=true` 和 `MODEL_CALLS_ENABLED=true`，启动后会采集与调用模型，可能产生费用。只看站点结构时，可先将两项都设为 `false`；此时不会自动生成新闻内容。其他可选数据同步和手动试抓有各自开关或操作，详见部署与信源文档。

### 2. 启动并查看

```bash
docker compose up -d --build
docker compose ps
```

- 网页：<http://localhost:3000>
- 后台：<http://localhost:3000/admin>，使用 `.env` 中的 `ADMIN_PASSWORD`
- Agent 接入说明：<http://localhost:3000/agent>

首次构建、采集与处理所需时间取决于网络、信源和模型服务。页面暂时没有内容时，先在后台检查信源与运行记录，也可查看日志：

```bash
docker compose logs --tail=100 api worker web
```

服务器部署还需配置实际的 `SITE_URL`、域名与 HTTPS。更新、备份、代理和不用 Docker 的运行方式见[部署文档](docs/deploy.md)。

## 接入你的 Agent 或阅读器

站点运行后，从 `/agent` 选择适合的接入方式；以下路径相对于你的站点地址。

| 入口 | 用途 |
|---|---|
| `/agent` | 查看并复制 MCP、RSS 与 API 接入说明 |
| `/api/mcp` | MCP 服务，工具名前缀为 `finhot` |
| `/api/v1/agent` | 面向只能读取网页的 Agent 的 Markdown 入口 |
| `/openapi-v1.json` | 公开 API 的 OpenAPI 描述 |
| `/llms.txt` | 站点与内容入口说明 |

RSS 包含精选、全部动态、全文及日报 / 周报 / 月报订阅；全文是否可用取决于信源授权与配置。无需为 Agent 重新生成一份内容。

## 数据边界与当前状态

- **新闻与摘要**：AI 评分和摘要可能出错，重要信息应回到原文核对。示范信源是可编辑的配置，不代表所有来源始终可用或已授权全文再分发。
- **A 股数据**：部分宽基图表读取公开行情接口，其他图表可能使用示例或历史快照；以页面标注的来源、日期和覆盖范围为准。首页分时 / 日 K 可能有延迟。
- **Pro 数据**：Tushare 需自备 token 与相应数据权限，相关同步默认关闭。基金披露持仓有披露滞后，样本覆盖不等于全市场，ETF 份额变化不等于资金净流入。见 [Pro 数据说明](docs/pro-data.md)。
- **美股数据**：编年史子应用使用随仓库附带的数据快照，并支持从 `historyofmarket.com` 刷新；上游不可用时可能仍显示旧数据，不能把计划刷新等同于数据已经更新。
- **用途**：用于资讯阅读与历史研究，不提供交易执行或收益保证，也不构成投资建议。
- **构建状态**：请以 [GitHub Actions](https://github.com/oliverran/fin_hot/actions/workflows/check.yml) 为准。2026-11-02 的 [`1a8b866` 检查](https://github.com/oliverran/fin_hot/actions/runs/41436941077)中，类型检查、网页构建、62 项网页测试和 Docker 冒烟检查通过；后端测试 952/981 通过、29 项失败，主检查的后续冒烟步骤未运行。这不是全量回归通过的发布版本。

## 按你的研究范围调整

| 配置位置 | 可以调整什么 |
|---|---|
| [`site/site.ts`](site/site.ts) | 站名、首页与关于页文案、出刊时间、公开接口说明 |
| [`industry/sources.json`](industry/sources.json) | 首次启动导入的示范信源；运行后的信源在后台管理 |
| [`industry/taxonomy.ts`](industry/taxonomy.ts)、[`industry/topics.json`](industry/topics.json) | 分类、标签与主题 |
| [`industry/prompts/`](industry/prompts/)、[`industry/selection.ts`](industry/selection.ts) | 评分、写作标准与分级门槛 |
| [`site/models.ts`](site/models.ts) | 分步骤模型与备用模型配置，需提供对应服务凭据 |
| [`modules/chronicle/`](modules/chronicle/) | 编年史页面、图表目录与数据接入 |

建议先用自己标注的样本运行 `scripts/eval-selection.ts`，再决定是否调整评分与门槛。完整步骤见[定制指南](docs/customize.md)。

## 文档与参与

- [部署与运维](docs/deploy.md)：环境、域名、HTTPS、更新、备份与费用。
- [信源配置](docs/sources.md)：六种采集方式、字段、权限与外部推送。
- [精选与校准](docs/selection.md) · [事件归组](docs/grouping.md) · [综述评测](docs/story-digest-evaluation.md)。
- [架构](docs/architecture.md)：进程边界、模块、数据库迁移、公开出口与测试。
- [Pro 数据](docs/pro-data.md)：行业、市场、公司与基金数据的覆盖和限制。
- [提交问题或建议](https://github.com/oliverran/fin_hot/issues)：请附版本、复现步骤与已脱敏日志，不要上传密钥或 `.env`。

技术栈：Node.js 24 · TypeScript · React Router（SSR）· Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose。

## 项目来源与许可

FinHOT 基于[数字生命卡兹克（Khazix）](https://github.com/KKKKhazix)开源的 [AIHOT](https://github.com/KKKKhazix/AIHOT)。采集、预筛、双次评分、写作与翻译、事件归组、热度计算和公开内容接口等能力来自这一框架。感谢原作者与贡献者。

本仓库在此基础上配置金融信源、分类、提示词、门槛与品牌，并加入编年史模块。A 股编年史内容来源见 [`modules/chronicle/catalog.ts`](modules/chronicle/catalog.ts)；美股子应用及其数据位于 [`historyofmarket/`](historyofmarket/)，刷新逻辑见 [`backend/us-market.ts`](modules/chronicle/backend/us-market.ts)。

代码沿用 [MIT 许可证](LICENSE)。**AIHOT 的名字和 Logo 不在许可范围内**；FinHOT 使用自己的品牌。字体及其他第三方材料见 [NOTICE](NOTICE)，新闻与数据仍受各自来源的权利和使用条款约束。
