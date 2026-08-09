# Phase 3 deployed-state baseline

Authoritative checkpoint supplied on 2026-08-07:

- `public.orders(id bigint, created_at timestamptz, data jsonb)` contains 33 shared legacy records.
- There is no trustworthy repository migration history or ownership model.
- Existing RLS is permissive and grants are broad; there are no application functions/triggers, Realtime tables, or Storage buckets.
- No historical ownership, receiving facts, workflow identity, calculated/manual/final values, or other unknowns may be inferred.

Migration `202608070001_phase3_foundation.sql` only reads existing IDs and adds one `legacy_unassigned` reference per row. It does not update or delete `public.orders` or its JSON. The legacy table is revoked from clients and has no client RLS policy. Assignment is intentionally deferred to a separately approved administrative process.
