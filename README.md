# PourGrid

PourGrid is an ordering and photo-counting application for bar and restaurant properties. It
runs at Sapphire Beach Bar and supports a second pilot property alongside it — see
[docs/MULTI_PROPERTY_PILOT.md](docs/MULTI_PROPERTY_PILOT.md). A new location builds its own
order guide from a downloadable spreadsheet rather than by hand — see
[docs/ORDER_GUIDE_TEMPLATE.md](docs/ORDER_GUIDE_TEMPLATE.md).

## Current baseline

This repository begins with PourGrid V1 RC1.4 staging, synchronized to the Sapphire Beach Bar Order Guide v12 catalog.

## Immediate product goal

Build Bottle Intelligence V1: a multi-photo inventory workflow that identifies products, estimates quantities, groups duplicates, supports quick corrections, and writes accepted counts into the existing ordering workflow without breaking manual counting, order history, or vendor exports.

## Deployment

The current app is a static Netlify deployment with `index.html` as the entry point.
