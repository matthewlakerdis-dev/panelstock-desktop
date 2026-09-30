# Workshop stock

The desktop Stock menu and mobile More menu now include Workshop stock. This view combines existing panel sheets and sheet offcuts with extrusions, fixings, consumables and separately recorded offcuts. There is one workshop; locations are optional rack, shelf or bin descriptions.

Administrators create items with opening quantities, stock codes, stock units, specifications, supplier, location and reorder level. Pack size is descriptive: every movement is entered in the displayed stock unit. Offcuts require their profile and remaining dimensions. Existing panel receipts, CNC reservations, sheet consumption and offcut creation stay in their existing workflows; the overview reads their quantities directly and does not create duplicate stock.

For other items, receive deliveries, reserve stock for a job, confirm actual usage, return unused stock, release reservations, record damage and count stock. Usage consumes the selected job's reservation first and cannot consume another job's allocation. Counts below reserved quantities require allocations to be released first. Opening balances, detail changes and stocktakes require admin; other operations use the existing receive, dispatch and damage permissions plus stock-view permission.

All changes use authenticated server-side validation and an atomic save with activity history. Optimistic revisions reject stale edits. Mutation IDs prevent duplicate retries; a pending request is saved per user in browser storage before transmission and restored on reopening. Saves require a connection, and the screen provides Refresh for current shared balances. No offline movement queue is added to the legacy panel outbox.

Workshop data is stored separately from legacy panel records in the same inventory Durable Object. Daily/manual backups include it. Restoring a backup containing workshop data restores balances, allocations and metadata while preserving movement history and invalidating stale requests. Older backups without workshop data leave current workshop stock intact. Legacy panel full-reset controls continue to affect panel inventory only.

## Coordinated release

Deploy the mobile repository's Worker before publishing these frontends. No new bindings, secrets or migration are required. The endpoint is additive; old clients continue operating. Keep `workshop-stock.js` and `workshop-stock.css` identical in both repositories. iOS 10 and earlier continue using their existing legacy interface; the new workshop screen is available in the modern mobile app and desktop.

This release adds manual job allocations for general stock. Automatic allocations from non-panel schedules, barcode scanning and purchase-order matching are not included.

Administrators can add, replace or remove an optional profile/product image when creating a stock item or editing its details. PNG, JPEG and WebP files up to 8 MB are resized in the browser (up to 1600 pixels) and stored as a validated image under 500 KB. Thumbnails open an enlarged view. Images are included in workshop backups and preserved by unrelated detail edits.

## Profile variants
Use Manage → Add colour / length variant to reuse a profile code. Code + colour + length must be unique (case and repeated spaces are ignored). Each variant keeps its own stock, reservations, location and reorder level. The profile name, image and dimensions are reused; editing the image or dimensions updates every variant with that code. Categories and stock units must match. Existing records and movement IDs are preserved.
