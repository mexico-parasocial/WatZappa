# Migration ordering

- Kysely orders the exported migration names lexicographically. New migrations (including imported upstream migrations) must sort after every migration already registered here. Re-date pending migrations before they are applied; never rename deployed migration history.
