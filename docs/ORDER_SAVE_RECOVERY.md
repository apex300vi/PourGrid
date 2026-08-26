# Order save: why an order stopped reaching order history, and how to recover one

Order history is PourGrid's system of record. Build-to tracking reads it, and
`predictive-ordering.js` derives every suggestion from it. An order that only exists in
`localStorage` is not a saved order — it is lost work that the rest of the app cannot see.

## What went wrong

Two separate defects stacked, and together they made a failed save look like a successful one.

### 1. The order save had exactly one route to the server, and it was easy to block

`rOrderTab`'s save button called `PourGridSharedDraft.finalize(activeType, entry)` and nothing
else. There was no fallback to `save_location_order` — the authenticated, location-scoped,
transactional RPC that has existed since `202608180001_transactional_order_save.sql` and that
`finalize_shared_location_draft` itself calls internally.

`finalize` refuses to run unless the shared draft is perfectly in sync:

```js
await flush(type);
var s = states[type];
if (!s || s.queue.length || s.conflicts.length) throw new Error("Shared draft is not fully synced");
```

Every one of these leaves the order unsavable, indefinitely:

- `PourGridSharedDraft.init()` never completed, so `states[type]` has no draft id. `init()` runs
  from `loadRemoteCounts()` at boot and is not retried; a slow or failed `open_shared_location_draft`
  at launch disables order saving for the whole session.
- `window.POURGRID_SHARED_DRAFT_API` is missing — a stale cached `auth-gate.js`, or a session
  that restored from cache before `installOperationalApis` ran. `api()` throws
  "Shared draft service unavailable".
- One queued field update failed to flush. `flush()` swallows the error and leaves the message on
  `s.queue`, so a single dropped count sync blocks every subsequent order save even after the
  connection comes back.
- An unresolved field conflict sits on `s.conflicts`.

None of these mean the order is unsavable — they mean the *shared draft* is unhappy. The order
itself was always acceptable to `save_location_order`.

### 2. A failed save was reported in the success card

The catch branch called `s5ShowSuccess("Save failed", message)`. `s5ShowSuccess` renders the green
✓ card, whose fixed footer reads "Sapphire keeps the team state in sync automatically", and whose
only button is "Done". The message itself ended with "This draft is still saved on this device."

So a save that never reached the database was presented as a green checkmark saying the work was
saved on the device and kept in sync — with no retry. That is the "saved to my device" report.

## What changed

- **`order-save.js`** is the new save contract. `submit()` resolves only when the server returns a
  usable order id (`serverOrderId` validates the bigint across transports); a `null`, `0`, or absent
  id is a failure, not a save.
- **A fallback that cannot double-write.** `submit()` falls back from the shared-draft route to the
  direct `save_location_order` RPC *only* for failures that provably happened before anything was
  sent. `shared-drafts.js` now tags those with `error.pgNeverSent = true` — everything up to the
  `api().finalize` call, since nothing before it can insert an order row. A server-side rejection, a
  dropped connection mid-call, or an unconfirmed response is never re-routed, because its outcome is
  unknown and a second route means a second draft identity and a duplicate row in History.
- **Stage before send.** The payload is written to `pourgrid-unsaved-orders-v1` *before* the request,
  so a failed save — or a phone that dies mid-request — leaves a recoverable order.
- **A failure looks like a failure.** `s5ShowFailure` renders a red ✕ card titled "Order NOT saved",
  footed with "Saved on this device only · not in order history", and carrying a Retry button.
  History, the deadline stamp, and the count clear all stay behind a confirmed server id.
- **A recovery banner** follows every screen while an order is held on the device, with
  "Save to order history now". Reconnecting also sweeps it silently in the background.
- **Idempotent recovery.** Retries replay the staged payload byte for byte down the direct route
  only. `save_location_order` is unique on `(organization_id, location_id, draft_id)` and returns the
  original order id when the payload hash matches, so a retry after a lost response cannot create a
  second order — and a *changed* payload for the same draft is rejected with "already saved with
  different contents" rather than silently forking.

## Recovering an order that is stuck on a device

### If the order was composed after this fix shipped

It is staged. The red banner is on screen — tap **Save to order history now**. Reconnecting to the
network also retries it automatically.

### If the order predates this fix

The failed save never cleared the workspace, by design: the counts, manual adjustments, note, and
email-copy state are all still in the property-scoped `localStorage` for that workflow. So the order
is intact and re-submitting it rebuilds the identical order:

1. Open PourGrid on the device that has the order and confirm the property in the header is the one
   the order belongs to. Draft state is per property (`property-context.js`), so a switched property
   will not show it.
2. Go to **Bar** or **Merchants** → **Order & Send**. The counts and adjustments are as they were;
   the order lines will match what was sent to the vendors.
3. Tap **Finish & Save**. It now confirms a server-side write, and falls back to the direct save if
   the shared draft is still wedged.
4. Expect the green card with an order number. Anything else is a red card that says exactly what
   failed and offers Retry.
5. Confirm it in **History → Orders**, then verify server-side with the query below.

If the workspace was cleared before the fix shipped, the order is not on the device at all. In that
case the vendor emails that were copied or texted at the time are the surviving record, and the order
has to be re-entered by hand from them.

## Verifying server-side

`scripts/verify-order-recovery.sql` checks that a recovered order is really in the table, attributed
to the right location, and visible to the History reader. Run it as the authorized user against the
project, substituting the organization and location ids.

## Guardrails in the test suite

- `test/order-save-submit.test.js` — the save contract and the shipped orchestration out of
  `index.html`: a reachable backend must confirm a server-side write before "saved" is shown; a
  local-only outcome must raise a failure with a retry and must never render the success card; an
  unconfirmed or already-sent failure must never be re-routed into a second write; a recovery that
  lands after the next count started must not wipe it.
- `test/order-save-recovery.test.js` — the RPC contract, the failure/success card split, and the
  never-sent tagging in `shared-drafts.js`.
