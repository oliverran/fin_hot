-- 访客指标的明细：每次页面浏览或关键入口点击一行，只存随机访客号，不含 IP、账号或用户代理。
-- 按天保留（ANALYTICS_RETENTION_DAYS，默认 90 天），由 retention 清理；长期趋势看 0092 的每日汇总。
CREATE TABLE IF NOT EXISTS analytics_events (
  day date NOT NULL,
  at timestamptz NOT NULL,
  kind text NOT NULL,
  path text NOT NULL,
  module text NOT NULL,
  label text,
  visitor text NOT NULL
);
