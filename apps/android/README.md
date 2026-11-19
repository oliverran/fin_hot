# FinHOT Android

Kotlin + Jetpack Compose 原生客户端，最低 Android 8.0（API 26），默认连接 `https://www.finhub.website`。

功能：分类资讯、搜索、只看未读、正文段落与图片、收藏、阅读记录和继续阅读，热点事件、日报周报月报、主题目录，以及 19 张 A 股与 5 张美股编年史图表。界面不使用 WebView；来源原文由读者主动选择打开。

资讯、热点、事件和简报从 `/agent` 页面列出的公开 REST API `/api/v1/*` 读取。正文、主题和图表使用网站已有的补充接口，尚不具备版本化公开契约。没有账号、推送、云同步或离线新闻库。

## 构建

需要 JDK 21、Android SDK Platform 36、Build Tools 36.0.0，以及 Android Studio 或 Gradle 8.13。

1. 在仓库根目录运行 `node scripts/sync-ios-resources.ts`，为两端同步网站分类、图表目录，为 Android 同步条款文案。
2. 用 Android Studio 打开本目录；或设置 `ANDROID_HOME` 为 SDK 路径。
3. 执行 `./gradlew :app:testDebugUnitTest :app:assembleDebug`。

调试包位于 `app/build/outputs/apk/debug/app-debug.apk`。它使用开发调试签名，只用于测试；公开发行需设置你自己的签名并完成设备验收。签名文件、密码和 `local.properties` 不入库。

不需要安装 Android 模拟器即可编译 APK；测试实际交互可使用安卓真机。首次构建会下载 Gradle 与 Maven 依赖。Google SDK 许可需由使用者确认。

## 模拟器运行

本机准备完成后，双击 `run-emulator.command` 即可启动专用 Android 16 虚拟手机、安装当前 Debug APK 并打开 FinHOT。关闭模拟器窗口即可退出；阅读记录保存在这台虚拟手机里。启动器不下载工具，也不重新编译 APK。

虚拟设备放在 `~/Library/Developer/FinHOT/avd`，名称 `FinHOT_Phone_API36`，使用端口 5580。模拟器日志在 `~/Library/Logs/FinHOT/emulator.log`。本机使用 720×1560、2GB RAM，关闭快照以减少磁盘占用。

其他机器需先安装对应 SDK 包并创建同名虚拟设备（首次安装需确认 SDK 许可）：

```bash
sdkmanager 'emulator' 'system-images;android-36;default;arm64-v8a'
ANDROID_AVD_HOME="$HOME/Library/Developer/FinHOT/avd" \
  avdmanager create avd --name FinHOT_Phone_API36 \
  --package 'system-images;android-36;default;arm64-v8a' --device pixel_7
```

随后构建 Debug APK，再运行启动器。Android 模拟器可以验收原生页面和阅读流程；实际手机性能及厂商系统差异仍需真机验证。

## 数据与状态

- 本机 SharedPreferences 保存收藏 ID、已读 ID、正文指纹、段落位置和字号，禁用系统备份，不保存新闻正文或标题到持久状态，也不向服务器上传阅读记录。
- API JSON 仅作限量内存缓存，遵循 Cache-Control、Age、ETag；过期内容不作为离线新闻显示。429/503 的 Retry-After 期间暂停发起新请求。
- 列表保留服务端排序，原样传回游标。切换分类/关键词重置游标，游标失效显示刷新入口。
- 正文成功展示后记为已读；返回未读列表时，若原文章已移出列表，定位到仍可见的附近文章。
- 正文指纹相同才恢复段落。撤回全文或内容修订后，旧位置失效；摘要模式不展示正文。
- 收藏顺序不因重新启动改变。网站与 App、iOS 与 Android 之间暂不自动同步。

编年史按卷章原生阅读。A 股沿用网站的宽基、行业、抱团与分年代大事记，美股按卷首先行、再读九卷的顺序组织。章节导读、图文解读和关联阅读在构建时从网站内容同步，图表索引可单独进入。复杂交互图在读者选择「在官网查看本节原图」时打开。

美股图表读取官网现有的 `/us-market/api/` 快照，包含标普 500、纳斯达克 100、道琼斯工业平均指数及两张年度涨跌幅图。图表在后台线程解析，在接口允许的有效期内最多留存四张已经解析的图表。

JVM 单元测试不访问外部网站，覆盖公开 JSON 解码、收藏顺序、已读状态、段落恢复、撤回全文、去重分页和事件 ID 等行为。交互、系统返回、字号、弱网、后台恢复和原生图表还需设备验收。

使用规则和隐私说明来自 `site/pages/`。0.1.3（构建号 4）已接入网站后台的匿名访问和入口点击统计，口径见 [移动端说明](../../docs/mobile.md)。更多美股专题、图表完整交互、视频、图片放大和完整表格排版留待后续迁移。测试 APK 不代表已经上架应用商店。

## 本机验证记录（2026-11-17）

- Debug APK 编译通过，11 项 JVM 单元测试全部通过，包含北京时间跨日显示检查。
- APK 调试签名与 ZIP 完整性检查通过；包名 `website.finhub.finhot`，版本 `0.1.0`，最低 API 26、目标 API 36，约 13MB。
- 最小工具链已安装：JDK 在 `~/Library/Java/JavaVirtualMachines/FinHOT-Zulu-21.jdk`，SDK 在 `~/Library/Android/sdk`，Gradle 缓存在 `~/.gradle`。已补装 Android Emulator 37.2.13 与 Android 16 AOSP ARM 镜像，未安装 Google Play。
- 本机保留本次调试签名的目录为 `~/Library/Developer/FinHOT/android-user`；后续测试包沿用它，避免调试签名变化。该目录包含密钥，不能提交或公开。
- 官方 Maven Central 首次下载有 TLS 握手失败，本机通过临时镜像配置完成依赖解析，项目自身仍使用官方仓库。已验证移动工具链目录后可以离线重建。

本机复现命令（从仓库根目录）：

```bash
ANDROID_USER_HOME="$HOME/Library/Developer/FinHOT/android-user" \
  ./apps/android/gradlew -p apps/android --no-daemon --offline \
  -I "$HOME/Library/Developer/FinHOT/mirrors.gradle" \
  :app:testDebugUnitTest :app:assembleDebug
```

上述镜像脚本是本机构建环境的一部分，不是运行 App 的配置，也不需要发给读者。其他机器使用本文件前面的标准构建步骤。

已在 Android 16 ARM64 模拟器（720×1560，2GB RAM）实际验证：分类筛选、原生文章加载、已读标记、收藏、系统返回后的文章定位、只看未读时移除刚读过的文章、收藏列表、继续阅读、热点和事件详情、日报，以及上证综指图表抽查。整台模拟器关闭重启后，收藏和已读记录仍保留；运行时日志没有发现 `FATAL EXCEPTION`。双击 `run-emulator.command` 的启动流程已实际运行，窗口可独立保留供使用者操作。

安装文件来自 Google 官方源；下载断连后补齐缺失分段，通过官方 SHA-1 和 ZIP 完整性检查才解压安装，临时压缩包已清理。启动器等待模拟器进程退出，避免脚本结束时回收虚拟手机。

目前没有连接 Android 真机。返回手势、弱网、系统回收进程、大字体、深浅色、横屏、配图及其余图表仍需专项验收。构建有 SDK 元数据版本提示，以及 Debug 图形库未剥离符号的提示；没有关闭检查来隐藏它们。正式发行前仍需统一发布工具版本、配置正式签名和完成真机验收。

同期回归：网站类型检查和生产构建通过；后端 1011 项测试通过；线上冒烟检查 30 项通过；网页测试 39 项通过、24 项因缺少 Playwright 浏览器程序失败。资源同步后的 iOS Debug SDK 编译通过，iOS 模拟器实际运行仍待组件下载完成。
