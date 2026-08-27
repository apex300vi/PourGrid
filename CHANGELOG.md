# Changelog — non-human changes

Real changes made to this repo by something other than a human sitting in
this project's own chat — specifically, the JARVIS autotask dispatcher
(Josh's personal AI assistant), which can work on this repo unattended
from a request queued through Jarvis rather than a session opened
directly on PourGrid. Newest first. Not a full commit log — see `git log`
for that; this is specifically the "you weren't here for this" entries,
so a session opened directly on this repo isn't confused by a change it
didn't make.

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
