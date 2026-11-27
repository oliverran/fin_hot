# 部署

## 本地监听与运行健康

Docker 默认只绑定 `127.0.0.1:3000`。需要通过服务器 IP 访问时，在 `.env` 明确设置 `PORT=0.0.0.0:3000`；HTTPS profile 的 Caddy 仍通过容器网络访问 web。

API 健康检查验证数据库连通性，web 检查经网页服务代理的 API，worker 验证本容器最近三分钟的心跳。用 `docker compose ps` 查看状态；unhealthy 不会自动触发 Docker 重启，应检查日志与任务积压，排除原因后重启对应服务。

行情批次现在整体提交；异常日期、价格、成交量或不推进的历史页会报错，不写入该批次。已有部署若曾发生历史补齐中断，需要核对缺口并重新补齐；升级不会删除既有行情。

## 用 Docker（推荐）

需要一台装了 Docker（带 Compose）的机器。云服务器建议至少 2 核、4 GB 内存，构建镜像时要用到。

```bash
git clone https://github.com/KKKKhazix/AIHOT.git myhot
cd myhot
node scripts/init-env.ts --llm-key <你的模型 API Key>
```

`init-env.ts` 会生成 `.env`，填好随机密钥和管理员密码，并把密码打印一次。机器上没有 Node 的话，把 `.env.example` 复制成 `.env`，自己填 `ADMIN_PASSWORD`（至少 12 位）、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`POSTGRES_PASSWORD`（各用 `openssl rand -hex 32` 生成）和 `LLM_API_KEY`。

启动前检查 `.env` 的 `SITE_URL`：本机试用保留 `http://localhost:3000`；部署到服务器时改成读者实际访问的地址。例如通过服务器 IP 访问时（把示例 IP 换成自己的）：

```dotenv
SITE_URL=http://192.0.2.10:3000
```

RSS、分享链接、站点地图和 Agent Markdown 中的绝对链接都使用这个值，不会随浏览器访问的地址自动改变。使用域名和 HTTPS 时按下方「配域名和 HTTPS」设置。

配置完成后启动：

```bash
docker compose up -d --build
```

启动后打开 `http://服务器地址:3000`，后台在 `/admin`，用管理员密码登录。第一次启动会导入示范信源，一两分钟后开始出现内容；第一次导入的一百多条资料大约半小时处理完（每条都要预筛、评分、结构化、写标题摘要，再归组）。

`docker compose` 会起五个容器：`db`（PostgreSQL 17）、`setup`（每次启动先跑数据库迁移和种子数据，然后退出）、`api`、`worker`（抓取、模型处理、定时任务）、`web`（网页）。`web` 只接收网站地址、API 地址等网页配置，通过 HTTP 读取 API；数据库、模型和管理员密钥，以及数据卷，只交给后端容器。

### 在中国大陆的服务器上

- 构建时 npm 走国内镜像：`docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com`，然后 `docker compose up -d`。
- 拉取 Docker 镜像慢，先给 Docker 配置镜像加速。
- 海外信源抓不到时，在 `.env` 里设置 `EGRESS_PROXY_URL`：抓信源和图片时走这个代理，调用模型接口不走。
- 对外提供网站服务需要先完成 ICP 备案，备案号填在 `site/site.ts` 的 `icp`。

### 没有公网 IP 时用阿里云 Workbench 执行

实例只有内网地址、本机也不方便直连 SSH 时，用阿里云 Workbench CLI 把命令送到实例里执行。装一次：

```bash
curl -fsSL https://workbench-cli.oss-cn-hangzhou.aliyuncs.com/install.sh | bash
```

它默认装到 `/usr/local/bin`，没有写权限时用 `-d` 指定自己的目录：

```bash
curl -fsSL https://workbench-cli.oss-cn-hangzhou.aliyuncs.com/install.sh -o /tmp/wb.sh && bash /tmp/wb.sh -d "$HOME/bin"
```

配好 AK（`workbench config`）后，`exec` 在实例上跑命令，`upload` / `download` 传文件。这条路只是换了执行位置，镜像仍在服务器上构建，本机的 Docker 和 git 都不参与：

```bash
workbench exec -i <实例 ID> --timeout 1500 -c 'cd /root/myhot && git pull && docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com'
```

两点要注意：

- 每次 `exec` 都是全新的 shell，上一条里的 `cd`、`export` 不保留，多个步骤要用 `&&` 串起来。
- 并发会话有配额，短时间内连着调用会返回 `Forbidden.SessionLimit`（403），等约十分钟自行恢复。构建、停服、迁移和验证尽量合并进少数几次 `exec`。

### 配域名和 HTTPS

先把域名解析到服务器，然后在 `.env` 里设置：

```bash
SITE_URL=https://example.com
SITE_DOMAIN=example.com
PORT=127.0.0.1:3000        # 3000 端口只给本机的 Caddy 用，不直接对外
TRUST_PROXY=true           # 访客地址从 Caddy 转来的请求头里读
```

再用带 HTTPS 的方式启动，Caddy 会自动申请和续期证书：

```bash
docker compose --profile https up -d --build
```

已经有 Nginx 的话，不用 Caddy，把站点反向代理到 `http://127.0.0.1:3000`，带上 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`，并在 `.env` 里设 `TRUST_PROXY=true`。`SITE_URL` 一定要写成读者实际访问的地址：生成的链接、RSS、分享图和 MCP 都用它。

MCP 默认接受 `SITE_URL` 的主机以及 `localhost`、`127.0.0.1`、`[::1]`。额外主机用 `MCP_ALLOWED_HOSTS` 配置，以逗号分隔，例如 `extra.example:8443,[2001:db8::1]`。主机名不区分大小写，IPv6 必须加方括号；可带 0–65535 的十进制端口，匹配时忽略端口。包含路径、用户信息或非法端口的配置不会生效。`127.1` 等别名需要明确列入；此配置只影响 Host 校验，不扩大浏览器 Origin 许可。

前面有 Nginx、CDN 这类缓存时，要遵循应用返回的缓存期限（`Cache-Control`）：公开网页、导航数据、API、RSS、条目 Markdown、报告分享图、站点地图，以及接入说明 `/api/v1/agent` 和 `/openapi-v1.json`（五分钟到期后也要重新验证），都不要另加更长的缓存期，不要在到期后离线返回旧内容，也不要在转发旧响应时重新起算它的寿命；不要让代理和 CDN 叠加缓存动态内容。框架不代管自建站的 CDN，也不替它清缓存。

### 免备案：用 Cloudflare Tunnel 对外

域名没完成 ICP 备案时，国内 CDN 用不了，Caddy 也签不下证书（80 端口会被云厂商按未备案域名拦截，返回 403）。可以让 cloudflared 从服务器**出站**连到 Cloudflare，公网域名交给 Cloudflare 解析，回源经隧道打到 `web`：不占入站 80/443，也就不经过对未备案域名的拦截。

1. 把域名加进 Cloudflare（在域名注册商处把 NS 改成 Cloudflare 给的两个地址）。
2. 在 Cloudflare 控制台 Zero Trust → Networks → Tunnels 新建一条隧道（选 cloudflared、token 方式），复制它的 token。
3. 给隧道加一条 Public Hostname：主机名填你的域名，Service 填 `http://web:3000`。
4. 在 `.env` 里填 `CLOUDFLARE_TUNNEL_TOKEN`，把 `SITE_URL` 改成读者访问的域名（`https://...`），`TRUST_PROXY` 改成 `true`。
5. 启动时带上 cdn profile：`docker compose --profile cdn up -d`。只用隧道时不必再开 `--profile https`，也不用放行 80/443。

cloudflared 会在 `X-Forwarded-For` 里带上访客地址，`TRUST_PROXY=true` 后网站照常读到它，不必再配 Caddy 的 `trusted_proxies`。回源直接打到 `web`，Caddy 那几条安全响应头不会带上：在 Cloudflare 的 SSL/TLS 里打开 HSTS 与 Always Use HTTPS，需要的话再用 Transform Rule 补其余几个。

缓存按上一节的要求来：公开网页、API、RSS、报告分享图、站点地图这些动态内容不要加更长的缓存期，也不要叠加缓存。子应用（美股编年史）的脚本与样式源站返回 `no-cache`（产物不带内容哈希，改版后旧分包会跟新的入口错配），Cloudflare 默认不缓存它们；想缓存 `/us-market/assets/*` 就在 Cloudflare 加一条 Cache Rule 把它们设为可缓存并覆盖 Edge TTL（用较短的期限），每次发版后 Purge 这几个路径，否则会继续发旧脚本。数据集与字体（json/woff2 等）源站已给一小时，可以放心缓存。

### 更新

#### 2026-11-27 · 评测对照的 DeepSeek 预设改走阿里云百炼，并补对照模型

没有数据库迁移、没有新增环境变量。

1. `site/models.ts` 里的 `deepseek-v4.1-flash` / `deepseek-v4.1-flash-1017` 两个预设此前 `service` 写成 `llm`，被当成腾讯云 TokenHub 上的模型，实际调用一直返回 HTTP 402（TokenHub 上这两个模型的免费额度已耗尽）。现在改成 `service: "dashscope"`，走 `DASHSCOPE_BASE_URL` / `DASHSCOPE_API_KEY`（阿里云百炼的 OpenAI 兼容端点），地址与密钥和站内的 qwen 预设同一条。
2. 新增四个只用于评测对照的预设：`deepseek-v4.1-flash-1017-nothink`（同一个快照版，关掉思考）、`deepseek-v4-pro`、`glm-5.3-bailian`、`hy4-flash-nothink`（默认模型 hy4-flash 关思考的具名版）。它们不写进 `DEFAULTS`，也不参与线上流程，只用来在同一批样本上比评分质量。百炼控制台里 GLM-5.3-Flash 未开通（调用返回 `product is not activated`），这里用同厂已开通的 `glm-5.3` 代替；要跑 flash 版需先在百炼控制台开通该模型。
3. 百炼上述模型此前在 `service_prices` 里没有单价，「评测前沿」页不会把它们画进帕累托前沿。种子脚本 `modules/costs/scripts/seed-prices.ts` 补了目录价（华北2北京，元/百万 token）：`deepseek-v4.1-flash` 与 `deepseek-v4.1-flash-1017` 忙时输入 2、缓存命中 0.04、输出 8（闲时减半）；`deepseek-v4-pro` 输入 12、缓存命中 1、输出 24；`glm-5.3` 输入 8、缓存命中 2、输出 28。`deepseek-v4.1-flash-1017-nothink` 与 `deepseek-v4.1-flash-1017` 共用同一个模型名，沿用同一行单价；`hy4-flash-nothink` 与 `hy4-flash-think` 同走 `llm/hy4-flash` 那行（种子脚本里已有），无需改动。脚本幂等，已有的行不动。在服务器上补一次：`docker exec -i aihot-api-1 node --env-file=.env modules/costs/scripts/seed-prices.ts`。
4. 更新按常规步骤 `git pull && docker compose build`，停 `api worker web`、`docker compose run --rm setup`、`docker compose up -d`；本次涉及 `api`（抽样的评测脚本跑在 api 容器里）与 `web`（后台页读单价），没有迁移可跳过 `setup`。
5. 复核：重跑 `scripts/eval-selection.ts` 时百炼这几个模型（含关思考的 `-1017-nothink`）的错误数应为 0，`/admin/model-eval` 的帕累托前沿图上能看到它们带成本的点。

#### 2026-11-26 · 后台新增「评测前沿」页（模型对比帕累托图）

没有数据库迁移、没有新增环境变量、没有配置改动。

1. 新增模块 `modules/model-eval/`：后台「系统 → 评测前沿」（`/admin/model-eval`）把一次模型对比运行画成「成本 × 质量」的帕累托前沿图，横轴是每条样本的估算成本（元，缺价时可切「千令牌/样本」），纵轴是质量（默认完整准确率，可切 F1／精确率／召回率），泡泡大小看平均耗时，非支配点连成阶梯前沿线。数据来自 SelectBench 的对比运行（`selectbench_runs` 里由 `scripts/eval-selection.ts` 自动导入的那一批），读取层是模块自己的 `backend/pareto.ts`，接口 `/api/admin/model-eval` 只对管理员开放；成本按 `service_prices` 目录价把这次运行记录的 token 估成钱再除以样本数，没有单价的渠道不画进前沿、只列进明细表。
2. 附一个抽样本的脚本 `modules/model-eval/scripts/export-gold.ts`：从库里抽「精选评分」看得到的候选资料（分析里 `relevance=pass` 且打过分的），写成 `.data/gold.jsonl` 的骨架（`gold.decision` 留成 `"?"` 待人工标注）。抽样一半取已选中的、一半取卡线难例、少量明显不该选的，写出的顺序打乱、不把本站的判定写进文件，避免标注时被带偏。用法：
   ```bash
   node --env-file=.env modules/model-eval/scripts/export-gold.ts            # 默认 .data/gold.jsonl
   node --env-file=.env modules/model-eval/scripts/export-gold.ts --limit 200 --seed 7
   ```
   在服务器上跑：`docker exec -i aihot-api-1 node --env-file=.env modules/model-eval/scripts/export-gold.ts --out /tmp/gold.jsonl`。标完 `gold.decision` 后按 `docs/selection.md` 跑 `scripts/eval-selection.ts`，结果会自动导入 SelectBench，评测前沿页随即出图。
3. 更新按常规步骤 `git pull && docker compose build`，停 `api worker web`、`docker compose run --rm setup`、`docker compose up -d`；本次涉及 `api`（接口）与 `web`（后台页）两个服务，没有迁移可跳过 `setup`。`worker` 也会加载这份模块清单，但这个模块没有定时任务，一起重建只是让镜像与提交一致，不重建也不影响行为。从后台「系统」里能打开「评测前沿」，没有运行数据时页面显示空状态。

#### 2026-11-26 · 华尔街见闻·快讯信源地址更新

没有数据库迁移、没有新增环境变量、没有配置改动，不需要重建镜像。

1. 华尔街见闻把公开内容 API 的域名从 `api-one.wallstcn.com` 迁到了 `api-one-wscn.awtmt.com`（路径与返回结构不变），旧域名已解析不出（NXDOMAIN），`json-wscn-lives` 信源因此一直报 `getaddrinfo ENOTFOUND`。仓库里该信源的示例地址（`industry/sources.json`）已改成新域名。
2. 种子脚本只补缺、不更新已有信源（`scripts/seed.ts` 是 `ON CONFLICT DO NOTHING`），所以线上已存在的信源要单独更新：在后台「信源」详情页的「采集配置（JSON）」里把 `url` 的域名改成 `api-one-wscn.awtmt.com` 保存，再点「立即采集」。也可以直接改库里的 `config.url`，并把 `fail_count` 清零、`next_fetch_at` 设为 `now()`，免得等最长六小时的失败退避。
3. 修好后核对最近一次 `fetch_runs` 由 `failed` 转 `ok`、`found_count` 有值、`fail_count` 归零、`health` 回到 `ok`。

#### 2026-11-26 · 实时行情卡加入美股指数

没有数据库迁移、没有新增环境变量、没有配置改动。

1. 精选页第一屏的实时行情卡（编年史模块）新增两只美股指数：道琼斯工业平均指数（`usDJI`）与纳斯达克综合指数（`usIXIC`），与原有的上证综指、创业板指并列，同样提供分时与日K两张图。改动只在编年史模块的前端与后端（`modules/chronicle/`）。
2. 数据源：分时先试东方财富 `trends2`，回退腾讯 `usMinute`；日K因为东财对美股只回空表，直接走腾讯 `usfqkline`。第三方请求仍全部经服务端（前端只读 `/api/chronicle/live`），并共用现有的 15 秒内存缓存。
3. 刷新时段按所选指数所在市场判断：看沪深指数时在 A 股盘中每 15 秒刷新，看美股指数时在美股盘中（北京时间夜间）刷新，夏令时由时区数据自动换算。
4. 更新按常规步骤 `git pull && docker compose build`，停 `api worker web`、`docker compose run --rm setup`、`docker compose up -d`；本次涉及 `api` 与 `web` 两个服务。从公网核对 `/changelog` 能看到新条目，并在实时行情卡上切到美股两只，确认分时与日K都能出图。

#### 2026-11-26 · 资讯「AI 导读」加长

没有数据库迁移、没有新增环境变量、没有配置改动。

1. 资讯的「AI 导读」目标从「80–160 字、最多 3 句」放宽到「150–250 字、最多 5 句」：改了写作提示词（`industry/prompts/` 的 `summarize-article.md`、`summarize-long-post.md`、`rules-answer-first-summary.md`、`content-understanding.md`）和摘要长度护栏（`packages/backend/src/editorial/writing.ts`）。短推文翻译路径不变。
2. 只影响之后新评判的资讯，已有条目的摘要不会批量重写；想让某条立即改写，可在后台「内容诊断」里重新评估这一篇。
3. 后台「指标监控」按用途与模型的排行不再裁掉默认模型的行，并修好 P95 耗时列偶尔显示为空的问题（读取层 `modules/analytics/backend/ops.ts`）。
4. 更新按常规步骤 `git pull && docker compose build`，停 `api worker web`、`docker compose run --rm setup`、`docker compose up -d`；提示词与护栏在 `api`、`worker` 里，这两个服务必须重建。从公网核对 `/changelog` 能看到新条目。

#### 2026-11-24 · 机会分区与默认模型切到 hy4-flash

1. 构建与本次源码对应的镜像，保留上一版（`finhot:20261123-hy4`）供回退。停掉 `api`、`worker`、`web`，运行 `setup` 应用迁移，再按 `--profile https` 启动。
2. 新增迁移 `0095_opportunities.sql`，只建 `opportunities` 表（五段分析列 `summary / catalyst / logic / watch / risk`，以及 `symbols`、`evidence` 依据、`model` 等），不删除已有数据；回退保留该表即可。
3. 默认模型改为腾讯云 TokenHub 的 `hy4-flash`：判断类步骤（评分、归组、事件综述、周报月报、机会）走开了思考的 `hy4-flash-think`，其余步骤走默认模型（同一个模型、思考关着）。`LLM_BASE_URL` 指向 `https://tokenhub.tencentmaas.com/v1`，`LLM_API_KEY` 填对应密钥，并打开 `LLM_VISION=true`。
4. 侧栏新增「机会」分区（`/opportunities`），工作日 A 股收盘后（16:30）生成当日机会，标的经 A 股全量清单与美股白名单核对后落库；后台「机会」页可查看并手动重跑。该分区只提供观察线索，不构成投资建议。
5. 从公网验证 `/api/health`、`/opportunities`、`/changelog` 和后台机会页。

#### 2026-11-19 · 移动端 0.1.4

1. 同步移动资源，以构建号 5 构建客户端。安卓沿用官网发行证书签名，核对[移动端发布记录](mobile.md#014-发布记录)中的 SHA-256。
2. 将 APK 放入 `modules/mobile-download/web/release/FinHOT.apk` 后构建网页镜像。保留上版 APK 与镜像。验证候选镜像的下载文件后，更新提供更新日志的 API 服务和提供下载的 web 服务。
3. 在公网检查 `/download` 的安卓二维码、`/download/android` 返回的 APK 校验值和 `/changelog`。iPhone 个人安装使用原 Bundle ID 和开发团队进行覆盖安装。

#### 2026-11-19 · 网页编年史与移动端 0.1.3

1. 构建与本次源码对应的镜像。官网发行包放在 `modules/mobile-download/web/release/FinHOT.apk` 后再构建网页。APK 的包名、版本、证书和文件校验值见[移动端发布记录](mobile.md#013-发布记录)。
2. 使用新镜像连接现有数据库，执行 `node scripts/migrate.ts`，确认 `0094_analytics_event_client.sql` 已应用。它给访问明细添加可空的终端字段，旧网页明细在后台显示为「历史网页（终端未区分）」。
3. 依次切换 API、worker 和网页。保留上版镜像标签、Compose 配置和签名 APK 供回退。此次迁移为增量加列，应用回退可保留该列。每日清理按北京时间日期保留含当天在内最多 30 天明细，到期明细会删除，已有每日汇总继续保留。
4. 从公网验证 `/api/health`、`/changelog`、`/privacy`、宽基卷目录跳转和安卓二维码下载。管理员在「指标监控 → 访问终端」核对访客、浏览、入口点击和 App 冷启动。旧版 App 从升级后开始上报，iOS 需另行签名分发。


新增选填的 `PRIVATE_FEED_HOSTS`：信源订阅或列表地址用自建在内网的服务（比如 RSSHub）时，把它的主机名写进去，不必再打开整站的 `ALLOW_PRIVATE_NETWORK_FETCH`，用法见 [信源](sources.md)。不设置时行为不变；无需数据库迁移。

周报、月报的周期内，应有日报齐全且原始正文条目全部为空时，自动跳过该期，避免每半小时重复报错；归档里不会新增空周报或月报。首个周期从全站最早日报开始检查；没有可汇总条目时，若缺失日报、原有条目后来无法公开或正在人工更正，仍保留原有错误。无需数据库迁移或配置修改，升级后下次定时检查生效。

正文原生视频修复会为已有可用视频补播放控件，并去掉空播放器，不写回文章、不调用模型。旧版清洗时已经丢弃的媒体地址无法从存档恢复；升级不批量重新抽取，已有成功正文会跳过抽取，内容哈希相同时重新抽取也可能保留原 HTML。后续新正文按[信源说明](sources.md)保留原生视频，文件继续由浏览器直连原站，签名地址可能过期。

正文插图里的内嵌 SVG 图改为保留原站写的文字说明（见[信源说明](sources.md)），只作用于之后抽取的正文；已存的正文不变，升级不批量重新抽取。

FinHOT 移动版发布变更：升级后，下一次每日清理（北京时间 03:30）会删除提交超过 30 天的反馈，包括未处理的历史反馈及本地旧截图。网页访客统计明细最长保留 30 天，每日汇总继续保留。无需数据库迁移。服务器、CDN 访问日志及飞书已转发的副本由对应服务管理，部署时需要分别设置并核实 30 天清理。此变更首次部署前应确认运营主体、服务商与保存期限。

定时清理的保留期收紧：付费请求回执（`receipts`，连同它的尝试记录 `receipt_attempts`）保留 90 天——费用看板的最近 90 天不受影响；定时任务历史 `job_runs` 由 30 天改为 14 天（失败记录仍留 90 天）；pg-boss 已完成任务由 7 天改为 3 天，队列在启动时自动同步这一项。升级后下一次 `ops.retention`（北京时间每天 03:30）会按新保留期删除更早的行，这次删除的是升级前就已存在的历史记录；无需数据库迁移。

先按下方 [备份](#备份) 一节备份。构建完成后停止旧服务，再运行迁移和新版服务：

```bash
git pull
docker compose build
docker compose stop api worker web
docker compose run --rm setup && docker compose up -d
```

迁移成功后再启动服务；迁移失败时先查看错误，不要继续启动。使用 HTTPS 配置的站点继续保留 `--profile https`。旧的 API 和 worker 要在迁移前停下：迁移可能删表删列，旧代码还在跑会出错；正常关闭 worker 会等进行中的付费调用收尾（最长三分多钟）。非 Docker 部署也按“备份、构建、停止 API/worker/web、迁移（`scripts/migrate.ts`）、种子数据（`scripts/seed.ts`）、启动”的顺序更新。

新迁移遇到长期占锁会报出文件名和等待超时，先处理占锁事务，再重跑 setup，不要跳过迁移或改写迁移账本。并发索引创建中断可能留下无效索引：核实报错中的对象后，用 `DROP INDEX CONCURRENTLY <索引名>` 清理该失败索引再重跑；有效但定义不同的同名索引须先核对差异。这些保护不改变上述 Docker 更新顺序，跨旧版本升级仍可能执行历史上的破坏性迁移。

下面按时间从新到旧列出每次更新要注意的事。

日报缺期告警按北京时间的具体日期跟踪，跨午夜不会自动恢复；只有对应日报存在才发恢复通知。新缺期检查最近 7 个日历日（含今天），不早于最早的日报或 reports.compose 运行记录；没有历史记录时只检查今天。已告警的日期在这 7 天里一直跟踪，关闭采集/模型或 worker 启动宽限期也不会把缺期当成恢复；超出 7 天仍没有日报的，发一条“没能补出、停止提醒”后不再提醒。旧的 report.daily 状态自动按首次告警时间迁移，保留提醒间隔。出刊后两小时告警、每小时提醒及飞书开关保持不变；无需数据库迁移。自定义 responder 若按旧 `report.daily` 精确匹配，需改为识别 `report.daily:YYYY-MM-DD` 日期键。

#### 读者文字的改用词（2026 年 10 月 9 日）

没有迁移，没有必填的新环境变量。行业包多了 `industry/wording.ts`（读者文字里不用的词，模板里是空的）和提示词 `mend-wording.md`；合并时这两个文件随更新带进来，自己的行业包没有冲突。词表空着就不查、不多调用模型；写了词以后，用了这些词的标题、摘要、推荐理由会多一次模型调用（模型步骤“改用词”，可用选填的 `WORDING_MODEL` 单独选模型）。说明见 [把它改成你的行业](customize.md)。

#### 导航里可以不放某些入口

没有迁移，没有新环境变量。`site/site.ts` 多了 `NAV.hidden`（目前只支持热点榜 `"/hot"` 和主题 `"/topics"`，见 [把它改成你的行业](customize.md)）；框架从 `@aihot/site` 读它，**自己维护 `site/site.ts` 的站，合并时照模板加上 `NAV`**，不加通不过类型检查。模板里是空的，导航和原来一样；隐藏入口不会关闭页面或公开接口。

#### 原帖展示与引擎同步（2026 年 10 月 6 日）

没有新增必填环境变量或数据库迁移。自己维护 `site/site.ts` 的站点需补上 `REPORTS.quiet`，可对照示范配置：日报时段内有资料经过评判、但没有新大事时照常出刊，用这两句做标题与导语；导语的 `{start}`、`{end}` 是时段起止。没有任何资料经过评判仍算采集或判断失败，不伪装成平静的一天。

空正文、纯链接的 X 帖子保留原来的链接、图片和引用，不调用写作或翻译模型；来源允许展示全文时，纯图片帖子也可以显示，现有展示与再分发许可继续生效。已取得实际正文的 X 长文照常处理。旧译文也不会再出现在这些原帖的公开页面里。已生成过错误标题摘要的帖子，可在更新后用 `packages/backend/src/publication/publish.ts` 的 `publishArticle(id)` 重建公开内容，不需要重新调用模型。

MCP 的 `subscriptions/listen` 现在立即返回 HTTP 404 和 JSON-RPC `-32601 Method not found`。服务从不推送变更，普通工具调用照常使用；客户端收到这个回答后不应重试建立常驻订阅。

无需数据库的测试改为 `*.standalone.test.ts`；`npm test` 仍运行全部后端测试，只给需要数据库的文件建副本。可用 `npm run test:standalone` 单独运行这些测试。

#### 社区修复、时间规则与读取优化（2026 年 10 月 4 日）

公开接口版本仍是 4.0.0。没有必填的新环境变量；新增一个选填的 `LLM_REASONING_TOKENS`，见下面 `site/models.ts` 一条。

**开关只认 `true`**：`.env` 里所有 `*_ENABLED` 开关（`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED`、`FEISHU_*_ENABLED`、`INDEXNOW_SUBMIT_ENABLED` 等）只有写成小写的 `true` 才打开。以前写 `1` 或 `TRUE` 也算打开，现在都当作关闭；升级前检查 `.env`，改成 `true`。

**迁移**：新增七个迁移，按上面的步骤等 setup 跑完即可。它们都不删数据，不重写文章或已有向量，也不调用模型；迁移按完整文件名记账，编号相同的不同文件各自执行。

- `0055_publication_selected_published_idx.sql`、`0056_analyses_composite_id_idx.sql`、`0056_publications_pool_category_timeline_idx.sql`、`0057_publications_pool_channel_timeline_idx.sql`：并发建立查询索引，不阻塞正常读写。
- `0056_publication_release_selection_stats.sql`、`0057_analyze_publication_release_selection.sql`：为公开列表创建并收集查询统计。
- `0083_publications_selected_source_idx.sql`：并发建立按信源统计精选的覆盖索引，减少后台统计时的读取。

这次连同这些索引一起减少了公开读取与事件召回的数据库开销，接口内容、搜索权重和事件候选范围不变。

**自己改过这些文件的站，合并时对照新文件**：

- `site/site.ts` 多了几项：
  - `EDITION_TIMES`、`EDITION_WHEN`：日报、周报、月报的出刊时间，原来写死在代码里；排程、日报的时间窗口、缺期告警和提到时间的文案都读它。`public/` 里的文件用占位 `{{dailyTime}}`、`{{weeklyTime}}`、`{{monthlyTime}}`。
  - `ITEM_COPY`：推荐理由叫什么，网页和分享图上显示不显示评分。
  - `REPORTS.descriptions`、`entry`、`metricUnits`、`shareUnit`：报告页面的描述和版面上的说法。
  - `ABOUT`、`CARDS` 里提到出刊时间和推荐理由的文案改成引用上面几项。
  - `DEPLOYMENT.directImageHosts` 改名为 `directFetchHosts`，采集和图片共用这份直连名单。
  - `SITE.feedbackLead`、`SITE.feedbackEmailHint`：反馈页标题下的一句话和邮箱框提示，原来写死在代码里。
  - `SITE.psb`：可选的公安备案号，未办理或不适用时填 `null`。
  - `ABOUT.lead` 里 `{sources}` 两边不再写空格，页面会自动加。
- `site/models.ts`：评分调用参数现在由具名预设的 `scoreCall` 配置；保留 `glm-5.3-flash-selection` 时同步示例中的温度、输出额度和超时。已有自定义模型没写这一项时沿用引擎默认值。
- `site/models.ts` 的 `ModelPreset` 和 `site/site.ts` 的 `Founder` 类型统一从 `@aihot/contracts/site-config` 导入，原有站点配置值保留；自定义过这两个文件时同步类型导入，避免漏掉引擎新增的可选字段。
- 数据库迁移遇到正在导出的 `pg_dump` 会先等待，最长与 worker 排空时间相同；超时后在执行这条迁移前退出，等导出结束后重跑更新命令。其他占锁仍快速报错。
- 迁移会删除已停用的 `translation_attempts.request_tag` 列；翻译正文、尝试记录和付费回执保留。来源发布时间的原始精度另行保存，旧资料无法确定的精度保持未知，不把零点自动当作来源只写了日期。
- `site/models.ts`：推理模型的额度改成明确配置。默认模型设 `LLM_REASONING_TOKENS`，具名模型写 `reasoningTokens`。原来只有名字以 `-think` 结尾的具名模型会多给 4000，这个做法去掉了；自己加过这类模型的，补上 `reasoningTokens: 4000` 才保持原来的额度。推理模型把额度用光时，报错会写明 `finish_reason=length` 和该改哪一项。
- `industry/prompts/story-digest.md`：事件概览换了写法，第一句讲清核心变化和目前的结论，再补必要背景，分成短段，不按日期复述下方的时间线，不评论报道本身，也不再写死行业。已有综述不会被批量重写，随新报道逐步换成新写法；想让某几个事件立即重写，见 [综述评测](story-digest-evaluation.md) 的最后一节（`rewriteStoryDigest`，每个事件一次模型调用）。
- 自己维护的 Compose 文件可以删去 `LOCAL_ROUTER_URL`：分享图预热现在直接复用后端渲染器，不再请求固定的本机端口，没有代码再读这一项，自带的 `docker-compose.yml` 已经去掉。分享图地址、格式和缓存约定不变。

**采集与发布时间**：

- **首次导入之后不再收信源的存档**：以前新信源首次导入后，第二次抓取会把订阅里剩下的旧条目全部当历史内容收进来，逐条付费分析（示范源一次就有上千条）。现在之后的抓取只收发布时间在信源第一次导入前 48 小时以内或之后的条目；没有日期的照收，X 账号不受影响，见 [信源](sources.md#规则旧文不刷屏) 的“旧文不刷屏”。升级前已经收进来的旧条目按原文时间归档，不进“今天”和日报，分析也早已跑完，不用处理。
- **没有可信发布时间的新资料先不公开**：先不进公开列表、精选、报告、热点和推送，从原信源或原文页读到日期后再判断新旧。日期未知时，文章页、结构化数据和 Agent Markdown 标“收录时间”，RSS 不写 `pubDate`；OpenAPI 注明事件时间线和日报快讯的 `publishedAt` 这时是收录时间。
- **JSON 接口里不带时区的时间**（如 `2026-09-30 17:43:58`）按信源的 `publishedAtUtcOffset` 读，默认 `+08:00`。以前按服务器时区读，Docker 里是 UTC，所以已有这类信源的新条目时间会提前 8 小时，变成正确值。
- **文章页日期使用同一来源时区**：详情页补日期与正文提取先用 `detail.publishedAtUtcOffset`，未设则继承信源的 `publishedAtUtcOffset`，再默认 `+08:00`。只作用于之后的采集和补日期，不批量重写已有发布时间。
- **详情补全**：失败或超出本轮次数限制的日期、标题、摘要会在后续采集中补齐，已确认的正文保持原样；信源请求成功却漏掉日期、标题或正文时也会补全，并记进信源健康。Jina 详情规则要与实际返回格式匹配；固定采集起点、Intercom 日期章节及视频描述的配置见 [信源](sources.md)。
- **视频播放页不当正文**：对所有信源生效，YouTube、Vimeo 播放页不再作为文章正文抓取，YouTube 视频页也不再被当成图片。RSS 的视频描述只作摘要，订阅直接提供的真实文字保留。升级不会批量删除或重新分析已有正文；旧视频记录混入播放器导航的，先逐条核实，可在后台“内容诊断”的详情页设为仅摘要，停止展示错误正文。
- **RSS**：确认摘要就是全文的文字订阅可以设 `summaryIsBody`（Atom 的 `summary` 也算）。没有网页的播客单集，原文链接改为音频或视频文件，不再去抓网页。
- **预览和正式采集用同一组过滤**：后台“预览抓取”也套用地址前缀、分类、噪声词、地址改写和 `publishedAfter`，预览里看到的条目就是正式采集会存下的。
- **关掉采集后不再取信源图标**：`COLLECT_ENABLED` 不是 `true` 时，每天 04:40 取信源图标的任务也停下，不再访问信源网站。
- **已核实的历史日期可以纠正**：运维脚本先调用 `admin/content.ts` 的 `previewPublicationDateCorrection`，再按预览给出的版本和校验值调用 `correctPublicationDate`，并记录操作者与理由。只接受新旧日期都早于七天窗口的明确更正；保留材料修订、选稿与归组，不重跑模型。材料或日期已变化，或这次纠正会改变其他公开决定时，会拒绝操作并要求重新核对；没有批量回填，也没有新增公开接口。
- **公开评分可以人工更正或撤销**：后台内容详情支持“按模型”“撤销评分”“人工评分”。人工评分接受 0–100，撤销评分使公开值为 `null`；清除评分覆盖后恢复已保存的模型分数。更正要填写理由并核对版本，保留原始分析和审计记录，同步更新网页、API、RSS、Agent Markdown 与 MCP，不重跑模型。既有文章不会因升级而批量改分或重新入选。

**公开出口**：

- **按类别筛选按 `PUBLIC_CATEGORIES` 走**：API、RSS 和 MCP 的 `category` 取所有在公开接口里算作这一类的类别。不合并分类的站（默认就是），按 `tip` 查不再带出观点；没有 `tip` 类别的行业也能通过类型检查。
- **往期报告仍需重新验证**：日期、周和月份确定的是哪一期，不代表内容永久不变。报告保留出刊时写下的标题和摘要，来源名和引用时间跟随当前公开资料；已撤回的引用及依赖它的导读、封面不再分发。保留报告副本的客户端在 `Cache-Control` 到期后带 `If-None-Match` 重新请求。
- **自行配置过 Nginx 或 CDN 缓存的站点要检查规则**：按 [配域名和 HTTPS](#配域名和-https) 末尾的要求核对，并在更新时清理这些路径已有的代理和 CDN 缓存，包括接入说明 `/api/v1/agent` 和 `/openapi-v1.json`。
- **站点地图重建失败时不再无限沿用旧文件**：进程、磁盘副本和 HTTP 响应共用原来的五分钟期限，过期且无法重建时返回 `503` 和 `Retry-After`。MCP 继续使用 `no-store`；API 和 Agent 内容到期后重新验证。

**工具与修复**：

- **综述评测**：`scripts/eval-story-digests.ts` 从库里导出真实事件，在同一批事件上把现有提示词和候选提示词并排跑，见 [综述评测](story-digest-evaluation.md)。三个评测脚本共用 `scripts/eval-tools.ts`；`eval-selection.ts` 的 `--n`、`--concurrency` 和模型名写错时直接报错。
- **迁移不阻塞读写**：新迁移每个文件只放一条允许在线执行的语句，不整表回填或重写，建索引用 `CREATE INDEX CONCURRENTLY IF NOT EXISTS`；CI 用 `scripts/check-migrations.ts` 检查。统计维护只针对明确的表和列，规则见 [架构](architecture.md#数据库迁移)。
- MCP 请求有大小上限，错误日志去掉凭据。
- 桌面侧栏放大后显示细滚动条。
- 测试按每一步实际的提示词认请求、从 `industry/selection.ts` 读门槛，换行业改写提示词和门槛后不再误报；架构测试不再受路径分隔符影响。

#### 站点文件搬进 `site/`（2026 年 10 月 4 日）

公开接口没有变化，版本仍是 4.0.0。

- **站点自己的文件从 `industry/` 搬到了 `site/`**：`site.ts`、`models.ts`、`brand/`、`pages/`、`public/`、`changelog.json`。`industry/` 只留行业知识：`taxonomy.ts`、`topics.json`、`sources.json`、`prompts/`、`selection.ts`。自己改过这些文件的，合并时把改动挪到 `site/` 下的同名文件。
- **`site.ts` 多了几项**，都可以不填：`SITE.github`、`SITE.llmsIntro`、`SITE.rootIcons`，`POLICY.terms.license`、`POLICY.terms.headers`，`ABOUT.termsAnchor`（二维码卡片可以写 `alias`），以及 `ACCESS`、`ADMIN`、`DEPLOYMENT`、`FEED_COPY`、`PUBLIC_CATEGORIES`，说明见 [把它改成你的行业](customize.md)。`PUBLIC_CATEGORIES` 取代了 4.0.0 时的 `publicAs`：原来在类别上写 `publicAs: "tip"` 的，改在 `PUBLIC_CATEGORIES.merge` 里写（键是这个类别的 key，值是 `"tip"`）。
- **`DEPLOYMENT.requiredSecrets`** 是生产 API 启动时额外检查的凭据清单，默认空；基本会话、图片签名和管理员登录校验仍然生效。只有你的部署要求某个可选集成必须配置时才填写。
- **只属于你这个站的功能可以做成模块**：放进 `modules/<名字>/`，在 `site/modules/` 的清单里启用，见 [架构](architecture.md) 的“模块”。框架本身不带模块。
- **Agent 接入页默认打开 MCP**，页面列出 MCP、RSS 和 API 三种接入方式。Agent Markdown 接口仍在 `/api/v1/agent`，可从页面下方“Agent 使用说明”进入。
- **图片代理可以设流量上限**：`IMGPROXY_UPSTREAM_MB_PER_MINUTE`、`IMGPROXY_UPSTREAM_GB_PER_DAY`（或 `site.ts` 的 `DEPLOYMENT.imageUpstreamBudget`），默认不设。
- **修复**：同样的数据每次给出同样的字节（排序遇到并列时补上唯一的次序，API 和 RSS 的 ETag 不再无故变化）；网页转给 api 的请求不再带上逐跳头，`Connection: close` 不再让下一个 POST 失败；`llms.txt` 的接入方式按实际数，不再写成四种。

#### 升级到公开接口 4.0.0（2026 年 10 月 3 日）

- **模型榜、Codex 重置监控和主题页的大事记不再是框架的一部分**，只留在 AIHOT 上。页面（`/leaderboard`、`/codex-reset`）、接口（`/api/v1/codex-resets`、`/api/v1/codex-resets/recent`、`/api/v1/agent/codex-resets`）和 MCP 工具 `<前缀>_get_codex_resets` 都去掉了，MCP 和 `/openapi-v1.json` 的版本号升到 4.0.0。迁移 `0053` 删掉它们的表（`lb_*`、`monitor_*`、`fx_rates`）和设置，定时任务及其执行队列在 worker 启动时自动撤掉，后台运行记录继续保留；要留这些数据的，升级前先备份。公司主题页的标志改成公司名的首字母。
- **行业包有几处变化**，自己改过 `industry/` 的站，合并时对照新文件补上：
  - `site.ts` 多了 `topicsTitle`、`feedbackExample`、`keywords`、`since`、`interfaceVersion`、`POLICY`（使用规则和隐私说明两页的名字与简介、X 帖子算不算全文）、`ABOUT.description`、`ABOUT.sourcesFallback`、`AGENT`、`REPORTS`、`ALERTS`、`SOURCE_DEFAULTS`、`COMMUNITY_FEEDS`、`CARDS`；作者块的两张二维码卡片加了 `kind`，`ABOUT.copyright` 改成反馈页链接前后的两段。
  - 新增 `models.ts`：具名的模型和每一步默认用哪个，原来写在代码里。
  - 网页左上角的标志从 `apps/web/app/components/Logo.tsx` 搬到 `industry/brand/Logo.tsx`（后来搬到 `site/` 下，见上方）。
  - 新增 `public/`：`robots.txt`、`manifest.webmanifest` 原来在代码里生成，OpenAPI 说明原来在 `reference/`，现在都是这里的文件。原来填了 `contactEmail` 就会生成的 `/.well-known/security.txt`，现在要自己放一份 `public/.well-known/security.txt`（后来搬到 `site/` 下，见上方）。
  - 删掉了 `features.ts`、`chronicle.ts` 和 `chronicles/`；`topics.json` 里的 `orgNames`、`leaderboardProvider`、`chronicleTerms` 不再使用，可以删掉。
  - `taxonomy.ts` 的类别可以写 `feedLabel`（分类 RSS 标题里的名字，示例站用“AI 模型”这样的说法）；`ENTITIES` 加了几家公司。当时类别上还可以写 `publicAs`，让它在公开接口里并进另一类；这个字段后来删掉了，改成 `site/site.ts` 的 `PUBLIC_CATEGORIES.merge`（见上方），再写 `publicAs` 通不过类型检查。
- **推送接口的限流可以设置**：`/api/ingest/items` 每个客户端每分钟最多推几次由 `INGEST_RATE_LIMIT` 决定，`docker compose` 默认 10，和以前一样；不用 Docker 时默认不限，前面没有代理限流的话在 `.env` 里设上。
- **不再使用的环境变量**：`ARTIFICIAL_ANALYSIS_API_KEY`、`MONITOR_MODEL`，可以从 `.env` 删掉。

#### 升级到公开接口 3.0.0（2026 年 10 月 3 日）

- **安全阀默认关**：`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 只有写成 `true` 才打开，没写就是关。用 `scripts/init-env.ts` 生成的 `.env` 已经有这两行；自己写的 `.env` 没有的话要补上，否则升级后不再采集、不再调用模型。
- **周报月报接口换了形状**：`/api/v1/weeklies`、`/api/v1/monthlies` 的列表和每一期都带 `periodStart`、`periodEnd`，正文改成 `sections[]`（每栏 `label`、`summary`、`items`），不再有 `title`、`themes`，列表的 `limit` 最多 60。读这两个接口的程序要跟着改；MCP 和 `/openapi-v1.json` 的版本号随之升到 3.0.0。
- **精选的机器出口每条新闻一条**：API 的 `mode=selected`、同步接口和精选 RSS 里，同一条新闻只留代表报道，其他报道以 `remove` 出现在同步的变更里（`mode=all` 里还在）。升级前已经入选的旧报道不会被重新整理，等这条新闻再有报道发布时才归并。
- **精选要等去重确认**：分数够了的资料，要等归组确认它不是精选里已有新闻的重复、带来了新信息，才进精选；确认之前只在“全部动态”。归组用的模型回答不合格式时会停在那里，后台“运行”页能看到。
- **一手只看分级**：`T1` 就是一手，`first_party` 不再单独设置；以前单独标成一手的 `T1_5`、`T2` 信源不再算一手，要算就改成 `T1`。
- **行业包多了几项**：`taxonomy.ts` 新增 `RELEASE`、`PLAIN_TERMS`，评论类的类别标 `commentary: true`，`ENTITIES` 可以写 `otherNames`，`CATEGORY_BY_ITEM_TYPE` 不再使用。已经换成别的行业的站，合并时对照 [把它改成你的行业](customize.md) 补上。
- **主题只读 `industry/topics.json`**：迁移会删掉数据库里的 `topics` 表。只改过数据库、没改文件的主题，升级前先写进文件。公司主题只看 `entityId`，`related` 不再使用。
- **日报不再调用模型**：日报按规则编排，周报月报从日报汇编，模型只写总述和栏目导读；已经出过的各期不重写。
- **提示词有改动**：`industry/prompts/` 里的 `structure.md`、`group-*.md`、`story-digest.md`、`report-period.md` 换成了新的写法，`report-daily-lead.md` 删掉了，新加了 `report-period-sections.md`。改过这些提示词的，对照着把自己的改动搬过去。
- **删掉的脚本**：`scripts/delete-sources.ts`、`scripts/regroup-events.ts`、`scripts/enqueue-analysis.ts`。不要的信源在后台暂停；单篇的重新评估、重新归组在后台“内容诊断”里打开这一篇操作。
- **管理员会话绑定登录方式**（迁移 `0041`）：从还没有会话绑定的版本升级后，未绑定的旧会话需要重新登录。此前已试用会话绑定迁移的数据库可直接升级，已有列和绑定会被保留，无需手动修改迁移记录。之后的规则见下方“管理员会话与配置变更”。
- **3.x 的 `/agent` 默认打开 Agent Markdown**，MCP 的接入说明在 `/agent?tab=mcp`；当前接入页见上方“站点文件搬进 `site/`”。
- **飞书内容群只推 `T1`、`T1_5` 信源的精选。**

### 备份

在 `.env` 里配置 `DB_BACKUP_STORE_*`（任何 S3 兼容的对象存储），每天 04:10 自动备份到那里。`DB_BACKUP_STORE_SECRET_ID`、`DB_BACKUP_STORE_SECRET_KEY`、`DB_BACKUP_STORE_BUCKET`、`DB_BACKUP_STORE_REGION` 四项都要填；不填 `DB_BACKUP_STORE_DOMAIN` 时按腾讯云 COS 拼地址（`<桶名>.cos.<地域>.myqcloud.com`），用其他 S3 兼容存储时，把这个存储桶的访问域名（含桶名，例如 AWS S3 的 `<桶名>.s3.<地域>.amazonaws.com`）填进 `DB_BACKUP_STORE_DOMAIN`。

一次完整备份包含同一时间戳的数据库 `.dump` 和文件包 `.tar.gz`，文件名取自数据库名：Docker 里数据库叫 `aihot`，所以是 `aihot-<时间>.dump` 和 `aihot-files-<时间>.tar.gz`。文件包保留 `uploads/` 以及仍存本地的 `feedback-screenshots/`，不包含图片缓存或本地备份目录。已经转发到飞书的图片只保留数据库中的外部引用，文件包不保存飞书上的图片。

恢复时同时取回这一对文件：使用与数据库版本兼容的 `pg_restore` 将 `.dump` 恢复到空数据库，再把文件包解压到数据目录根目录（Docker 中为 `/data`，非 Docker 使用 `AIHOT_DATA_DIR`，默认 `.data`），保留包内的子目录结构，并确保运行进程可读取这些文件。只恢复数据库不能找回仍由 `local:` 引用的反馈截图；旧备份中没有包含的文件也无法凭数据库引用恢复。

下面的手动导出只包含数据库，不包含上述附件目录：

```bash
docker compose exec -T db pg_dump -U aihot aihot | gzip > myhot-$(date +%F).sql.gz
```

数据都在三个 Docker 卷里：`db`（数据库）、`data`（上传的图片、图片缓存、本地备份）、`caddy`（证书）。`docker compose down` 不会删除它们；`docker compose down -v` 会。

### 看日志

```bash
docker compose logs -f --tail 100 api worker web
```

后台的“运行”页能看到每个定时任务最近的结果，“信源”页能看到每个信源的抓取状况。

### 管理员会话与配置变更

会话绑定登录方式、登录时的管理员凭据或飞书身份。修改管理员密码、飞书管理员名单或会话密钥后，应重启所有 API 进程，使它们加载相同的新配置；只编辑配置文件不代表正在运行的进程已生效，混用旧代码或旧配置的进程不能提供统一撤权。

有效配置改变后，密码会话不再接受旧密码的授权，飞书会话按登录时实际取得的 union ID 或邮箱检查当前名单（两者任一仍获授权即可）。停用飞书登录应用或更换应用 ID 会使飞书会话失效；只轮换同一应用的 secret 不会使仍获授权的飞书会话退出。轮换或移除 `SESSION_SECRET` 会使两种会话都失效。

鉴权时确认失效的会话会被删除，恢复旧配置也不会让它复活。系统不记录全局凭据变更历史：某次配置变化若从未被进程加载，或在恢复前从未被会话检查观察到，不能据此追溯撤销会话。

## 花多少钱

- **模型**：每条新资料先预筛一次；过了预筛的再评两次分、做一次结构化、写一次标题摘要，然后归组（有相近的报道时才调用），另外还有事件综述、周报月报的总述和精选的全文翻译。空正文、纯链接的 X 帖子不调用写作或翻译模型。日报按规则编排，不调用模型。我们用示范信源在本地试跑，第一次导入的 152 条资料一共用了大约 930 次模型调用。之后每天用多少，取决于你的信源每天更新多少条。后台“模型与评测”页能看到每一步的调用次数和输入输出 token 数。
- **付费采集**（X、公众号、Jina）：按请求计费，默认不启用，填了 key 才会用。
- 所有付费服务都有每分钟、每小时、每天的调用上限（后台“设置 → 付费请求上限”），超过就暂停，不会一夜之间刷爆账单。填 0 表示立即停用这个服务。

## 不用 Docker

需要 Node.js 24.11 以上和 PostgreSQL 16 或 17，系统用 Linux 或 macOS；Windows 上请在 WSL2 里运行，或者用上面的 Docker 方式。

```bash
npm ci
node scripts/init-env.ts --llm-key <你的模型 API Key>
createdb myhot
```

在 `.env` 里加上：

```bash
DATABASE_URL=postgres://你的用户名@127.0.0.1:5432/myhot
API_BASE_URL=http://127.0.0.1:3001
```

然后：

```bash
node --env-file=.env scripts/migrate.ts
node --env-file=.env scripts/seed.ts
npm run build -w @aihot/web

NODE_ENV=production node --env-file=.env apps/api/src/main.ts          # 接口，3001 端口
NODE_ENV=production node --env-file=.env apps/worker/src/main.ts       # 后台任务
cd apps/web && NODE_ENV=production node --env-file=../../.env server.ts   # 网页，3000 端口
```

三个进程都要带 `NODE_ENV=production`。api 和 worker 不带它就按开发环境运行：启动时不检查生产密钥和管理员密码，`DEV_AUTH_ROLE` 免登录也会生效。

三个进程要一直运行，生产环境用 systemd 或 pm2 守护（守护配置里同样设 `NODE_ENV=production`）。停止 worker 时给它 515 秒（systemd 的 `TimeoutStopSec=515`、pm2 的 `kill_timeout: 515000` 和 `treekill: false`），覆盖队列的 470 秒排空和数据库清理；systemd 还需设 `KillMode=mixed`，只先通知主进程停止接任务，让正在备份的 `pg_dump`、`tar` 自然完成。被提前杀掉的调用结果不明，要等至少半小时自动放行后才会重试。

开发时用带热更新的方式：`npm run dev:api`、`npm run dev:worker`、`npm run dev:web`。开发时想免登录进后台，在 `.env` 里设 `DEV_AUTH_ROLE=admin`（生产环境会拒绝启动）。

### 编年史结构化数据

配置 TUSHARE_BASE_URL、TUSHARE_TOKEN 后，TUSHARE_SYNC_ENABLED=true 开启工作日 19:30 的指数、估值、公司指标与市场背景同步，以及 09:20 的延迟数据补齐。TUSHARE_FUND_SYNC_ENABLED=true 单独开启每半小时 30 个基金份额代码的持仓同步。密钥只在后端使用，不开启新闻采集或模型调用。快照写入数据卷 chronicle/，更新前备份该目录；新快照行业目录采用申万 2021 一级分类，替换旧版两个中证行业样本。新鲜度按交易日历判断，详见 [Pro 数据说明](pro-data.md)。

/chronicle/compare 提供共同交易日归一化对比和同期精选新闻（最多 100 条，日期为站内时间线日期）；/chronicle/sectors-live 展示实际来源覆盖及行业回报。新闻标记不作因果解释。抱团规则草案见 docs/chronicle-cluster-rules.md，尚未启用组合回测。
