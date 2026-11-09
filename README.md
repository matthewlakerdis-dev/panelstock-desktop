# PanelStock desktop

Desktop browser interface for the same inventory used by `matthewlakerdis-dev/panelstock`.

This release must ship together with the mobile app and the new Cloudflare Worker. It replaces the shared backend credential with individual sessions, persists immutable stock/activity batches before sending, rejects conflicting edits without dropping pending work, excludes voided dispatches from jobs, and removes the 800-entry history cap.

The authoritative Worker implementation, full integration tests, and deployment/rollback checklist are in the mobile repository under `worker/` and `RELEASE.md`. Do not merge this frontend into a live deployment independently of that release.

The mobile repository README also documents the active Site Orders app, XLSX-to-PDF converter, CNC tracker and Daily Schedule TV display that share the production Worker.

The standalone Lennox Facades attendance station is hosted at [web.panelstockhq.com/sign-in/](https://web.panelstockhq.com/sign-in/), with administration at [web.panelstockhq.com/sign-in/manage](https://web.panelstockhq.com/sign-in/manage). These static pages use the production Worker for attendance and administrator sessions. The production Pages build copies `sign-in/` alongside the inventory app; GitHub Pages adds a trailing slash to the administration URL.

The attendance pages are compiled from `worker/src/attendance-page.js` by `worker/scripts/build-attendance-compatible.mjs` in the mobile repository. With the repositories checked out beside each other, run `node ../panelstock/worker/scripts/build-attendance.mjs --output-directory ./sign-in` from this repository. Regenerate and publish both HTML entry points and the Home Screen icon together when changing that interface. The generated pages use ES5 scripts and hashed CSP, keep the API fixed to the production Worker, and preserve its administrator and kiosk token authentication.

On iOS 10.3.4, open the live sign-in page in Safari and choose **Share → Add to Home Screen**. Open **Lennox Sign In** and connect using an existing administrator username and PIN if setup appears. This replaces the prior station link, as stated before connecting. Only station access is retained; the temporary administrator session is logged out. Visitors and contractors require full name, company and person visiting. Employees require full name and person visiting, with optional phone/email and no company field. Required labels have red asterisks and reason for visit is removed. Install this live page for real attendance; an older **Lennox Test** icon keeps opening the separate demo environment.

The sign-in station starts with **Sign in** or **Sign out**. Arrivals select Visitor, Contractor or Employee before the details screen. Visitors acknowledge host-provided safety instructions and answer workshop access plus conditional PPE questions. Contractors acknowledge site safety instructions from their Lennox Facades contact and answer workshop/work-area access plus conditional PPE questions. No PPE records the answer and prompts them to speak to their host or contact before entering the area or starting work. Sign out opens the full on-site roster. Completed and idle forms reset to the action choice, clearing safety answers. Administrators can review answers in the register and CSV; older records remain **Not collected**. The administrator sidebar has a **Sign-in register** link directly beneath **Safety**, opening the management page in a new tab.

Visitors and contractors also answer required Yes/No questions about emergency procedures and the assembly point, permitted areas, and hazard/incident contacts. Contractors carrying out work additionally answer whether they have completed the required induction and discussed today's work, hazards and controls with their Lennox Facades contact. No answers save with a follow-up reminder before entry/work; sign-in records attendance without approving work or verifying induction. The register and CSV preserve the answers, distinguish **Not collected** from **Not applicable**, and keep them off the public sign-out list.

`panelstock-client.js` must remain identical in both repositories. Node 22+ is required for `npm test`; tests inspect the embedded scripts and job filtering without accessing production.

One editing tab per app origin is allowed. Pending changes remain tied to the user who created them. Conflicts require review; no automatic overwrite is performed. Existing open sessions can queue offline changes, but login verification after a reload requires a connection. Device storage failures stop editing and offer export; unsaved work must be reconciled before discarding it.

## Standard operating procedures

[Open the approved SOP (PDF)](PanelStock_SOP.pdf). Both apps use the same user-supplied document. Replace this PDF in both repositories together; do not regenerate it from the retired SOP builders. The app download remains under Settings.

Site Orders require Villa for new Gate orders, or Location with separate optional Notes for Panels. Saved drafts retain these fields. Gate progress uses Drawn and total order area (m²), required when completing Drawn. Fabricated/QA and Ready for dispatch continue to update from QA.

Site Order forms use the same Order details, Site contact, Requested delivery and Notes sections for every type. Gate Villa and Panel Location appear within Order details; Notes is optional for all types. Older note text is restored into the common editor, with distinct historical text retained separately when both saved note fields contain content.

## 50 × 30 mm offcut stickers

Retaining offcuts in CNC scheduling opens the print window after the schedule is saved locally. Each retained physical piece gets one 50 × 30 mm sticker; multiple panels on the same sheet do not duplicate its labels. The sticker has three large, centred fields: dimensions, thickness and material, then colour/finish. Proposed pieces remain outside SOH until the operator confirms the completed cut. Matching offcuts continue to share their existing stock line and SKU.

Use **Print offcut labels** in the CNC tracker to reprint the currently filtered pending work. In SOH, use the offcut's **Manage → Print offcut label** action, or its stock-detail print action. Workshop profile offcuts are supported too. Each manual print defaults to one physical piece.

For a **NIIMBOT B1 connected to Windows by USB**, install the model-compatible Windows software/driver from the [NIIMBOT download centre](https://www.niimbot.com/us/downloadCenter), then select the B1 in the browser/system print dialog if it is available. Set paper to **50 mm wide × 30 mm high**, **100% / Actual size**, zero margins, and browser headers/footers off. Print one test sticker to check alignment before a batch.

The print window's **Print / Save PDF** action also provides a file hand-off: choose **Save as PDF**, then import the file into printing software that supports PDF and use the same 50 × 30 mm paper settings. If your installed NIIMBOT software accepts images rather than PDFs, convert each PDF page to a high-contrast image and import it at the original label size. Printing uses the installed print driver or this file hand-off. `offcut-labels.js` is shared verbatim by the desktop and mobile apps.

Ungrouped Site Order list headings show order number, project, order type and location/Villa, separated by hyphens. Older Panel locations remain available; Notes are not used as locations for non-panel orders. Grouped headings show order number, order type and location/Villa, with the project shown once in the group heading.

Web Site Order dispatch and Production Tracker dispatch links load the saved Dispatch settings: the first vehicle and eligible default driver are preselected, with other saved choices and external transport/driver entries available. Opening a Site Order rechecks current readiness and settings. Refreshing an open form preserves edited delivery details; uncertain retries retain the dispatch ID. Panel loads continue through their production, coating and QA checks.

The web dispatch address prefills from the Site Order's saved project address. Tracker panel-load dispatch uses the selected load's site address, falling back to the order's project address. Missing addresses remain blank and required; the destination stays editable and survives a status refresh. Release the matching Worker address-summary change before this frontend.

View order includes Admin notes for admins and the order requester. Admins add notes without editing the submitted order; requesters see a read-only list with author and Brisbane timestamp. Notes use a separate, retry-safe API and remain separate from the order's submitted Notes, PDF and Excel. Release the matching Worker/Site notification-and-notes API before this frontend.


Excel Production Tracker links for Open PDF, Action and Schedule delivery first try an existing signed-in PanelStock web tab. A free tab displays the requested PDF or action without navigating away from an unfinished order form. An existing tracker dialog is left alone; when no free tab responds, the link opens normally in its new tab. Browser tab focus and closing the temporary tab are best effort. The temporary relay never loads the session client or syncs drafts/outboxes. PDF previews use the existing short-lived, single-use PDF ticket; no credentials or PDF tickets are broadcast between tabs.

New order choices replace Gate with Bin Gate and Buggy Gate. Both use the existing Gate production workflow and require Villa plus Colour: Spruce or Norwegian Beech. The field starts blank, persists with drafts, and is also required when correcting a mistaken Panel order into a Gate. The server appends one uppercase colour suffix to every item and safely replaces a previous selection. Existing Gate production and receipt edit locks continue to apply. Release the companion Worker/Site colour change before this form update.

Historical orders labelled Gate retain their type and production/QA links. The generic Gate choice is hidden in new-order and correction selectors; older saved/queued Gate requests stay compatible. No existing order is guessed into a new subtype.
