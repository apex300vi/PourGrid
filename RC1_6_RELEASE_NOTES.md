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

- Stable catalog IDs are sent and returned when available, while legacy name-only catalog entries remain supported.
- Results are grouped by stable product identity and packaging variant, so cases, loose bottles, cartons, cans, and alternate sizes remain distinct.
- All reliable visible-packaging evidence codes are retained per group; weak values such as `UNKNOWN`, `UNSPECIFIED`, blank, or unreadable never prove overlap.
- Matching reliable evidence codes deduplicate only within overlapping photo groups. Explicitly different shelf/location IDs remain additive.
- Suspected duplicate views retain the clearest/highest visible count instead of being summed.
- Every deduplication decision preserves its evidence signature, packaging type, and source-photo references.
- The review UI labels merged versus deduplicated totals and identifies source photos.
- Technical diagnostics are collapsed by default.

## Timing correctness hardening

- The 60-second batch ceiling finalizes the run atomically and marks every pending or active photo as timed out exactly once.
- Late AI responses cannot mutate results, diagnostics, or progress after finalization.
- Progress callbacks are fenced after finalization, including when all photos were active and none completed before the ceiling.
- Completed partial results remain stable and reviewable while unfinished-photo status is derived from one terminal record per photo.

## Diagnostics

Scan history in local storage records compression dimensions/timing, per-photo AI timing and status, merge and total session timing, raw compact responses, unfinished photos, and deduplication decisions.

## Smart Count staging hotfix

- Fixed the primary Smart Count button failing before modal creation because RC1.6 referenced the removed `pgPackaging(name)` helper instead of `pgPack(product)`.
- Added a guarded, singleton Smart Count launcher that survives navigation re-renders and prevents repeated click/touch activation from creating duplicate modals.
- Added explicit mobile touch activation and retained the existing click path and `touch-action: manipulation` behavior.
- Missing recognition-module or modal-initialization failures now show a visible, safe message and leave manual counting available.
