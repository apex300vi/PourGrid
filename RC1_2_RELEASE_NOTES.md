# PourGrid V1 RC1.2 — Product Save Patch

Fixes product editing persistence:
- Save and Reset no longer pass product names through inline HTML handlers.
- Products with apostrophes and special characters save correctly.
- Save verifies the localStorage write before closing.
- The edited in-memory product is updated before reload.
- A clear `Product changes saved` confirmation appears.
- Reset also handles products that were previously renamed.

No ordering, count, history, Smart Count, recipe, or Supabase changes.
