# SCHOOLNET V2 — S4-C.3-C.3.5.3.2
## Source reconciliation and live-schema compatibility (isolated GitHub branch, 26 November 2026)

**No production SQL change, no hosted sandbox, no real users, no student data, no Vercel deployment.**

### Audited baseline
The previous read-only inspection of hosted `schoolnet_2.0` reported PostgreSQL 17.6, 80 tables in `public` and `schoolnet_private`, 62 registered migrations, and the absence of the proposed C3C3 curricula/general-average objects. The Git tree at commit `ffbfc8a` contains 54 migration files. This is **an immutable observation**, not a live backup or a full schema dump.

### Historical source reconciliation
- `migration-reconciliation.manifest.json` lists **10** remote-history-only versions and **2** Git-only versions with immutable Git blob SHA-1 fingerprints.
- **9 historical groups** have a total of **10 candidate SQL proposal files**. These are **NOT proven to be the exact statements applied remotely**; no SQL proposals are copied to `supabase/migrations`.
- The exact source for **20261113124329_student_no_email_security_release** remains unverified. Related proposals from 16 November are not accepted as a replacement for the 13 November version.
- Do not run `migration repair`, `db push`, `db reset`, or rename proposals to executable migration filenames. The two Git-only migrations may have been manually applied in other forms; confirm exact existing objects before deciding their disposition.
- Before any later SQL GO, obtain verified originals/approved DDL snapshots, compare them with live function definitions, audit constraints/policies and keep a checksum record. The current manifest is a discovery inventory, **not** permission to reconcile history by force.

### Realistic (but limited) ephemeral tests
`live-schema-contract.json` records selected factual column types, role/assessment/submission/course enums, existing table SELECT grants, and `get_my_role()` return type from the preceding audit. **It does not contain production rows, credentials, or full RLS definitions**.

`fixtures/real-schema-compatibility.sql` is an optional overlay applied to the existing disposable Supabase/GoTrue/PostgREST fixture, before loading the **unchanged** C3C3 proposals. It changes test-only roles/statuses to real PostgreSQL ENUMs and mirrors the SELECT permissions confirmed on `profiles`, `assessment_submissions`, and `schoolnet_school_memberships`. Its synthetic RLS allows a student to read only their own fictional submissions; the school-admin general average must still use the privileged, scoped RPC.

**Important limitation:** the hosted service has additional RLS policies and historical triggers, not copied into this synthetic fixture. Passing tests means regression protection and preliminary compatibility, **not production-equivalent RLS certification**. The historical `get_my_role()` return type and EXECUTE grants are emulated, while its old mutable search path is intentionally *not* reproduced.

### Run the checks
```powershell
npm run qa:s4c3c353
npm run qa:s4c3c352
npm run lint
npm run build
```
GitHub Actions `.github/workflows/schoolnet-s4c3c353-compatibility-ci.yml` additionally launches an **ephemeral local Supabase stack** (GoTrue, PostgREST, PostgreSQL), creates only invented user identities and grades, tests HTTP access control and destroys containers/volumes even after failure.

### Remaining gates (not authorized here)
1. Recover and verify the complete SQL definitions for the 10 history-only versions; resolve the 2 Git-only versions **without touching the remote migration ledger**.
2. Produce an approved backup and restore it in disposable PostgreSQL 17; separately account for Storage contents, Auth configuration/hooks, and external settings.
3. Design a *distinct* test (with explicit GO) against an isolated production-like **schema** including the actual RLS policy definitions, without copying students or grades.
4. Only after tests and backup recovery: request separate authorization for any hosted SQL, hosted sandbox wake-up, GitHub main merge, and Vercel deployment.

Export of quarterly/semester/annual per-class averages (one subject / all subjects) remains a separate backlog item.
