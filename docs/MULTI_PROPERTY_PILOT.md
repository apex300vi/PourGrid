# Multi-property pilot

PourGrid runs one property per signed-in session, selected from the locations the user is
authorized for. This document covers how the two-property pilot (Sapphire Beach Bar plus one
St. Thomas Restaurant Group property) is set up and what is guaranteed to stay separate.

This is deliberately a two-property pilot, not a SaaS tenancy rebuild. It reuses the
organization/location model that Phase 3 already put in place.

## What is separated per property

| Data | Where it lives | How it is separated |
| --- | --- | --- |
| Order history | Supabase | `get_location_order_history_v2(p_organization, p_location, …)` |
| Shared count drafts | Supabase | `open/read/update/finalize_shared_location_draft(p_organization, p_location, …)` |
| Seasonal profiles | Supabase | `list/save/activate_seasonal_profile(p_organization, p_location, …)` |
| Profit Lab recipes | Supabase | `list/save/delete_profit_lab_recipe(p_organization, p_location, …)` |
| On-device counts, drafts, notes, adjustments | `localStorage` | key namespacing, below |
| Vendor list | `localStorage` (`pourgrid-property-vendors-v1`) | key namespacing |
| Property-added SKUs, including anything imported from an order guide sheet | `localStorage` (`pourgrid-property-catalog-v1`) | key namespacing |
| Product/packaging edits | `localStorage` (`pourgrid-product-edits`) | key namespacing |

Server-side separation was already enforced by row-level security and the location-scoped
RPCs. The client half is enforced by `property-context.js`.

### Key namespacing

`property-context.js` keeps a small registry in `pourgrid-property-registry-v1` and hands the
app a scoped storage facade:

- The **home property** — the one this device has always run, matched by the Sapphire name or
  by pre-existing local data — keeps its original unprefixed keys. There is no migration and
  no risk to Sapphire's live data.
- **Every other property** reads and writes `pg:<locationId>:<key>`.
- Account-level keys (`pourgrid-auth-context-v1`, `pourgrid-selected-location`,
  `pourgrid-authorized-contexts-v1`, the registry itself) are never namespaced.

`test/multi-property.test.js` asserts both directions, including that a write under the pilot
property is invisible to Sapphire and vice versa.

## Switching properties

`auth-gate.js` publishes every authorized location to `window.POURGRID_AUTH_CONTEXTS` and
exposes `window.POURGRID_SWITCH_PROPERTY(locationId)`. The header wordmark and a card on Home
open the property sheet; choosing another property records it in `pourgrid-selected-location`
and reloads, so nothing from the previous property survives in memory. The switcher refuses
any location the signed-in user is not authorized for.

Users with access to only one property see the property name, and no switch control.

## Standing up the pilot property

1. **Invite the property's lead** in Supabase Auth so an `auth.users` row exists for them.
2. **Provision tenancy.** Edit the settings block at the top of
   `scripts/provision-pilot-property.sql` (organization name, location name, lead email,
   role) and run it as the service role. It creates the organization, the location, the
   membership, and the location membership, and is safe to re-run.
   To add more staff later, an administrator can use `admin_upsert_membership(p_org, p_user,
   p_role, p_location)` or the in-app **Manage team** invitations for that location.
3. **Sign in as the lead.** PourGrid opens the onboarding screen because the property has no
   catalog yet.
4. **Onboard.** Name the property, then build its guide either way:
   - **From a spreadsheet (the fast path).** Download the order guide template, fill in the
     property's own beer, liquor, wine, and N/A SKUs with their build-to levels, and upload
     it back. Vendors and items are created together from the sheet. See
     [ORDER_GUIDE_TEMPLATE.md](ORDER_GUIDE_TEMPLATE.md).
   - **By hand.** Add its vendors (each routed to the Bar or the food and produce
     workspace), then add its SKUs one at a time.

   Finish setup is enabled once the property has at least one vendor and one item.
5. **Count and order as normal.** The pilot property never sees Sapphire's Bellows SKU list,
   Sapphire's order guide, or Sapphire's history.

Nothing needs to change for Sapphire. Its vendors, catalog, branding, email signature, and
local data are exactly what they were.

## Trial window

A property created outside the home property records a 60-day trial start on the device that
onboards it. Home shows a `Pilot · N days left` banner counting down; it is informational and
never blocks any feature.

## Adding items and vendors later

**Home → Items & vendors** reopens the same screen after onboarding, including the order
guide sheet card — a property can re-upload a corrected sheet at any time, replacing its
catalog or adding to it. Sapphire can use the screen to add SKUs that are not in the
published v12 guide; existing guide items are reserved names that no sheet can overwrite,
and are still edited from the count screens (Bottle Intelligence → Edit product &
packaging). A vendor cannot be removed while any item is still assigned to it.
