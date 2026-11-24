CREATE TABLE IF NOT EXISTS opportunities (
  id bigserial PRIMARY KEY,
  date date NOT NULL,
  seq integer NOT NULL,
  direction text NOT NULL CHECK (direction IN ('bullish', 'bearish', 'neutral')),
  title text NOT NULL,
  summary text NOT NULL,
  catalyst text NOT NULL,
  logic text NOT NULL,
  watch text NOT NULL,
  risk text NOT NULL,
  symbols jsonb NOT NULL,
  evidence jsonb NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, seq)
);
