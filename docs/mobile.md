# FinHOT 移动客户端

## 当前交付

iOS 原生首版源码在 `apps/ios/`，SwiftUI + Foundation + Swift Charts，最低 iOS 17，支持 iPhone 和 iPad，不引入第三方移动端依赖。默认连接 `https://www.finhub.website`，启动直接进入原生资讯页，不要求读者输入地址，不使用 WebView。

已实现：

- 最近 7 天的精选、全部动态、分类筛选、只看未读、搜索、游标加载和下拉刷新；分类复用网站公开词表，搜索同网站一样在全部公开动态中查找。
- 文章摘要、精选理由、授权范围内的原生正文和配图、关联事件、系统分享；只有主动选择“来源原文”才访问外部网页。正文按段落原生展示，支持标题层级、可点击链接、配图和三档字号；尚未迁移内嵌视频、表格排版和图片放大查看。
- 热点排行、原生事件综述和报道时间线。
- 日报/周报/月报索引、原生阅读、引用文章导航；公开 API 在服务端移除撤回引用。当前日报索引最多 180 期，周报和月报各最多 60 期。
- 金融主题目录与分页、按网站隔离的本机收藏、已读记录和段落位置；收藏按保存顺序展示，重启后不改为 ID 排序。收藏仅保存 ID，读取时重新核对公开状态，不保存离线正文或标题。
- A 股宽基、行业、抱团与大事记，美股卷首及九卷，共用安卓 0.1.2 的卷章与段落。19 张 A 股图和 5 张美股图可在章节与索引中原生查看；章节默认全历史。美股图取自网站 `/us-market/api/`，复杂交互图提供官网原图入口。
- 动态字体、系统深浅色、原生导航和分享。

尚未迁移：抱团/估值等专题的完整交互图、基金和公司数据面板、视频与完整富文本排版。没有实现推送、账号同步或离线新闻。Android 已并行实现同一阅读流程，源码与构建说明见 `apps/android/README.md`。

## 打开与运行

1. 在 Mac 安装完整 Xcode，并在 Settings → Components 安装 iOS 平台和模拟器组件。只有 Xcode 主程序而没有模拟器组件，仍无法启动 iPhone 模拟器。
2. 运行 `node scripts/sync-ios-resources.ts` 同步网站的公开分类和图表文案。
3. 打开 `apps/ios/FinHOT.xcodeproj`，选择共享的 `FinHOT` scheme 与 iPhone 模拟器，点击 Run。
4. 真机运行在 Signing & Capabilities 中选择自己的 Team，并根据开发者账号设置 Bundle Identifier。当前占位为 `website.finhub.FinHOT`。

默认域名在 `apps/ios/FinHOT/Info.plist` 的 `FinHOTSiteURL`。Debug 构建的“我的 → 开发连接”可切换网站，Release 隐藏此入口。开发连接只额外接受本机 loopback HTTP，未开放全局 ATS；正式站点使用 HTTPS。无需配置数据库、模型或管理员密钥。

从 0.1.3（构建号 4）起，iOS 和安卓接入网站的匿名统计。后台「指标监控 → 访问终端」按 iOS App、安卓 App、移动网页与其他网页列出访客、浏览和关键入口点击，App 另列进程冷启动。明细包含当前站点的随机访客号；原生端只上报固定页面类别和入口名称。一个人用不同安装或浏览器会分别计数。终端表最多覆盖近期 30 天，旧版 App 的访问无法回填。上线顺序为先应用 0094 迁移及更新后台，再分发客户端。

收藏、已读记录和阅读位置使用 UserDefaults；App 的隐私清单列出访问本机设置的原因。使用规则与隐私说明以 `site/pages/` 为文案来源。修改后运行 `node scripts/sync-ios-resources.ts`，两端随安装包读取同一份离线文档。两份文案按 2026 年 11 月 18 日确认的个人阅读、内部研究和官网反馈渠道编写。运营主体尚待提供。日志、统计明细和反馈材料的目标保留期为 30 天，正式发布前需在托管、CDN、反馈存储和转发服务上核实实际执行。

## 验证

数据层行为检查不依赖 Xcode/XCTest，也不访问外部网络，使用 URLProtocol 假响应：

```bash
swift run --package-path apps/ios FinHOTCoreChecks
```

覆盖地址验证、中文与保留字符查询、图表路由、404 撤回、非法响应、空值与游标、收藏移除、缺失行情和撤回引用。

仅编译模拟器目标，不要求启动模拟器：

```bash
xcodebuild -project apps/ios/FinHOT.xcodeproj -target FinHOT \
  -configuration Debug -sdk iphonesimulator \
  SYMROOT=/tmp/finhot-ios-target OBJROOT=/tmp/finhot-ios-target/Objects \
  CODE_SIGNING_ALLOWED=NO build
```

真机目标的无签名 Release 编译：

```bash
xcodebuild -project apps/ios/FinHOT.xcodeproj -target FinHOT \
  -configuration Release -sdk iphoneos ARCHS=arm64 \
  SYMROOT=/tmp/finhot-ios-device OBJROOT=/tmp/finhot-ios-device/Objects \
  CODE_SIGNING_ALLOWED=NO build
```

2026-11-17 已在 Xcode 26.3（17C529）/ iOS 26.2 SDK 下完成上述两种构建：模拟器 Debug 包含 arm64 与 x86_64，真机 Release 为 arm64。首次完整编译发现的 AppState 初始化顺序问题已修复，16 项数据层检查也在新 Xcode 工具链下通过。

已生成的临时产物分别在 `/tmp/finhot-ios-target/Debug-iphonesimulator/FinHOT.app` 和 `/tmp/finhot-ios-device/Release-iphoneos/FinHOT.app`。后者没有签名，不能直接安装到 iPhone，也没有完成 IPA 导出或 App Store 上传。

2026-11-18 已在 iPhone 16e 模拟器（iOS 26.3.1）安装并启动 FinHOT，首页从线上接口读取资讯。界面测试已验证市场分类、阅读和收藏、返回显示已读、重新启动后打开收藏文章、只看未读时返回继续浏览，以及从“我的”继续阅读。还打开了热点事件详情、当期日报和上证综指图表。16 项原生数据层检查通过。

此前网站回归检查与当前原生检查结果：

- 原生数据层：16 项行为检查通过，包括公开 API 的热点事件 ID、三种简报映射、游标、搜索参数、Retry-After 与撤回等行为。此前网站补充接口的真实响应解析通过（20 条资讯、10 个热点、2026-11-17 日报、1664 个沪深 300 数据点）。
- 仓库 `npm run typecheck` 与网页生产构建通过。
- 后端隔离数据库测试：1007/1007 通过。
- 对 `https://www.finhub.website` 的现有冒烟脚本：30 项全部通过。本机 3000 端口没有运行站点，因此本机冒烟未通过。
- 网页测试：39 项通过，24 项因机器未安装 Playwright 对应 Chromium/WebKit 可执行文件而失败；未将其记为通过。
- Xcode 工程、Info.plist 与隐私清单格式检查通过；模拟器 Debug 和真机无签名 Release 完整编译通过。

完整设备验收范围包括：冷启动、每个 Tab、正文配图、搜索清空/换词/翻页、快速切换过滤条件、网络失败重试、前后台切换、收藏移除、撤回内容、日报引用、图表空数据、深浅色、大字体和 iPad 横屏。

## 阅读流程（2026-11-17）

- **分类筛选**：从网站公开分类生成 `Resources/categories.json`，与精选/全部及搜索条件一起传给 `/api/v1/items`；改变查询条件会清空旧游标。只看未读在当前加载列表中筛选，不把“这一页读完”误写成“全部资讯读完”，可以继续加载更多。
- **阅读与已读**：只在文章详情成功返回并展示后记录已读。列表与收藏显示已读/未读，资讯列表左右滑动分别操作已读状态与收藏。已读历史沿用网页 5000 条的上限。
- **收藏**：保留本机保存顺序，重启后顺序不变；在文章页取消收藏不会依赖被移除列表行来维持导航。
- **返回列表**：列表在本次 App 会话内保留分类、搜索、已加载页面和文章锚点。未读筛选下，刚读过的文章移出列表时，导航仍保持在文章页；返回后优先定位原锚点，否则定位原顺序中仍可见的下一条、上一条。位置按文章恢复，不承诺像素完全一致。
- **内容过期**：返回或从后台恢复时，如果列表已过服务端缓存期限，重新取之前已加载的页数，再定位仍公开可见的附近条目；不会为找一条已撤下的文章无限翻完历史。刷新失败显示错误，不把已过期的正文当作离线内容。手动刷新和更换分类从列表顶部开始。
- **继续阅读**：“我的”新增继续阅读和阅读记录。离开文章或 App 进入后台时，保存当前段落 ID 与内容指纹；下次成功读取同一版本后恢复。文章被修订或全文授权改变时，指纹不同，从开头阅读。标为未读会清除该篇阅读位置。重新启动后通过“我的 → 继续阅读”返回文章，资讯列表不落盘保存。
- **本地数据**：收藏与阅读状态按网站分别保存，正文、标题、摘要和列表游标不持久保存，也不上传已读与进度。字号是本机阅读偏好，不增加账号或云同步。

正文使用服务端已清洗的 HTML 分段，再转换为原生 Text/AsyncImage；列表和阅读位置使用 SwiftUI 原生导航与滚动能力。当前仍需在实际运行的模拟器或真机中验证：从第 3 页返回、快速切分类、只看未读时打开最后一篇、收藏后取消收藏、后台恢复、超期刷新、内容撤回、字号变化及大字体下的段落恢复。数据层检查不等于完成这些界面验收。

## 分发

工程尚不是可下载的发行包。已完成上面的 iOS SDK 编译；接下来完成设备验收，并补充 AppIcon 资产、开发者签名、版本截图及运营者确认的条款与隐私说明。不要将示例 Bundle Identifier 当作已注册的应用标识。

通过 Xcode Archive 上传 App Store Connect，可以先提供 TestFlight 测试，再提交 App Store 审核供他人下载；需要你的 Apple Developer 账号和相应发布权限。详见 [Apple 上传构建说明](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/) 与 [TestFlight](https://developer.apple.com/testflight/)。当前未上传或发布任何内容。

## 接入方案复核（2026-11-17）

已核对线上 [Agent 接入](https://www.finhub.website/agent) 和 [OpenAPI](https://www.finhub.website/openapi-v1.json)，以及仓库的公开读取层。保留 SwiftUI 原生客户端与共用后端；核心内容已从网站内部接口改接公开 REST API。

| 接入方式 | 移动端用途 |
|---|---|
| REST JSON `/api/v1/*` | App 的主数据接口；有明确查询参数、错误码、分页与缓存契约 |
| MCP `/api/mcp` | AI 助手的工具调用；普通列表和阅读页面无需额外增加工具发现和 JSON-RPC 会话 |
| Agent Markdown `/api/v1/agent/*` | 给模型和文字型 Agent 阅读；原生页面不解析面向阅读的排版来重建结构 |
| RSS | 阅读器订阅；当前 App 使用 JSON 取得分页、搜索和事件结构 |
| selected snapshot + changes | 完整精选库同步；首版没有本地新闻库，不启动全量同步或后台轮询 |

公开 API 接入复核已用线上真实响应验证：3 条资讯、10 个热点、7 篇事件报道，19 期日报、3 期周报、1 期月报索引，以及三种简报各一期的 4 个栏目均成功解析。

各协议读取同一份公开内容；App 不重新采集、不调用模型，不需要 API Key。`/agent` 是接入说明页，不是 App 启动后要打开的页面。

当前请求映射：

| 页面 | 已使用的接口 |
|---|---|
| 精选、全部、搜索 | `/api/v1/items`：`mode`、`window=7d`、`by=timeline`、`q`、`cursor` |
| 热点 | `/api/v1/hot-topics`；从 `links.story` 取得事件 ID，不能把代表报道的 `id` 当作事件 ID |
| 事件 | `/api/v1/stories/{publicId}`；将公开 `reports` 映射为原生时间线 |
| 日报 | `/api/v1/dailies`、`/api/v1/dailies/{date}` |
| 周报、月报 | `/api/v1/weeklies`、`/api/v1/monthlies` 及对应的指定期接口 |
| 正文、收藏状态核对 | **补充接口** `/api/site/items/{id}` |
| 主题 | **补充接口** `/api/site/topics`、`/api/site/topics/{slug}` |
| 图表 | **模块接口** `/api/chronicle/{group}/{slug}.json` |

公开 v1 暂未提供单篇正文、主题或编年史图表。因此当前并不是所有功能都已具备稳定公开契约：这三项仍需随网站发版核对。长期面向 App Store 发布后，建议为它们补充有版本的公开契约，再迁移对应的补充调用；不能仅修改 URL 前缀，或让 App 临时解析 Markdown/网页填补数据。

代码在 `Core/PublicAPI.swift` 集中映射公开契约，`Core/Models.swift` 保存原生展示模型。JSON 中的 `links.aihot` 是既有协议字段名，展示仍使用 FinHOT。接口说明版本 `4.0.0`、URL 中的 `v1` 和响应的 `schemaVersion: 1` 是不同概念，客户端按实际响应契约解析。

### 缓存与错误

公开 v1 请求采用系统 `useProtocolCachePolicy` 与仅内存的 URLCache，按响应的 Cache-Control/ETag 处理新鲜度与重新验证，不自行延长服务端期限，不用离线兜底展示过期正文。单篇正文和主题补充接口仍请求当前公开状态。列表页保存接口响应的实际失效时间，扣除 Age/Date 已消耗的时间；翻页不会重新起算之前页面的有效期。缓存行为与 304 的实际运行验证仍待专项验收，假服务检查不代替系统缓存验收。

`429`/`503` 带 Retry-After 时，连接的所有页面共用等待截止时间；支持秒数和 HTTP 日期，没有自动重试循环。游标原样传回服务器，`invalid_cursor` 显示“刷新列表”，由读者重新从第一页查询。搜索按公开接口限制验证 2–200 个 Unicode code point。列表保持服务端顺序，不用发表日期或发现时间在本机重新排序。

公开热点没有网站卡片的摘要，简报接口没有期号和阅读分钟数，这些位置不虚构数据。公开资讯接口只覆盖 24 小时或 7 天，不能把当前列表称为完整历史库；如需完整精选库，再设计快照分页、增量 upsert/remove、原子保存游标与 409 重建流程。

## Android 并行开发

iOS 与网站共用现有只读 HTTP 数据，未新增数据库、模型调用或发布出口。Android 复用公开 REST 契约和行为约定，不直接依赖 Swift 展示模型。

Android 已按相同端点实现 Kotlin/Jetpack Compose 客户端，复用后端与产品行为；SwiftUI 界面代码不能直接复用。iOS 模拟器组件下载期间完成 Android 工程，优先对齐分类、阅读、已读、收藏和继续阅读，再迁移更复杂的研究功能。已完成 11 项 JVM 检查和 Debug APK 编译，APK 调试签名验证通过。Android 16 ARM64 模拟器已安装并运行，实际验证了分类、阅读、已读、收藏、返回列表、未读移除、继续阅读、热点详情、日报和上证综指图表；模拟器整机重启后收藏和已读仍保留。双击 `apps/android/run-emulator.command` 可重新打开。当前未连接 Android 真机，手势、弱网、主题/字号及厂商系统差异仍需专项验收。Android 构建与运行记录见 `apps/android/README.md`。

- [x] 已完成本轮 Android 样式优化。资讯列表将收藏与已读操作收入文章菜单，底部导航与筛选共用青色选中态，阅读页顶栏可切换字号，摘要随字号调整。已在 Android 16 模拟器验证分类、收藏、阅读与返回。


## 断网恢复与辅助字号验收（2026-11-18）

iPhone 16e 模拟器使用本机测试接口加载两页资讯。在第二页打开文章，返回时让列表请求收到一次 HTTP 503，点“重试”后确认再次请求了两页，原文章可见。最大辅助字号下，资讯范围改用菜单，实测可以从精选切换到全部动态。

Android 16 模拟器在飞行模式下冷启动 FinHOT，显示“重试”。恢复联网后点重试，线上资讯正常加载。系统字体设为 1.8 倍时，已在窄屏上切换资讯与编年史、选择分类、打开阅读操作菜单和调整阅读字号。测试结束后恢复了原网络与字号设置。Android 的多页重试也保留恢复页数，本次飞行模式用例覆盖的是首页。

## 双二维码与发行包

官网的「下载 App」页面使用两张独立二维码。iOS 固定指向 `https://www.finhub.website/download/ios`，Android 固定指向 `https://www.finhub.website/download/android`。同一平台更新版本时继续使用原码。

- iOS 邀请链接填写在 `site/site.ts` 的 `IOS_DOWNLOAD_URL`。获得 TestFlight 公开邀请或 App Store 产品页后重新构建网站。未配置链接时页面显示开放状态。
- 安卓正式包使用包名 `website.finhub.finhot`。首版为 0.1.0（构建号 1），证书 SHA-256 为 `129334e3ce0e43701b09f8ff59da9e81cfc8b9d648ed5763fa4feb1d4c41b83b`。使用 Android SDK 的 `apksigner verify --verbose --print-certs` 校验签名。后续升级使用同一密钥，并递增 versionCode。
- 将签名后的 APK 放入网站构建上下文的 `modules/mobile-download/web/release/FinHOT.apk`，再运行已有的网页或 Docker 构建。该目录已被 Git 忽略。从干净检出构建时需要单独提供发行包。网页会将包作为带内容指纹的资源发布；没有提供发行包的构建会显示暂未开放。
- 这台 Mac 上的发布密钥位于用户的 `Library/Application Support/FinHOT/signing/finhot-release.p12`，别名为 `finhot`。密码在登录钥匙串，服务名为 `website.finhub.finhot.release`。应另行加密备份密钥和恢复凭据，保管在发行人员可恢复的位置。
- TestFlight 真机验收需要有权限的团队、可用的测试邀请和两份构建号递增的已处理构建。用实体 iPhone 扫 iOS 码安装第一份，打开一篇文章并收藏，从 TestFlight 覆盖更新后，核对同一篇文章的收藏、已读状态和阅读位置。

2026-11-18 验证记录：新版 iOS 数据模型读取线上 19/19 张图表。风格比值包含 2,938 个共同观测日，250 日均线的前 249 个空点保留。iPhone 16e 模拟器从构建号 1 覆盖安装构建号 2，两条原有收藏及已读、阅读位置存储均保留。真机目标已完成无签名 Release 归档；没有进行 TestFlight 上传、邀请安装或实体 iPhone 升级。Android 0.1.0 正式 APK 通过 v2/v3 验签，在本地生产构建通过安卓专属入口下载的文件与签名原件逐字节一致。

### 0.1.3 发布记录

2026 年 11 月 19 日。安卓包名 `website.finhub.finhot`，版本号 0.1.3，构建号 4，沿用原发行证书并通过 APK v2/v3 验签。正式 APK 的 SHA-256 为 `c3082ab47ede45aa61d9145e9217f162cd757af18b8b017223054bff09a58d60`。用户可从[官网扫码页](https://www.finhub.website/download)安装或覆盖升级，原有二维码继续有效。

iOS 源码与构建号同步至 0.1.3（4），已完成模拟器统计联调和真机目标无签名编译。TestFlight 和 App Store 分发待完成。

### 0.1.4 发布记录

2026 年 11 月 19 日，构建号 5。两端在「我的」原生展示使用规则与隐私说明，保留已确认的正文、日期和反馈链接。文档随包提供，可离线查看。

安卓包名为 `website.finhub.finhot`，沿用 0.1.3 的发行证书。正式 APK 的 SHA-256 为 `e6bcc3dc5c006eee2d9ebf94cdbd6576cbbbccbfdddd916808f582fa0399dae7`，原官网二维码和安卓下载地址继续适用。iOS 使用 `website.finhub.FinHOT` 的个人开发签名安装到已配对设备。
