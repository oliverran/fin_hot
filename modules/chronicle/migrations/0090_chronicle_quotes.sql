-- 编年史图表的行情来源：核心宽基指数的日线，由 worker 在交易日收盘后从公开行情接口刷新。
CREATE TABLE IF NOT EXISTS chronicle_quotes (
  code text NOT NULL,
  trade_date date NOT NULL,
  open numeric(14, 4),
  close numeric(14, 4) NOT NULL,
  high numeric(14, 4),
  low numeric(14, 4),
  volume bigint,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, trade_date)
);
