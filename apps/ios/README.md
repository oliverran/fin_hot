# FinHOT iOS

核心内容通过 `/agent` 页面列出的公开 REST API `/api/v1/*` 接入；正文、主题和图表仍使用明确标注的补充接口。

SwiftUI 原生客户端，默认服务 `https://www.finhub.website`，最低 iOS 17。

使用完整 Xcode 打开 `FinHOT.xcodeproj`，并在 Settings → Components 安装 iOS 模拟器组件。运行数据层行为检查：

```bash
swift run --package-path apps/ios FinHOTCoreChecks
```

iOS 0.1.2（构建号 3）与 Android 共用编年史卷章，支持 A 股与美股、章内目录、关联阅读、24 张原生图表，以及简报版面跳转。

0.1.3（构建号 4）增加匿名冷启动、浏览和关键入口点击统计，与手机网页、安卓汇入同一后台。

从仓库根目录同步两端使用的分类、卷章、图表以及使用规则和隐私说明：`node scripts/sync-ios-resources.ts`。

完整功能范围、当前限制、设备验收与分发步骤见 [移动端说明](../../docs/mobile.md)。已通过 Xcode 26.3 / iOS 26.2 SDK 的模拟器 Debug 和真机无签名 Release 编译；已在 iPhone 16e 模拟器运行，真机签名与分发待完成。
