# Order guide template

A new location builds its own order guide from a spreadsheet instead of typing SKUs in one
at a time. **Home → Items & vendors** (or the onboarding screen a brand-new property lands
on) has an **Order guide sheet** card: download the template, fill it in, upload it back.

Everything the sheet creates belongs to the property that uploaded it. The importer only
ever reads that property's vendors and writes through the scoped storage facade described
in [MULTI_PROPERTY_PILOT.md](MULTI_PROPERTY_PILOT.md), so a SeaSalt sheet cannot reach
Sapphire's catalog and Sapphire's v12 guide is never merged into SeaSalt's.

## The file

A UTF-8 CSV — Excel, Numbers, and Google Sheets all open and save it. The download is named
for the property (`PourGrid-Order-Guide-Template-SeaSalt.csv`) and ships with a byte order
mark so Excel does not mangle accented product names.

The first eight lines start with `#` and are instructions; the importer skips them. Then the
header row, then eight `EXAMPLE:` rows — two each for beer, liquor, wine, and N/A. The
importer skips those too, so an untouched template imports nothing rather than eight
made-up SKUs.

## Columns

| Column | Required | Notes |
| --- | --- | --- |
| `Section` | Yes | `BEER`, `LIQUOR`, `WINE`, or `N/A`. Sets the defaults for the row. Can be left blank if `Category` names a known one (`Vodka` implies `LIQUOR`). |
| `Category` | No | The shelf group PourGrid sorts counts by — `Vodka`, `Beer`, `Wine`, `BIB`, `Mixer`, and so on. Defaults to the section's own (`Beer`, `Liquor`, `Wine`, `Non-Alc`). |
| `Item Name` | Yes | Must be unique within the sheet and within the property. |
| `Vendor` | Yes | Who the item is ordered from. Repeat the same name on every one of its rows; spelling and case only have to match on the first row, and every later row is folded into it. |
| `Vendor Workspace` | No | `Bar` or `Food & produce`, which decides the workspace the vendor's items are counted in. The first row that names one wins; defaults to `Bar`. |
| `Vendor Email` | No | The order email for that vendor. |
| `Order Unit` | No | `Case`, `Bottle`, `BIB`, `Tank`, `Pack`, or `Carton`. Common spellings (`cases`, `btl`, `keg`, `bag in box`) are accepted. Defaults to `Case`. |
| `Units Per Case` | No | How many bottles or cans are in one case. Use `1` for anything ordered and counted whole. Defaults to 12 for liquor and wine, 1 for beer and N/A. |
| `Bottle Size (mL)` | No | Feeds Profit Lab pour costing. Ignored with a warning if it is not a number. |
| `Build-To (Par)` | No | What you want on hand after a delivery, in the same units you physically count. Blank means zero, which warns — PourGrid will not order the item until it has one. |
| `Notes` | No | Free text shown on the count and order screens. |

Headers can be reordered, and common alternatives are recognised — `SKU`, `Product`, and
`Description` for `Item Name`; `Par`, `Par Level`, and `Build To` for `Build-To (Par)`;
`Distributor` and `Supplier` for `Vendor`; `Case Size` and `Pack` for `Units Per Case`.
A location can upload its existing par sheet without retyping it into the template, as long
as it has an item column and a vendor column.

## What happens on upload

The sheet is parsed and previewed before anything is written. The preview shows the
filename, a per-section count, any warnings, and — if any row is wrong — the exact row
numbers and what to fix. **A sheet with any bad row imports nothing.** Order data is not
worth half-importing: the fix is to correct the sheet and upload it again.

Once the preview is clean, the buttons are:

- **Import N items** when the property has no items of its own yet.
- **Replace with sheet** / **Add to current list** when it already does. Replace swaps the
  property's catalog for the sheet; add keeps both and skips names that already exist.

Vendors named in the sheet are always merged in, never removed — removing one would orphan
any item still assigned to it.

Two things a sheet can never do:

- **Overwrite a published guide product.** Sapphire's v12 items are reserved names; a row
  that collides with one is skipped and reported, and the published build-to stands.
- **Touch another property.** The import reads and writes only the signed-in property's
  namespaced keys.

After a successful import the property has vendors and items, so **Finish setup** unlocks
and it can count and order like any other location.
