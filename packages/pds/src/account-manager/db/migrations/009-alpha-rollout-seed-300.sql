-- Seed alpha rollout for 300-user controlled launch
-- Strategy: 3 pilot states open, rest closed
-- CDMX (capital, tech-savvy), Jalisco (Guadalajara startup hub), Nuevo Leon (Monterey industry)

INSERT INTO alpha_rollout (state, totalSlots, usedSlots, isOpen, openedAt) VALUES
  ('AGU',  0, 0, 0, NULL),
  ('BCN',  0, 0, 0, NULL),
  ('BCS',  0, 0, 0, NULL),
  ('CAM',  0, 0, 0, NULL),
  ('CHH',  0, 0, 0, NULL),
  ('CHP',  0, 0, 0, NULL),
  ('CDMX', 150, 0, 1, datetime('now')),
  ('COA',  0, 0, 0, NULL),
  ('COL',  0, 0, 0, NULL),
  ('DUR',  0, 0, 0, NULL),
  ('GRO',  0, 0, 0, NULL),
  ('GTO',  0, 0, 0, NULL),
  ('HGO',  0, 0, 0, NULL),
  ('JAL',  100, 0, 1, datetime('now')),
  ('MEX',  0, 0, 0, NULL),
  ('MIC',  0, 0, 0, NULL),
  ('MOR',  0, 0, 0, NULL),
  ('NAY',  0, 0, 0, NULL),
  ('NL',   50, 0, 1, datetime('now')),
  ('OAX',  0, 0, 0, NULL),
  ('PUE',  0, 0, 0, NULL),
  ('QUE',  0, 0, 0, NULL),
  ('QRO',  0, 0, 0, NULL),
  ('SIN',  0, 0, 0, NULL),
  ('SLP',  0, 0, 0, NULL),
  ('SON',  0, 0, 0, NULL),
  ('TAB',  0, 0, 0, NULL),
  ('TAM',  0, 0, 0, NULL),
  ('TLA',  0, 0, 0, NULL),
  ('VER',  0, 0, 0, NULL),
  ('YUC',  0, 0, 0, NULL),
  ('ZAC',  0, 0, 0, NULL)
ON CONFLICT(state) DO UPDATE SET
  totalSlots = excluded.totalSlots,
  usedSlots = excluded.usedSlots,
  isOpen = excluded.isOpen,
  openedAt = excluded.openedAt;
