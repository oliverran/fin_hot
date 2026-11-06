# FinHOT 交互教程：从资料到简报

**全是手写合成材料，不是真实新闻、真实模型评分或实时行情。** 不需要 npm 安装、Docker、数据库或 API Key；运行时只监听本机，不读取 `.env`，不调用任何外部服务，也不写入业务数据。

## 运行（Node.js 24.22.1+）

在仓库根目录：

```bash
node examples/selection-lab/server.ts
```

打开 <http://127.0.0.1:4173>。端口被占用时用 `node examples/selection-lab/server.ts --port 4174`。按 Ctrl+C 停止。不需要先运行 `scripts/init-env.ts`。

## 五分钟实验

1. **原始材料**：读虚构公告，注意限定范围、日期、工作日以及保留的 `.example` 地址。
2. **评分实验**：59 + 61 刚好达到 T1 的 2 × 60；点击“媒体来源：差半分”，把第二次评分从 76 改为 77，观察 151 → 152 才达门槛。切换分级、缺失或拒绝状态，观察结果。
3. **归组与出处**：展开引用，比较“原文条件”和“摘要”，分清同一新闻的转述与新增事实。
4. **简报样例**：查看固定手写样例，下载完整的合成 JSON。最后重置，或按任意步骤反复探索。

评分计算直接调用生产 worker 共用的 `packages/backend/src/editorial/selection-scores.ts`，门槛读自 `industry/selection.ts`，没有另抄一套公式。抽出的纯函数仍通过 `editorial/analyze.ts` 的原入口导出。

**这不是端到端生产演示**：采集、预筛、AI 打分、归组、发布、日报编排和数据库都没有运行。评分由用户给定，归组关系和简报是教学预设。界面不会宣称“分数够了就已发布”，固定简报也不会随分数变化。本教程不评估模型质量，不校准金融行业门槛，不证明来源授权。

## 样例与验证

- `model.ts` 是可编辑、可审阅的合成材料与输入校验；页面可下载相同材料的 JSON，包含 `kind: synthetic-tutorial` 标签。
- 运行无需依赖的规则 / HTTP 检查：`node --test tests/selection-lab.standalone.test.ts`。
- 安装项目依赖和 Playwright Chromium 后，浏览器检查：`node --test apps/web/tests/selection-lab.test.ts`。与其他网页检查一起在 CI 运行。
- 页面只从自身的本地服务取数据，无第三方字体、脚本或跟踪。只允许列出的静态文件与两个只读教学接口，不提供任意文件访问或代理。

下一步读[精选与校准](../../docs/selection.md)、[归组与关系评测](../../docs/grouping.md)与[部署文档](../../docs/deploy.md)。真实部署需要单独配置；启用采集和模型调用前先确认来源权限、凭据和费用。

## English quick start

Run `node examples/selection-lab/server.ts` from the repository root, then open <http://127.0.0.1:4173>. Node.js 24.22.1+ is the only requirement. The Chinese-language guided lab uses synthetic materials and user-supplied scores, reuses the worker's actual score gate, and explains provenance with fixed hand-authored grouping and briefing examples. No install, API key, database, collection, paid call or live market feed is involved. Passing the score gate is not publication. Stop with Ctrl+C.
