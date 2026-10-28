<p align="center">
  <b>FinHOT</b><br>
  A news aggregator and daily-briefing site for the finance industry: it screens items from a set of financial sources, clusters them into events, and publishes a briefing you can actually finish.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-176b75?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Node.js-24-176b75?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/PostgreSQL-17-176b75?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 17">
  <img src="https://img.shields.io/badge/Docker-Compose-176b75?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
</p>

<p align="center">
  <a href="README.md">简体中文</a> · <b>English</b>
</p>

<br>

## Acknowledgements: where this project comes from

FinHOT is **a finance-industry site built on the open-source [AIHOT](https://github.com/KKKKhazix/AIHOT) framework by Khazix (数字生命卡兹克)**.

Everything genuinely hard here comes from AIHOT: collecting from six kinds of sources, pre-screening, scoring every promising item twice on the same rubric, Chinese writing and translation, event clustering and the heat algorithm, and the whole set of public prompts and selection thresholds. Khazix open-sourced an engine that runs in production, which is what makes building a hot-topic site for another field possible at all. **Our sincere thanks to Khazix and the AIHOT project.**

What FinHOT changed on top of the framework is the field itself, all of it inside the site's own folders:

- **Name and brand**: FinHOT, the field word “金融” (finance), home and about copy, report nameplates, the MCP prefix `finhot` (`site/`)
- **Field taxonomy and topics**: 7 categories (AI in finance, policy and regulation, market, mutual and private funds, industry news, research, opinion) with matching tags (`industry/taxonomy.ts`, `industry/topics.json`)
- **Sources**: 22 demo financial sources, covering official channels such as the CSRC, the Shanghai Stock Exchange, the People's Bank of China, the Ministry of Finance, the National Bureau of Statistics and the NFRA, plus financial media and Eastmoney research reports (`industry/sources.json`)
- **Prompts and thresholds**: 17 prompts rewritten for finance; thresholds set per source tier at T1 60 / T1.5 65 / T2 76 (`industry/prompts/`, `industry/selection.ts`)
- **Models**: the default model comes from `LLM_*` in `.env`; `site/models.ts` configures Kimi as a fallback for it

The framework itself (`apps/`, `packages/`) is unchanged, and AIHOT's name and logo are not used.

## What this is

Every day FinHOT collects material from a set of financial sources. A model first judges whether an item belongs to the field and carries real information; promising items are then scored twice, independently, on the same rubric, and get a Chinese headline and summary. Reports of the same story from different sources cluster into one **event**, and events are ranked by how many sources are talking about them. A daily briefing comes out every morning, a weekly report every Monday, a monthly report on the 1st.

It only covers **news, policy and research**: regulatory notices, policy analysis, A-share and fund market developments, broker research arguments and frameworks, and what financial institutions are doing. **Professional market data is out of scope** (live quotes, candlesticks, order books); this is not a market terminal.

The interface, the site's own copy and everything the model writes are in Chinese; see [Make this site yours](#make-this-site-yours) below for where to change that.

## How it works

An item comes in from a source, is checked for duplicates, and pre-screened. Items that might matter are scored twice, independently, get a headline and a summary, are clustered with other reports into an event, and count toward its heat. An item enters the selection only if its score clears the threshold and it doesn't repeat news already selected. The daily briefing is compiled from the day's top stories by rule; weekly and monthly reports are compiled from the dailies. Every step's prompt is in [`industry/prompts/`](industry/prompts/), so changing the standard doesn't mean changing code. See [Selection and calibration](docs/selection.md).

**Clustering and heat**: it looks for candidates from the past two weeks by embedding the headline and summary (or, without an embedding service, by text overlap), then asks a model whether they are the same story, a follow-up, or two different stories. Heat is computed per event, not per article: within 48 hours each independent source counts once, halving every 24 hours, so what ranks at the top is what many people are really talking about.

## What you get

| | |
|---|---|
| **Six kinds of sources** | RSS, web listing pages, JSON APIs, X accounts, WeChat Official Accounts, and content your own scripts push in. Three tiers (official first-hand; official and semi-official; media and individuals), each with its own threshold; fetch frequency adjusts to how often a source publishes |
| **Selection** | A pre-screen, then two independent scores on the same rubric, then a threshold set by the source's tier. One piece of news takes one slot; the same news reworded doesn't get in. All prompts and thresholds are public and editable; calibrate them in SelectBench with samples you labelled yourself |
| **Writing** | Headlines, answer-first summaries, reasons to read, full translation of foreign-language text; categories, tags and news facts extracted separately; guards against the model putting companies the original never mentioned into a headline |
| **Clustering** | Reports of the same story become one event, with follow-ups under the same event and an overview on the event page. Manual corrections to clustering are never overwritten |
| **Trending** | Heat per event: the more independent sources, the higher, and discussion counts too. Compared with six hours earlier, fast risers are marked rising and newcomers are marked new |
| **Daily, weekly and monthly reports** | A daily briefing at 08:00, compiled from the day's top stories by rule; a weekly report every Monday at 10:00 and a monthly report on the 1st at 10:30, compiled from the dailies. Change the times in `EDITION_TIMES` in `site/site.ts` |
| **Topics and search** | Topic pages for institutions and products, directions, and markets; search over headlines and summaries, and full-text relevance search |
| **For agents** | RSS (selection, everything, full text, daily, weekly, monthly), a public API, MCP, Agent Markdown and `llms.txt`: the same content for people and for agents |
| **Admin** | Source management and trial fetches, content diagnostics and manual score corrections, selection evaluation, a separate model for each step, budget breakers for paid services, run history and alerts |

## Run it

You need [Docker](https://docs.docker.com/get-started/get-docker/), [Node.js 24](https://nodejs.org/en/download) (to run `init-env`, which generates the configuration), and an API key for any OpenAI-compatible model API.

`init-env` configures DeepSeek by default. For another provider, change `LLM_BASE_URL`, `LLM_MODEL` and `LLM_EXTRA_JSON` in `.env`, following the examples in `.env.example`. With a reasoning model (one that thinks before answering), also set `LLM_REASONING_TOKENS` to leave output room for the reasoning.

```bash
git clone https://github.com/oliverran/fin_hot.git finhot
cd finhot
node scripts/init-env.ts --llm-key <your model API key>
docker compose up -d --build
```

Open <http://localhost:3000>. The admin is at `/admin`, and the admin password is `ADMIN_PASSWORD` in `.env`. Content starts to appear after a minute or two, and the first import takes about half an hour to process.

Once the site is up, `/agent` lets you copy how to connect over MCP, RSS or the API; agents that can only read web pages start from `/api/v1/agent`; the API description is at `/openapi-v1.json`. For deployment, domains, HTTPS, and using a proxy to reach overseas sources from mainland China, see [Deployment](docs/deploy.md).

## Make this site yours

Nearly everything to change is in the [`site/`](site/) and [`industry/`](industry/) folders; the code itself mostly stays as it is:

| File | What to change |
|---|---|
| `site/site.ts` | Site name, field terms, publishing times, home page copy, about page, the wording on items and reports, the categories of the public interfaces |
| `industry/taxonomy.ts`, `industry/topics.json` | Categories, tags, topics |
| `industry/sources.json` | The sources imported on first start |
| `industry/prompts/` | The selection standard and the writing requirements. **Your field's know-how goes here** |
| `industry/selection.ts` | Selection thresholds |
| `site/models.ts` | Which model each step uses by default (optional: otherwise every step uses the one in `.env`) |
| `site/brand/`, `site/pages/`, `site/public/`, `site/changelog.json` | Icons and logo, terms of use and privacy notice, files served from the site root, the changelog |

To run the site in English or another language, rewrite the prompts in [`industry/prompts/`](industry/prompts/) to write in that language and translate the interface text in `site/site.ts` and the components.

What is most worth your time is the scoring rubric (`industry/prompts/selection-score.md`) and the thresholds: take one or two hundred items you labelled yourself, run them through `scripts/eval-selection.ts`, see how accurately it selects, and go back and adjust. How to do it is in [Selection and calibration](docs/selection.md).

## Documentation

The documents below are in Chinese.

| Document | Contents |
|---|---|
| [Make it your field](docs/customize.md) | Site name, categories, topics, sources, prompts, thresholds, models, brand, step by step |
| [Sources](docs/sources.md) | How to configure the six kinds of sources, tiers and full text, fetch frequency, the external push interface |
| [Selection and calibration](docs/selection.md) | How an item becomes a selection and goes into the daily, weekly and monthly reports, and how to calibrate with your own samples |
| [Event grouping and relation evaluation](docs/grouping.md) | How relations between events are judged, and how to evaluate with your own labelled pairs |
| [Overview evaluation](docs/story-digest-evaluation.md) | Before changing the event overview prompt, how to compare versions side by side on the same events |
| [Deployment](docs/deploy.md) | Docker, domains and HTTPS, mainland China, updates, backups, what it costs |
| [Architecture](docs/architecture.md) | Three processes, the rules that don't change, directories, modules, database migrations, public outputs, tests |

Stack: Node.js 24 · TypeScript · React Router (server-side rendering) · Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose.

## License

The code keeps AIHOT's [MIT License](LICENSE). **The AIHOT name and logo are not covered by the license**, and FinHOT does not use them. The fonts have their own licenses; see [NOTICE](NOTICE).

Thanks again to [Khazix](https://github.com/KKKKhazix) and the [AIHOT](https://github.com/KKKKhazix/AIHOT) project.
