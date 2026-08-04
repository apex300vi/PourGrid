# PourGrid V1 RC1.7.1 — PourGrid Vision UX Hotfix

RC1.7.1 streamlines the staging photo-count workflow into one category-level session. This release is staging-only and must not be merged or deployed until real-photo validation is complete.

## Workflow

- Presents one prominent PourGrid Vision action on every Bar and Merchants category, with Manual Count directly below it.
- Keeps product cards focused on Manual Count and Bottle Intelligence; the single-product recount remains inside Bottle Intelligence as a troubleshooting action.
- Adds a continuous multi-photo session with separate camera and library controls, thumbnails, removal, photo count, explicit processing, and cancel.
- Processes only after the user selects **Process Photos** and returns all recognized category products in one review.

## Processing and review

- Shows preparing, per-photo analysis, combining, and review-preparation stages with elapsed time.
- Shows the slower-than-usual partial-results message after 30 seconds.
- Adds a completion summary for detected, high-confidence, review-needed, unknown, processed-photo, and unfinished-photo counts.
- Uses clear Counted, Needs Review, and Unknown states with plain-language case, loose-unit, total-unit, confidence, and source-photo details.
- Uses each product’s editable packaging labels and units per case.

## Safety

- Cancel leaves inventory unchanged.
- Confirmation updates only reviewed, known, non-removed products.
- Unknown, undetected, and removed results never alter inventory.
- Duplicate sessions, mobile touch activation, and visible initialization fallbacks remain protected.
- RC1.7 build-to math remains the source of truth for both the displayed explanation and actual order quantity, with simpler wording and explicit full-case rounding.

## Validation scope

Automated coverage includes category action placement, legacy-name removal, continuous photo-session behavior, explicit processing, multi-product review, review summaries, configured unit labels, confirmation safety, duplicate/touch launch behavior, Bottle Intelligence access, secondary recount placement, and order-explanation parity.
