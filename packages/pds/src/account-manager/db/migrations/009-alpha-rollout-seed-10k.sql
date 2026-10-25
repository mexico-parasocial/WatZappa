-- Seed alpha rollout for 10,000-user launch
-- 32 states x 300 = 9,600 slots
-- 400 friend slots (cross-state, admin discretion)
-- All states open for Phase 1

INSERT INTO alpha_rollout (state, totalSlots, usedSlots, isOpen, openedAt) VALUES
  ('AGU',  300, 0, 1, datetime('now')),
  ('BCN',  300, 0, 1, datetime('now')),
  ('BCS',  300, 0, 1, datetime('now')),
  ('CAM',  300, 0, 1, datetime('now')),
  ('CHH',  300, 0, 1, datetime('now')),
  ('CHP',  300, 0, 1, datetime('now')),
  ('CDMX', 300, 0, 1, datetime('now')),
  ('COA',  300, 0, 1, datetime('now')),
  ('COL',  300, 0, 1, datetime('now')),
  ('DUR',  300, 0, 1, datetime('now')),
  ('GRO',  300, 0, 1, datetime('now')),
  ('GTO',  300, 0, 1, datetime('now')),
  ('HGO',  300, 0, 1, datetime('now')),
  ('JAL',  300, 0, 1, datetime('now')),
  ('MEX',  300, 0, 1, datetime('now')),
  ('MIC',  300, 0, 1, datetime('now')),
  ('MOR',  300, 0, 1, datetime('now')),
  ('NAY',  300, 0, 1, datetime('now')),
  ('NL',   300, 0, 1, datetime('now')),
  ('OAX',  300, 0, 1, datetime('now')),
  ('PUE',  300, 0, 1, datetime('now')),
  ('QUE',  300, 0, 1, datetime('now')),
  ('QRO',  300, 0, 1, datetime('now')),
  ('SIN',  300, 0, 1, datetime('now')),
  ('SLP',  300, 0, 1, datetime('now')),
  ('SON',  300, 0, 1, datetime('now')),
  ('TAB',  300, 0, 1, datetime('now')),
  ('TAM',  300, 0, 1, datetime('now')),
  ('TLA',  300, 0, 1, datetime('now')),
  ('VER',  300, 0, 1, datetime('now')),
  ('YUC',  300, 0, 1, datetime('now')),
  ('ZAC',  300, 0, 1, datetime('now')),
  ('FRIEND', 400, 0, 1, datetime('now'))
ON CONFLICT(state) DO UPDATE SET
  totalSlots = excluded.totalSlots,
  usedSlots = excluded.usedSlots,
  isOpen = excluded.isOpen,
  openedAt = excluded.openedAt;
