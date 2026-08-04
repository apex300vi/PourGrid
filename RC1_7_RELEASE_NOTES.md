# PourGrid V1 RC1.7 — PourGrid Vision

RC1.7 introduces PourGrid Vision as the staging photo-counting workflow. Bottle Intelligence remains the editable product profile. This release is staging-only and must not be deployed to production.

## Category counting

- Replaces the user-facing Smart Count name with PourGrid Vision.
- Opens one multi-photo capture session from the selected Bar or Merchants category.
- Sends only that category and vendor's catalog products as recognition candidates.
- Supports multiple recognized products per photo, Unknown results, partial photo failures, existing timeout hardening, and overlap-aware merging.
- Presents all recognized products together for case/loose-unit review, editing, removal, cancellation, or confirmation.
- Applies inventory only after confirmation and updates only reviewed known products; undetected and Unknown products remain unchanged.
- Keeps the normal category product list and all existing manual count controls available under Manual Count.

## Bottle Intelligence

- Bar and Merchants product cards continue to open Bottle Intelligence.
- Adds a single-product PourGrid Vision recount action inside Bottle Intelligence for troubleshooting.
- Preserves editable packaging, vendor, build-to, notes, recipes, recognition details, history, and safe missing-price display.

## Order explanations

- Order recommendations now explain the build-to target, counted quantity, shortage, configured units per case, rounding behavior, and suggested order.
- Wording follows the configured physical units and the same math used by the order calculation.

## Reliability

- Preserves the RC1.6 concurrency, timeout, partial-result, stable-ID, packaging-variant, and deduplication hardening.
- Preserves guarded mobile click/touch launch, duplicate-modal prevention, and visible recognition initialization fallback.
- The app remains a static Netlify-compatible site. No production deployment is included.
