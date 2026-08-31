# Security and stock reliability update

## CNC completion actions and panel preview — 31 August 2026

- Stacked Complete sheet above Complete panel in both apps; renamed Mark complete to Complete panel.
- Sheet confirmation now lists all affected pending panel IDs, including search-hidden panels, with a scrollable keyboard-accessible list. Its count and IDs come from the same live set. Already completed panels remain unchanged.
- Verified the dialog and button arrangement in the browser and all 40 automated checks. No backend or inventory changes required.


## CNC panel capitalization and order sorting — 31 August 2026

- Panel IDs capitalize a leading letter on new entry/CSV upload. Existing IDs display the same way in both apps, the shared tracker and Excel without rewriting historical records; numeric IDs and leading zeros remain unchanged.
- Orders sort highest number first within each job, including prefixed IDs such as WO-1042. Orders without a number appear after numeric orders. All 40 checks pass.


## Compact CNC panel views — 31 August 2026

- Removed repeated job-reference and uploaded details from panel cards/rows in both apps and the shared tracker. Job headings, completion details and actions remain visible.
- Stored data, search, and the connected Excel export remain unchanged. All 38 checks pass.


## CNC job groups and upload cleanup — 31 August 2026

- Added collapsible job-reference groups above collapsible orders in both apps and the read-only shared tracker, with separate counts and a No job reference group.
- New single-panel entries and CSV uploads normalize job references to title case and remove the word Order and other non-digits from labelled order numbers, preserving leading zeros. IDs without the Order label remain unchanged.
- The server applies the same cleanup to new panels and rejects labelled orders containing no digits. Existing records are not rewritten when completed; display grouping consolidates job-reference casing without a data migration.
- Verified 38 automated checks plus browser entry, cleanup and nested expansion using isolated test data.


## Collapsible CNC orders and mobile sharing — 31 August 2026

- Both apps group CNC panels into collapsible orders with pending and completed counts. Search reveals matching panels; expansion choices survive normal refreshes.
- The existing read-only share link now uses responsive panel cards, collapsible orders, search, status filters, Expand all/Collapse all and clearer connection warnings. Excel download and automatic updates remain available.
- No stock, CNC records or sharing permissions are changed. Verified 32 automated checks and a phone-width browser preview.


## CNC whole-sheet completion — 31 August 2026

- Sheet completion now uses a styled in-app confirmation dialog instead of the browser popup, with a live panel count, Cancel/Complete sheet buttons, Escape support and keyboard focus handling.

- Workers can select Complete sheet from a pending CNC panel in either app. Confirmation shows the order, sheet and number of pending panels affected, including panels hidden by search.
- Only pending panels with the exact same order and sheet numbers are completed. Earlier completion details and other sheets/orders are preserved. Individual panel completion remains available.
- Saves through the existing atomic, retry-safe sync process with a sheet activity entry. No stock is deducted. No backend permission changes are required.


Release: v2026.08.31. Both frontends and the shared backend are deployed. Stock editing is enabled after successful production administrator sign-in and inventory verification in both apps.

This update must be released together with PanelStock mobile and the shared Cloudflare backend. The desktop layout is largely unchanged.

## Changes

- Individual, server-verified login sessions replace the shared app credential. Administrator permissions are enforced by the backend.
- Stock movements and activity are queued together and saved locally before sending. Retrying a request does not apply it twice.
- Conflicting edits are flagged instead of silently overwriting another person's changes. Pending work remains available for export and reconciliation.
- Invalid stock records are rejected by the backend, and restricted corrections require administrator access.
- Voided dispatches no longer contribute to job totals.
- Activity history is no longer capped at 800 entries. Full stock resets preserve history and damage evidence.
- Both apps use the same updated backend, including recovery backups, restore protection and scheduled-report safeguards.

## What users need to know

- Before the live switch, finish syncing on every device, export unsent work and close both apps.
- After deployment, refresh and sign in again. Existing personal PINs remain valid; new and reset PINs require 6–12 digits.
- Use one editing tab per app. Pending work stays tied to the account that created it.
- Conflicts require review; export pending work before discarding it.
- Login after a reload requires a connection. An already verified open app can queue changes offline.

## Validation and deployment status

The coordinated code passed 19 local automated checks and both GitHub verification workflows before this documentation update. Synthetic-data browser checks covered both logins, cross-app receiving, dispatch, administrator voiding, stock reversal and corrected job totals.

Cloudflare access is restored. The isolated staging backend passed 12 cloud integration tests and five additional workflow checks with synthetic data and email disabled. Cloud-backed browser smoke checks also passed for both logins, receiving, dispatch, administrator voiding, stock reversal and corrected job totals. Production migration is complete and all 21 migrated data records match the independent export. Stock editing is enabled; production administrator sign-in and stock visibility were verified in both apps. Do not deploy this frontend against the old backend: login is incompatible.

See the [coordinated release checklist](https://github.com/matthewlakerdis-dev/panelstock/blob/fix/security-and-stock-integrity/RELEASE.md) and [mobile/backend PR #1](https://github.com/matthewlakerdis-dev/panelstock/pull/1).
