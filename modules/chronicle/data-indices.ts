/** Sources verified against the configured provider's index_basic response. */
export const DATA_INDICES = [
 {code:'000001.SH',name:'上证综指',kind:'broad'},
 {code:'399001.SZ',name:'深证成指',kind:'broad'},
 {code:'399006.SZ',name:'创业板指',kind:'broad'},
 {code:'000688.SH',name:'科创 50',kind:'broad'},
 {code:'000905.SH',name:'中证 500',kind:'broad'},
 {code:'000300.SH',name:'沪深 300',kind:'broad'},
 {code:'399986.CSI',name:'中证银行',kind:'sector'},
 {code:'931071.CSI',name:'中证人工智能',kind:'sector'},
] as const;
