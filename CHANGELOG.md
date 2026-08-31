# Changelog — non-human changes

Real changes made to this repo by something other than a human sitting in
this project's own chat — specifically, the JARVIS autotask dispatcher
(Josh's personal AI assistant), which can work on this repo unattended
from a request queued through Jarvis rather than a session opened
directly on PourGrid. Newest first. Not a full commit log — see `git log`
for that; this is specifically the "you weren't here for this" entries,
so a session opened directly on this repo isn't confused by a change it
didn't make.

## 2026-08-31
**What:** Kept previously verified, same-user access available during temporary Supabase database outages and authorization-check timeouts.
**By:** Codex, task production access outage recovery.
**Why:** Supabase returned 503/PGRST002 schema-cache failures for every membership query. PourGrid recognized only generic network wording, so it ignored its verified authorization cache and locked Josh and Nikki out even though their secure sessions remained valid.
**Note:** Invalid, expired, revoked, malformed, different-user, and never-verified access still fail closed. No credentials, memberships, roles, operational records, or tenant policies are changed.

## 2026-08-31
**What:** Made count edits immediately authoritative, automatically reconciled rapid order-adjustment metadata, and made Clear or direct-save recovery retire the old shared draft before opening a blank one.
**By:** Codex, task shared-draft reassertion recovery.
**Why:** Clear only removed local values while the active server draft retained them, the delayed count mutation left a window where shared refresh could restore the previous number after the keyboard checkmark was tapped, and rapid quantity taps could expose raw adjustment JSON as a manual conflict.
**Note:** This directly extends PRs #75–#82 in shared-draft synchronization and finalization. It also prevents stale manual adjustments from canceling a correct new order. It does not change count math, build-tos, order quantities, History, vendor routing, authentication, or tenant protections.

## 2026-08-30
**What:** Completed the post-save draft lifecycle and anchored order-review quantity adjustments to their product card.
**By:** Codex, task finalized-order clear and stable adjustment position.
**Why:** A confirmed History save cleared local fields without attaching the client to a new empty shared draft, while every quick `+` or `−` adjustment rebuilt the screen and let mobile Safari move the user away from the product being edited.
**Note:** This directly extends the recent shared-draft finalization and order-adjustment work. Only the finalized Bar or Merchants workflow is cleared after a confirmed server order ID; failed saves and newer replacement drafts remain untouched. History, counts captured in the saved order, build-tos, calculation rules, and vendor routing are unchanged.

## 2026-08-30
**What:** Changed order-review explanations for case-counted products to show cases plus loose cans or bottles instead of leading with internal canonical-unit totals.
**By:** Codex, task package-native order explanations.
**Why:** Canonical units are required for exact arithmetic, but asking a case counter to interpret totals such as 240 cans made a correct calculation feel unrelated to the count they entered.
**Note:** This touches the order disclosure introduced in the recent predictive-ordering work. Calculation inputs, rounding, suggestions, final quantities, build-tos, counts, and vendor output are unchanged; only the explanation layer is reformatted.

## 2026-08-29
**What:** Replaced manual per-field count conflict review with automatic intent-aware merging and corrected derived unit labels.
**By:** Codex, task automatic count merge recovery.
**Why:** One physical count could appear twice as cases and a derived unit total (for example, White Claw as 7 cases and 168 cans), forcing users to arbitrate internal synchronization fields and sometimes displaying cans as cases.
**Note:** This directly supersedes the manual count-conflict UI behavior from PR #72 and extends PR #78. Untouched stale device data keeps the shared team value; a product explicitly edited in the active session keeps that latest entry. Non-count workflow conflicts retain the existing protected review path. Orders, build-tos, inventory history, and vendor routing are unchanged.

## 2026-08-29
**What:** Kept explicit order quantity adjustments overlaid until server confirmation and automatically rebased them when their shared field revision changed.
**By:** Codex, task order adjustment refresh recovery.
**Why:** A stale shared revision removed the pending `+` or `−` adjustment before resolution, so a later refresh restored the old quantity even though the user had just changed it.
**Note:** This directly touches PR #77's shared adjustment persistence. The latest deliberate order-review edit wins; count conflicts, build-tos, inventory, vendor routing, submitted orders, and PR #78's passive count cleanup remain unchanged.

## 2026-08-29
**What:** Limited shared count sync to products explicitly edited in the active browser session, automatically kept the shared team value for untouched stale-device conflicts, and formatted genuine package conflicts as cases plus loose units.
**By:** Codex, task passive shared-draft conflict recovery.
**Why:** A whole-device cache push promoted old converted counts such as `3.6666666666666665` into hundreds of apparent device changes even when the user had not touched those products.
**Note:** This directly touches the PR #75 and PR #77 shared-draft work. It preserves deliberate same-session conflicts and pending offline mutations, keeps server/shared counts authoritative for untouched cache residue, and does not change Home, Settings, navigation, orders, or submitted inventory history.

## 2026-08-29
**What:** Collapsed false numeric shared-draft conflicts, scoped count sync to its actual workspace, and made removed order adjustments persist as explicit zero-state mutations.
**By:** Codex, task shared draft and order adjustment recovery.
**Why:** Numeric strings and numbers displayed identically but produced hundreds of review cards, while deleting a local adjustment sent no shared mutation and allowed the old server value to return.
**Note:** This directly follows the PR #75 shared-draft repair and PR #76 quantity editor. It preserves counts and genuine differing-device conflicts; it does not touch the newer Home, Settings, or bottom-navigation layout work.

## 2026-08-29
**What:** Made bottle-unit build-tos a runtime invariant, upgraded stale device packaging edits, and replaced repetitive quantity stepping with a direct final-quantity editor.
**By:** Codex, task bottle order recovery.
**Why:** The earlier default-only repair did not override an already-saved device setting of `buildToBasis: cases`, so bottle targets were still multiplied by pack size on affected phones.
**Note:** This touches the 2026-08-29 bottle build-to and predictive-ordering work. It does not alter counts, numeric build-tos, drafts, vendors, or submitted orders; the existing count is recalculated in place after the updated app loads.

## 2026-08-29
**What:** Made identical shared-draft retries self-resolving, made real conflict creation idempotent, kept a conflicted item from blocking the rest of a count, and clarified the rare genuine-conflict language.
**By:** Codex, task false shared-draft conflict repair.
**Why:** Revision drift created hundreds of duplicate choices even when “Saved for everyone” and “On this device” contained the same count.
**Note:** The forward-only cleanup closes only conflicts whose JSON values are exactly equal. It does not change draft fields, counts, revisions, orders, or genuine differing conflicts. Queued counts remain on the originating device and resume after the blocker clears.

## 2026-08-29
**What:** Corrected the default build-to basis for all bottle-purchased products and aligned predictive ordering with the order calculation.
**By:** Codex, task bottle build-to multiplier repair.
**Why:** Bottle targets were incorrectly treated as case targets, so pack size multiplied the shortage (for example, Black Seal requested 47 bottles instead of 3, and Hurricane Proof requested 24 instead of 2).
**Note:** Audited all 15 bottle-purchased catalog items. Case-based products, saved packaging choices, counts, and drafts remain unchanged.

## 2026-08-27
**What:** Made the Home shared-draft warning open a real conflict review sheet with explicit “Keep shared” and “Use this device” choices.
**By:** Codex, task actionable shared-draft conflict review.
**Why:** The warning previously opened Bar Count without showing the conflicting field or providing a resolution action.
**Note:** This extends the shared-draft system from `15457bec` and the Home alert from PR #71. It preserves both values until an authorized user chooses; no count is resolved automatically.
**Honest backfill note (2026-08-27):** commits made by the JARVIS
dispatcher use the same git identity as Josh's own interactive sessions
on this repo (both commit as `apex300vi`, from the same machine) — there
is no reliable marker in `git log` alone that distinguishes one from the
other for anything already merged, and this repo's history also includes
work from other agent tooling (see the `agent/*` and `codex/*` branches)
that isn't JARVIS either. Rather than guess at history, this file starts
here, going forward: every dispatcher-made change from this point on gets
a real entry, appended as part of the same task that makes it.

**Also see `docs/DECISIONS.md` in the JARVIS repo:** PourGrid's own real
data (pour cost, order predictions) only exists after Josh has physically
counted inventory through the app's own Full Count flow — there's nothing
for an automated agent to read here that isn't already something Josh
entered himself, which is why JARVIS's own PourGrid integration stays
deferred rather than attempting a browser-based read.

<!-- New entries go at the top, newest first. Format:
## YYYY-MM-DD
**What:** one line.
**By:** JARVIS dispatcher, task <short description>.
**Why:** one line - what prompted it.
**Note:** anything that would confuse someone who last saw the code
before this, or anything deliberate that looks wrong without context.
Omit this line entirely if there's nothing to flag.
-->
