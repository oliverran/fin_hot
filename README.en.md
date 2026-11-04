<h1 align="center">FinHOT</h1>

<p align="center">
  <b>Turn scattered financial news into source-linked events and daily briefings.</b><br>
  A self-hosted finance news hub with AI screening, summaries, event clustering, scheduled reports, and A-share and US market history.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-176b75?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/oliverran/fin_hot/actions/workflows/check.yml"><img src="https://github.com/oliverran/fin_hot/actions/workflows/check.yml/badge.svg?branch=main" alt="Check workflow status"></a>
  <img src="https://img.shields.io/badge/Node.js-24-176b75?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/Docker-Compose-176b75?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
</p>

<p align="center">
  <a href="README.md">简体中文</a> · <b>English</b><br>
  <a href="#quick-start">Quick start</a> · <a href="#connect-your-agent-or-reader">Agent / RSS</a> · <a href="docs/deploy.md">Deployment</a> · <a href="#data-boundaries-and-project-status">Data and status</a>
</p>

Built on [AIHOT](https://github.com/KKKKhazix/AIHOT) by Khazix (数字生命卡兹克), with finance-specific sources, scoring criteria, writing prompts and a Chronicle module. [Attribution and license ↓](#attribution-and-license)

## What you can do

- **Read a financial briefing each day.** Screen regulatory notices, financial media and research reports, with source links and less repeated coverage.
- **Follow events rather than individual headlines.** Group reports about the same story and track follow-ups and attention across sources.
- **Read news alongside market history.** Explore index trends, drawdowns, sector rotation and historical charts in the Chronicle.
- **Build your own information workflow.** Connect a reader or agent through RSS, the public API, MCP or Agent Markdown.

For financial-news readers, researchers and developers building a self-hosted vertical news site. The interface and generated content are primarily in Chinese; this English README does not imply an English-language UI.

## From source to briefing

```text
Collect → Deduplicate and pre-screen → Score twice → Write summaries → Group events → Select and publish
                                                                          └→ RSS / API / MCP
```

| Capability | Current implementation |
|---|---|
| **Financial sources** | 25 example source configurations, including Chinese regulators, financial media and Eastmoney research. The framework supports RSS, web lists, JSON APIs, X, WeChat Official Accounts and external ingestion; some require separate service credentials |
| **Editable selection criteria** | Pre-screening followed by two independent scores on one rubric. Thresholds are T1 60 / T1.5 65 / T2 76 for first-hand official, semi-official, and media or individual sources. Edit the prompts, taxonomy and thresholds |
| **Events and trends** | Cluster reports about the same event and associate follow-ups. Heat uses independent sources and time decay, rather than treating every repost as new evidence of importance |
| **Scheduled reports** | Defaults: daily at 08:00, weekly on Monday at 10:00, monthly on the 1st at 10:30, all Beijing time (UTC+8). Edit `site/site.ts`; publication depends on available content and a running worker |
| **Chronicle** | A-share indices and historical charts, plus an embedded US market-history app. Optional Tushare integration adds sector valuations, company metrics, market context and disclosed fund holdings. Data coverage varies |
| **Admin tools** | Source previews and management, score diagnostics, selection evaluation, per-step models, paid-request limits, run history and alerts |

Prompts live in [`industry/prompts/`](industry/prompts/). See [selection and calibration](docs/selection.md) and [event grouping](docs/grouping.md) for the rules and evaluation workflow.

## Quick start

You need **Docker Compose**, **Node.js 24.22.1 or newer**, and an API key for an OpenAI-compatible model service. Docker starts PostgreSQL 17, the API, the worker and the web app.

### 1. Get the code and generate configuration

```bash
git clone https://github.com/oliverran/fin_hot.git finhot
cd finhot
node scripts/init-env.ts
```

The script creates `.env`, random secrets and an admin password. Open `.env` in a local editor and fill in `LLM_API_KEY`. For another model provider, also change `LLM_BASE_URL`, `LLM_MODEL` and the relevant `LLM_EXTRA_JSON`. The example defaults use DeepSeek; configure `LLM_REASONING_TOKENS` as needed for a reasoning model. Do not commit `.env` or put secrets in shell history.

**Check costs and switches before starting:** the generated `.env` sets `COLLECT_ENABLED=true` and `MODEL_CALLS_ENABLED=true`, enabling collection and potentially billable model calls. To inspect the site structure first, set both to `false`; news content will not be generated automatically. Optional data sync and manual source previews have separate controls; see the deployment and source guides.

### 2. Start the services

```bash
docker compose up -d --build
docker compose ps
```

- Site: <http://localhost:3000>
- Admin: <http://localhost:3000/admin>, using `ADMIN_PASSWORD` from `.env`
- Agent connection guide: <http://localhost:3000/agent>

Initial build and processing time depend on network access, sources and the model service. If the page has no content yet, check source status and run history in the admin, or inspect logs:

```bash
docker compose logs --tail=100 api worker web
```

For a server deployment, configure the public `SITE_URL`, domain and HTTPS. See [deployment](docs/deploy.md) for updates, backups, proxies and running without Docker.

## Connect your agent or reader

After starting the site, open `/agent` to choose a connection method. Paths below are relative to your own deployment.

| Entry point | Purpose |
|---|---|
| `/agent` | Copy the MCP, RSS and API connection instructions |
| `/api/mcp` | MCP service, with the `finhot` tool prefix |
| `/api/v1/agent` | Markdown entry point for agents that can read web pages |
| `/openapi-v1.json` | OpenAPI description of the public API |
| `/llms.txt` | Site information and content entry points |

RSS supports selected items, all items, full text, and daily / weekly / monthly reports. Full-text availability depends on source rights and configuration. People and agents read the same published content.

## Data boundaries and project status

- **News and summaries:** AI scores and summaries can be wrong. Check the original for important information. Example source configurations do not guarantee continuous availability or permission to redistribute full text.
- **A-share data:** some broad-index charts read public market-data APIs; other charts may use examples or historical snapshots. Check each page's source, date and coverage. The home-page intraday and daily charts may be delayed.
- **Pro data:** Tushare requires your own token and relevant data access. Sync is disabled by default. Disclosed fund holdings lag the market, sample coverage is not full-market coverage, and ETF share changes are not net capital inflows. See [Pro data](docs/pro-data.md).
- **US market data:** the embedded app uses bundled snapshots and supports refreshes from `historyofmarket.com`. Old data may remain when the upstream is unavailable; a scheduled refresh does not prove a dataset is current.
- **Intended use:** news reading and historical research. No trade execution, return guarantees or investment advice.
- **Build status:** check [GitHub Actions](https://github.com/oliverran/fin_hot/actions/workflows/check.yml). The [2026-11-04 main run for `a964800`](https://github.com/oliverran/fin_hot/actions/runs/41809028790) passed typechecking, the web build, 62/62 web tests, 994/994 backend tests, and the built-site and Docker smoke checks. An [intermittent WebKit navigation timeout](docs/webkit-navigation-investigation.md) still has no confirmed root cause; this passing run does not establish that it is fixed.

## Adapt it to your research

| Location | What to change |
|---|---|
| [`site/site.ts`](site/site.ts) | Site name, home and about copy, report times and public-interface descriptions |
| [`industry/sources.json`](industry/sources.json) | Example sources imported on first start; manage running sources in the admin |
| [`industry/taxonomy.ts`](industry/taxonomy.ts), [`industry/topics.json`](industry/topics.json) | Categories, tags and topics |
| [`industry/prompts/`](industry/prompts/), [`industry/selection.ts`](industry/selection.ts) | Scoring and writing criteria, and tier thresholds |
| [`site/models.ts`](site/models.ts) | Per-step models and fallbacks, with credentials for each service |
| [`modules/chronicle/`](modules/chronicle/) | Chronicle pages, chart catalog and data integration |

Use your own labelled examples with `scripts/eval-selection.ts` before changing scoring criteria and thresholds. See the [customization guide](docs/customize.md). A non-Chinese site also requires translating prompts, site copy and relevant interface components.

## Documentation and contributions

The detailed guides are in Chinese.

- [Deployment and operations](docs/deploy.md): configuration, domains, HTTPS, updates, backups and costs.
- [Sources](docs/sources.md): six collection types, fields, permissions and external ingestion.
- [Selection and calibration](docs/selection.md) · [Event grouping](docs/grouping.md) · [Overview evaluation](docs/story-digest-evaluation.md).
- [Architecture](docs/architecture.md): process boundaries, modules, migrations, public outputs and tests.
- [Pro data](docs/pro-data.md): sector, market, company and fund coverage and limitations.
- [Issues and suggestions](https://github.com/oliverran/fin_hot/issues): include the version, reproduction steps and redacted logs. Do not upload keys or `.env`.

Stack: Node.js 24 · TypeScript · React Router (SSR) · Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose.

## Attribution and license

FinHOT is built on [AIHOT](https://github.com/KKKKhazix/AIHOT), open-sourced by [Khazix (数字生命卡兹克)](https://github.com/KKKKhazix). Collection, pre-screening, dual scoring, writing and translation, event grouping, heat calculation and public content interfaces come from that framework. Thank you to its author and contributors.

This repository adds finance-specific sources, taxonomy, prompts, thresholds and branding, plus the Chronicle module. A-share Chronicle content attribution appears in [`modules/chronicle/catalog.ts`](modules/chronicle/catalog.ts). The US market sub-app and data are in [`historyofmarket/`](historyofmarket/); see [`backend/us-market.ts`](modules/chronicle/backend/us-market.ts) for its refresh logic.

The code retains the [MIT License](LICENSE). **The AIHOT name and logo are not covered by that license**; FinHOT uses its own brand. See [NOTICE](NOTICE) for fonts and other third-party material. News and market data remain subject to their sources' rights and terms.
