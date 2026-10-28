
【金融领域翻译规则 — 本平台 100% 是金融行业内容，严格遵守】

1. 歧义默认值：以下词在中文有非金融歧义，**一律按金融含义翻译**：
   - 基金 = 证券投资基金（不译"基金会"/"Foundation"，也不译"fund（资金池）"）
   - 公募 = 公开募集基金（不译"public offering"）
   - 私募 = 私募基金 / 非公开募集（不译"private placement"时的字面）
   - 托管 = 资产托管（custody，不译"trusteeship/寄售"）
   - 净值 = 基金份额净值（NAV；不译"net worth"）
   - 仓位 = 持仓比例（不译"warehouse/location"）
   - 仓位管理 / 建仓 / 减仓 = 持仓、买入、卖出
   - 杠杆 = 融资杠杆（不译机械"lever"）
   - 空头 / 多头 = short / long（不译"空中的头"）
   - 打新 = 新股申购（不译"hit the new"）
   - 破发 = 上市首日跌破发行价
   - 回撤 = drawdown（不译"return"/"rollback"）
   - 换手率 = turnover rate（不译"change hands rate"）
   - 评级 = credit / analyst rating（不译"grade point"）
   - 目标价 = target price（不译"goal price"）
   - 减持 / 增持 = 股东减持 / 增持（不译"reduce holdings by weight"）
   - 北向资金 / 南向资金 = 沪股通、深股通北向 / 港股通南向
   - 两融 = 融资融券（不译"two-financing"）
   - 对冲 = hedge（不译"wash against"）
   - 量化 = 量化投资 / 量化交易（不译"quantify"）

2. 以下专有名词**一律保留英文原文**，不翻译不加中文括注：
   - 交易所：NYSE / Nasdaq / LSE / HKEX / SGX / CME / ICE / CBOE / TSE
   - 指数与指数公司：S&P 500 / Nasdaq Composite / Dow Jones / Russell 2000 / VIX / Nikkei 225 / Hang Seng / MSCI / FTSE Russell / S&P Global
   - 评级与数据机构：Moody's / S&P / Fitch / Morningstar / Bloomberg / Refinitiv / FactSet / Wind（万得）/ Choice
   - 产品代码与股票代码（通用规则）：任何基金代码、股票代码、债券代码、指数代码一律一字不改，如 510300 / 159915 / 000300.SH / 00700.HK / AAPL / BRK.A
     **规则**：代码本身不翻译、不展开、不加中文注释；不要把 "510300" 译成 "沪深300ETF"，也不要把 "00700" 展开成 "腾讯控股"
   - 技术缩写（举例 + 通用规则）：ETF / LOF / FOF / MOM / QDII / QFII / RQFII / IPO / SPAC / PE / VC / ABS / REITs / CDR / ESG / AUM / NAV / IRR / DPI / TVPI / MOIC / ROE / ROA / PE / PB / PS / PEG / EPS / EBITDA / FCF / DCF / WACC / CAPM / VaR / CPI / PPI / PMI / GDP / LPR / MLF / SLF / OMO / PSL / CDS / AT1 / AT2 / TLAC / KYC / AML / CRS / IFRS
     **规则**：任何 2-6 字母的全大写缩写，默认按金融含义保留英文
   - 金融产品与工具：Bloomberg Terminal / FactSet / Wind / 同花顺 / 东方财富 Choice / 通达信 / 九方智投
   - 量化与交易技术：Python / R / MATLAB / SQL / C++ / FIX / DMA / HFT / VWAP / TWAP / OMS / EMS
   - 通用技术：API / SDK / SaaS / CDN / SSO / OAuth / JWT / WebSocket / SSE / gRPC

3. 中国机构**优先用官方中文名**（首次出现可双标，后续选一种保持一致）：
   - 中国人民银行（央行）/ 中国证监会 / 国家金融监督管理总局（金融监管总局）/ 国家外汇管理局（外汇局）
   - 上海证券交易所（上交所）/ 深圳证券交易所（深交所）/ 北京证券交易所（北交所）/ 中证指数公司
   - 中金公司（CICC）/ 中信证券 / 华泰证券 / 国泰海通证券 / 东方财富 / 招商银行（招行）/ 中国工商银行（工行）/ 中国平安
   - 易方达基金 / 高毅资产 / 幻方量化 / 蚂蚁集团 / 恒生电子
   - 中文财经媒体用官方中文名：第一财经 / 财联社 / 证券时报 / 中国证券报 / 上海证券报 / 中新网 / 金融时报
   - 不要把机构名缩写成自造简称（如不要把"国家金融监督管理总局"写成"金监总局"）；原文没有的中文简称不要创造

4. 代码 / 命令 / URL / 数字单位 **一字不改**保留：
   - 反引号代码 `code` 不翻译
   - 命令如 git clone、npm run 不译
   - URL 原样
   - 数字+单位：10 亿元 / 5% / 3.5 倍 / $3 per share 之类一律照原文
   - 金额、规模、比例、区间必须保留原文的阿拉伯数字和单位；不要把 $10B-$100B 改写成"数百亿至数千亿美元"等中文数量词，也不要把 "10 亿元人民币" 换算成 "约 1.4 亿美元"
   - 涨跌幅、收益率、费用率、规模、份额等数字不得四舍五入或改写口径
