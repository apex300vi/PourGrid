# PourGrid V1 RC1.6 — staging release notes

RC1.6 redesigns Bottle Intelligence around predictable, partial, fast results. It is a staging-only release and must not be deployed to production.

## Recognition pipeline

- Photos are compressed to metadata-free JPEGs at a maximum 1280-pixel edge before upload.
- Up to three photos are analyzed independently and concurrently.
- Each photo has a 25-second timeout and every batch has a 60-second ceiling.
- Recognition requests use a vendor/category-scoped candidate set and require compact JSON fields only.
- Completed photos remain reviewable when another photo fails or times out.
- Sealed packaging uses the product's editable units-per-case configuration; loose units remain separate.

## Merge and review

- Matching visible-packaging evidence codes identify suspected overlap.
- Suspected duplicate views retain the clearest/highest visible count instead of being summed.
- The review UI labels merged versus deduplicated totals and identifies source photos.
- Technical diagnostics are collapsed by default.

## Diagnostics

Scan history in local storage records compression dimensions/timing, per-photo AI timing and status, merge and total session timing, raw compact responses, unfinished photos, and deduplication decisions.
