# PR-06A — KDV1 reconciliation and refund request approval

Completed and locally verified 28 October 2026. [Contract](../architecture/vat-refund-reconciliation.md)
and [roadmap](../project-root/EXPORT_IMPLEMENTATION_ROADMAP.md).

## Delivered

- Original goods/non-stock deduction recognition with the posted book month,
  evidenced tax-event/eligibility checks and prior external refund capacity.
- Closed-calendar KDV1 reconciliation, complete monthly registered deductions,
  exact reported totals, separate 301/other refunds and a reviewed carry chain.
- Partial refund requests against original goods/cost candidate lines, bounded
  by original recognized deductions, prior claims and the declared period budget.
- Independent approval and evidenced void; immutable inputs, calculations and
  original approvals; sequenced decisions and atomic audit/idempotency.
- Dated standard-export policy checks for deadline, ordinary ceiling, cash procedure
  and processing threshold. Smaller requests retain their full amount for later aggregation.
- Dependency guards for cost sources, deductions, monthly bases/candidates, source
  and export reconciliations, later carry periods and accounting reopening.
- Sidebar-only VAT deduction, KDV1 and refund screens with required previews,
  paged source selection, read-only access, responsive details and retained evidence.
- m019, six additive tables (106 total), six ADMIN permissions, OpenAPI 0.20.0
  with 314 paths and matching design/SQL baseline v17. Applied m001–m018 are frozen.

The supplied July 2026 three-page KDV1 PDF was inspected read-only. Its separate
301, other exemption and withholding categories informed the form mapping. No
taxpayer identity, document content or actual figures enter tracked fixtures or
the local business tables. Tests use synthetic data.

## Validation

- `npm --prefix backend run test:vat-refund`: **15 tests passed**, including a
  301-line request, original cost deductions, prior external claims, races, rollback,
  independence/void, source/period boundaries, CSRF/Origin/idempotency, schema drift
  and explicit interrupted-migration recovery.
- Full release: `npm --prefix backend run test:pr06a` — **passed**, one uninterrupted
  run from 07:15:28 to 07:29:09 UTC. OpenAPI, frontend lint/build, journal editor,
  every earlier domain, new VAT integration and the full browser suite passed.
  Evidence: `.local/pr06a-release.log` and `.local/pr06a-release.json`.
- A separate isolated browser run passed all prior workflows plus deduction,
  KDV1 and refund forms, independent approval/void, history, mobile and reader controls.
- `git diff --check`: passed.

Final visual inspection found a misleading reserved-amount sentence on voided
refund details. The summary now describes the retained threshold calculation and
uses readable procedure labels. Frontend lint/build was rerun after this wording
change (`.local/pr06a-final-ui.json`, passed); the full gate's subsequent browser
run exercised the final screen. Build: 2,198 modules, deferred VAT chunk 54.45 kB;
the existing 500.80 kB main chunk warning remains a PR-07 performance item.

The focused HTTP test initially attempted to parse the empty successful logout
response as JSON; the test helper now accepts empty response bodies. The final
focused run passed. No application logout behavior changed.

## Local upgrade and preservation

Pre-upgrade snapshot: 100 tables / 18 migration records. Verified local backup:
`.local/backups/pr06a-before.sql` (1,275,082 bytes); completion marker and SHA-256
recorded in `.local/pr06a-backup.json`. The temporary credential file was removed.
`node backend/scripts/migrate-local.js` applied m019 once; a second run verified
all 19 migrations without another application. The database now has 106 tables.
`.local/pr06a-state-before.json`, `pr06a-state-after.json` and
`pr06a-verification.json` confirm all original business rows and 18 applied migration
sources are unchanged, existing metadata is preserved, and six new tables are empty.
The two original supplier invoices and their six lines remain staged; no real VAT
deductions, reconciliations or requests were created.

Only the saved, port-verified local Node API/UI processes were restarted; ownership
is recorded in `.local/runtime-pr06a.json`. The app is available at
`http://localhost:5173/vat`. The existing account and password remain unchanged.
The local smoke passed readiness, all three empty new workflows, desktop/mobile
layout, absent global header, runtime-error checks and logout; evidence is in
`.local/pr06a-local-smoke.json` and `.local/screenshots/pr06a-local-*.png`.
That smoke made no business writes. Account/session activity occurred after the
before/after business preservation comparison, and its session was logged out.

The final audit checks matching baseline copies, exact m019 SQL references, local
Markdown links, frozen migrations, API version/path count, backup hash and release/
local results. Logs, backup and verification records remain ignored local artifacts;
temporary implementation and PDF extraction helpers are removed after verification.

## Limits and next step

This is internal preparation, not GİB filing or a refund entitlement decision.
It supports TRY, full calendar months, original posted book dates and standard
goods exports (301) under policy TR-301-2026-10-28. Other refund categories are
reconciled totals; their claim engines are not implemented. The opening carry,
outside deductions/output, category split and external claims need accountant
evidence. No automatic historical import, PDF importer, return submission, cash
receipt, offset posting or additional local account is created.

**Next: PR-06B.** Build Yüklenilen/İndirilecek/export/GÇB lists, immutable packages,
actual filing and refund/offset tracking. Verify current GİB formats and legal policy,
handle threshold aggregation, and protect submitted/settled amounts from analytical
void/release until an evidenced external amendment/withdrawal is recorded. Preserve
applied m001–m019 and all original source/return/correction snapshots.
