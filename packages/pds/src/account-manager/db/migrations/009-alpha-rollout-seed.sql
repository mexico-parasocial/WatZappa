-- Seed alpha rollout quotas for all 32 Mexican states
-- Run this after migration 009-alpha-rollout.ts has applied
-- Adjust totalSlots per state as needed for your alpha strategy

INSERT INTO alpha_rollout (state, totalSlots, usedSlots, isOpen, openedAt) VALUES
  ('AGU',  500, 0, 0, NULL),
  ('BCN',  500, 0, 0, NULL),
  ('BCS',  500, 0, 0, NULL),
  ('CAM',  500, 0, 0, NULL),
  ('CHH',  500, 0, 0, NULL),
  ('CHP',  500, 0, 0, NULL),
  ('CDMX', 2000, 0, 1, datetime('now')),
  ('COA',  500, 0, 0, NULL),
  ('COL',  500, 0, 0, NULL),
  ('DUR',  500, 0, 0, NULL),
  ('GRO',  500, 0, 0, NULL),
  ('GTO',  500, 0, 0, NULL),
  ('HGO',  500, 0, 0, NULL),
  ('JAL',  1000, 0, 1, datetime('now')),
  ('MEX',  1000, 0, 0, NULL),
  ('MIC',  500, 0, 0, NULL),
  ('MOR',  500, 0, 0, NULL),
  ('NAY',  500, 0, 0, NULL),
  ('NL',   1000, 0, 0, NULL),
  ('OAX',  500, 0, 0, NULL),
  ('PUE',  500, 0, 0, NULL),
  ('QUE',  500, 0, 0, NULL),
  ('QRO',  500, 0, 0, NULL),
  ('SIN',  500, 0, 0, NULL),
  ('SLP',  500, 0, 0, NULL),
  ('SON',  500, 0, 0, NULL),
  ('TAB',  500, 0, 0, NULL),
  ('TAM',  500, 0, 0, NULL),
  ('TLA',  500, 0, 0, NULL),
  ('VER',  500, 0, 0, NULL),
  ('YUC',  500, 0, 0, NULL),
  ('ZAC',  500, 0, 0, NULL)
ON CONFLICT(state) DO UPDATE SET
  totalSlots = excluded.totalSlots,
  isOpen = excluded.isOpen,
  openedAt = excluded.openedAt;
