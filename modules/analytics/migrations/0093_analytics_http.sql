-- 接口指标：按「北京日期 × 路由」聚合的一行，api 进程每分钟把进程内的累计并进来。
-- 一天一个路由只有一行，长期留着不占地方，所以不像访客明细那样按天清理。
-- 延迟按上界分桶存（le_* 是「不超过该毫秒数」的次数，gt_3000 是溢出格），p95 从桶里估出来。
CREATE TABLE IF NOT EXISTS analytics_http (
  day date NOT NULL,
  path text NOT NULL,
  requests bigint NOT NULL,
  errors bigint NOT NULL,
  ms_total bigint NOT NULL,
  ms_max integer NOT NULL,
  le_50 integer NOT NULL,
  le_100 integer NOT NULL,
  le_300 integer NOT NULL,
  le_1000 integer NOT NULL,
  le_3000 integer NOT NULL,
  gt_3000 integer NOT NULL,
  PRIMARY KEY (day, path)
);
