-- 访客指标的每日汇总，永久保留：明细按天清理后，长期趋势仍从这里读。
-- 由 retention 每天按明细重算最近几天（幂等），当天的数从明细现读，不写进来。
CREATE TABLE IF NOT EXISTS analytics_daily (
  day date PRIMARY KEY,
  views bigint NOT NULL DEFAULT 0,
  visitors bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0
);
