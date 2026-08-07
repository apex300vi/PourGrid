# Phase 3 migration verification and recovery

## Preflight

Run `scripts/phase3-preflight.sql` against a disposable clone of the confirmed deployed schema. Export and checksum all 33 `public.orders` rows before testing. Never run these migrations against deployed Supabase during this checkpoint.

## Post-migration

Run `scripts/phase3-verify.sql` and the SQL authorization suite. Verify the legacy count and aggregate JSON checksum match the export; anonymous reads fail; cross-tenant reads fail; movement totals reconstruct every balance; duplicate receipt finalization creates no second movement; update/delete on movements and audit events fail.

## Recovery

Default recovery is forward repair: stop application traffic to the new Phase 3 tables, retain immutable movements/audit, diagnose in a disposable clone, and ship a new forward-only migration. If migration execution fails inside its transaction, PostgreSQL rolls it back atomically. Destructive object removal is an exceptional last resort after restoring a verified backup into a separate project; it is not the default rollback.
