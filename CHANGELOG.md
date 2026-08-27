# Change Log

This file records cross-agent changes that affect product behavior or shared implementation areas.

## 2026-08-27 — Home focus and Settings hub

- Kept Home focused on the primary operational action, Full Count.
- Moved Items & Vendors, Seasonal Profiles, team access, and sign out into a single Settings sheet without removing capability or changing permissions.
- Consolidated duplicate property presentation into one compact property row; multi-property switching remains available.
- Restored “Connected” as a network-status label. Shared-draft conflicts and save issues now appear as a separate actionable alert instead of replacing connectivity state.
- Removed the floating Manage team and Sign out controls above the bottom navigation; both remain available in Settings.
- No database migration or operational-data change.

Recent areas touched by other agents and intentionally preserved:

- Multi-property onboarding and Items & Vendors (`94842ef`, 2026-08-26).
- Seasonal Profiles and pinned draft behavior (`b05ae400`, 2026-08-24).
- Shared-draft conflict detection (`15457bec`, 2026-08-23).