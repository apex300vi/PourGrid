# Authorization matrix

| Capability | Administrator | Manager | Inventory staff | Read-only viewer |
|---|---:|---:|---:|---:|
| View authorized organization/location data | Yes | Yes | Yes | Yes |
| Create/work orders and ordinary receipts | Yes | Yes | Yes | No |
| Approve substitutions and over-receipts | Yes | Yes | No | No |
| Finalize/replace baseline | Yes | Yes | No | No |
| Approve reconciliation | Yes | Yes | No | No |
| Organization administration | Yes | No | No | No |

Anonymous access is revoked. Reads require organization membership plus location access. Business mutations are intended only through narrow `SECURITY DEFINER` functions with an explicit `public, pg_temp` search path. Tables are not directly writable by clients. Audit events and movements reject update/delete with immutable triggers. Bar/Merchants workflow is an explicit enum on orders, sessions, items, reconciliations, and movements.
