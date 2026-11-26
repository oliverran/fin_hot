# 用 FinHOT MCP 做一份中文财经早报

不用自部署 FinHOT，不用注册或准备 API Key。用支持远程 Streamable HTTP 的 MCP 客户端，读取过去 24 小时的公开精选资讯。每条保留 FinHOT 页面和信源原文两种链接；服务只读，不涉及交易。

## 1. 接入

在客户端添加远程 MCP 地址 `https://www.finhub.website/api/mcp`。例如，在 Claude Code 中运行：

```bash
claude mcp add --transport http finhot https://www.finhub.website/api/mcp
```

其他客户端见 [FinHOT Agent 接入说明](https://www.finhub.website/agent)。

## 2. 复制这条提示词

```text
请调用 finhot_get_latest，参数 window="24h"、mode="selected"、limit=3。
用北京时间注明覆盖时段。每条写「时间｜标题｜一句事实」，
附上 FinHOT 链接和原文链接。按返回条目写，有几条就写几条。
只依据工具返回的公开内容，不补写原文没有支持的数字或投资判断。
没有原文链接就标明，不猜网址；调用失败就说明，别用模型记忆补出一份早报。
```

先手动运行一次。如果你的客户端支持定时任务，再把同一条提示词设为每天早上运行。MCP 本身不会自动发早报。

## 3. 一次真实返回的链接样例

2026 年 11 月 26 日对公开 MCP 的匿名调用返回了 3 条精选，均有标题、摘要、发布时间和两种链接。下面是那次返回的链接摘录，不是实时榜单；时间由返回的 `publishedAt` 换算为北京时间。

| 发布时间（北京时间） | FinHOT | 信源原文 |
| --- | --- | --- |
| 11 月 26 日 10:21 | [详情](https://www.finhub.website/items/i25fojfh0m2fqbr2ym2k4xav9) | [财联社](https://www.cls.cn/detail/2544925) |
| 11 月 26 日 00:00 | [详情](https://www.finhub.website/items/k42ky7eejdcktphttwta7bszb) | [东方财富研报](https://data.eastmoney.com/report/zw_strategy.jshtml?infocode=AP202611261832053157) |
| 11 月 26 日 08:52 | [详情](https://www.finhub.website/items/kivaollubbqysg7q2vrj1juc9) | [财联社](https://www.cls.cn/detail/2544796) |

条目顺序沿用工具返回，并非按发布时间排序。重要数字、政策和原话应回原文核对；不把 AI 摘要当作投资建议。
