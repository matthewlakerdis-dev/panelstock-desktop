# PanelStock release notes

## Approved SOP and repository cleanup - 31 August 2026

- Replaced the SOP with the exact user-supplied PDF, shared by both apps.
- Removed superseded SOP Markdown, PDF generators and their screenshot assets to prevent accidental regeneration of the old guides.
- Removed the unused 512px desktop icon; the active favicon is retained.
- Kept application code, tests, deployment configuration, release history and recovery documentation. No stock data or application behaviour changed.

## Original SOP style restored - 31 August 2026

- Restored the original cover, contents, typography, colours, small corner logo, numbered steps, screenshot placement and callout styling.
- Retained current receiving, catalog, CNC, Excel and permission instructions; both guides now contain 27 pages.
- Added a reproducible PDF builder and retained source screenshots so future revisions preserve the agreed design.
- Documentation-only correction; stock data and application behaviour are unchanged.

## Illustrated SOP correction - v2026.08.31.4

### Illustrated SOP correction
- Restored screenshots and Lennox branding to both operating procedures, correcting the text-only guides in v2026.08.31.3.
- Retained relevant original mobile examples for offcuts, dispatch, damage, job history and activity corrections.
- Added current mobile and desktop screenshots for receiving, missing-material receipts, CNC grouping and confirmations, in-app bulk entry, sharing and backup controls.
- Kept the updated workflow and permission instructions, with captions and an Excel status-colour key.
- Added image sources alongside the editable SOP so future updates can retain the illustrations.

### Validation
- Rendered and visually reviewed all 21 mobile pages and 24 desktop pages, including enlarged form details and page numbering.
- Documentation-only update; inventory data, app permissions and stock behaviour are unchanged.

Refresh the app, then reopen Settings > Standard Operating Procedures to load the illustrated guide.


## Receiving updates and refreshed SOPs - v2026.08.31.3

### Receiving stock
- Users and admins can add a missing material directly from Receive, even when the catalog is empty.
- Enter material details, quantity received and an optional supplier/PO reference in one popup. Receive stock creates the catalog item and stock receipt together.
- The popup focuses on manual entry. Choose existing materials on the main Receive screen; matching materials are reused rather than duplicated.
- Quantity validation and repeat-submit protection help prevent accidental receipts. Catalog editing, deletion and bulk management remain admin-only.

### Shared CNC Excel
- Completed rows are green and pending rows are yellow across all eleven columns, including rows added by later refreshes.
- The workbook continues refreshing on opening and every minute while open in desktop Excel.
- Download an older workbook once again to get the new colour rules; routine updates do not require another download.

### Updated operating procedures
- Replaced outdated instructions with separate mobile/tablet and desktop SOPs, available from Settings.
- Covers receiving, offcuts, dispatch, damage, CNC panel/sheet confirmations, collapsible groups, sharing, in-app bulk entry, permissions, backups and sync recovery.
- Includes editable SOP source in the repository for future maintenance.

### Validation and rollout
- All 70 automated checks pass, including authenticated user receipts and permission restrictions.
- Both nine-page PDF guides were rendered and visually checked.
- Refresh the app and reopen the SOP from Settings to view the updated guide.

# Security and stock reliability update

## Missing-material receipts for all users — 31 August 2026

- Both users and admins can access Add missing material and receive stock from the popup, including an empty catalog.
- The server permits user-created catalog entries only with a matching new stock entry and receipt in the same batch. Catalog editing/deletion, stock-detail editing and other admin permissions remain restricted.
- All 70 checks pass, including authenticated staff receipts, retry safety and denied permission escalation.


## Simplified missing-material popup — 31 August 2026

- Removed the existing-material search and picker from Add missing material. The popup now focuses on manual material details, quantity and supplier/PO reference.
- Existing materials remain available on the main Receive screen. Receipt validation and duplicate protection are unchanged.


## Receive stock inside the material popup — 31 August 2026

- Added required quantity received and optional supplier/PO reference to the choose-or-add material popup. Receive stock completes the whole action without returning to the main quantity form.
- Existing stock is incremented without duplicate catalog entries. New catalog material and received stock are staged in one save, with a receipt activity record.
- Validates positive whole quantities and stock limits; repeated submission is blocked. Existing permissions are unchanged.
- All 67 checks pass. Browser tests confirmed both existing and new material receipts using isolated data.


## Receive material picker — 31 August 2026

- Receive now offers an offcut-style dialog with searchable available materials, colour swatches, dimensions, SKU and stock on hand, plus manual fields.
- Selecting a material prefills editable details. Existing combinations are selected without duplication; new combinations are added to the catalog and selected for receiving. Stock is only received after entering a quantity on Receive.
- All 63 checks pass; browser testing verified prefill and reuse.


## Add missing materials from Receive — 31 August 2026

- Admins can open a matching Add missing material dialog directly from Receive, including when the catalog is empty.
- Validates required material/colour, dimensions, reorder point and duplicates using the catalog validation. The new catalog item and zero-stock entry are created together, then selected automatically.
- Enter the delivery quantity and use Add to SOH to receive stock normally. Creating a catalog item alone does not increase stock. Worker permissions are unchanged.
- Verified end-to-end using isolated test data; all 61 automated checks pass.


## Compact CNC and catalog bulk entry — v2026.08.31.2

## CNC bulk entry
- Enter the order number and job reference once; both are required for bulk entry.
- Compact sheet-number and panel-ID columns replace the numbered row cards. Shorter fields sit together with a red trash icon at the end of each row.
- Add or remove rows as needed. Blank rows are ignored; incomplete rows and repeated sheet/panel pairs block the whole submission.
- Existing order cleanup, job-reference capitalization and panel-ID capitalization are preserved.

## Material catalog bulk entry
- Replaces the CSV import with an admin-only in-app form.
- Enter the required material and colour once, then add rows for thickness, width, height and reorder point.
- Dimensions are in millimetres and must be positive. Reorder point is an optional nonnegative whole number and defaults to zero.
- Incomplete sizes, invalid numbers and duplicate material/colour/size combinations in the batch or existing catalog are rejected before saving.
- New catalog items receive unique SKUs and matching stock entries with zero quantity through the existing synchronized batch-save workflow. Existing stock quantities remain unchanged.


- Verified with 56 automated checks and isolated browser testing.


## In-app CNC bulk entry — 31 August 2026

- Replaced CNC spreadsheet import with an admin-only form. Enter the order and optional job reference once, then add/remove sheet-number and panel-ID lines as needed.
- Empty lines are ignored; incomplete lines and repeated sheet/panel pairs block the whole submission. Existing order cleanup and capitalization apply to every new panel.
- Saves the batch through the existing synchronized schedule workflow. Single-panel scheduling, completion, catalog imports and Excel exports are unchanged.
- All 50 automated checks pass; browser testing confirmed validation and a multi-panel save with isolated test data.


## CNC panel confirmation — 31 August 2026

- Complete panel now opens a matching in-app confirmation showing the order, sheet and selected panel ID. Cancel or Escape leaves the panel unchanged.
- Confirmation completes only the selected pending panel; an already completed panel is not stamped again. Whole-sheet completion is unchanged.


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
