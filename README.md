# PanelStock desktop

Desktop browser interface for the same inventory used by `matthewlakerdis-dev/panelstock`.

This release must ship together with the mobile app and the new Cloudflare Worker. It replaces the shared backend credential with individual sessions, persists immutable stock/activity batches before sending, rejects conflicting edits without dropping pending work, excludes voided dispatches from jobs, and removes the 800-entry history cap.

The authoritative Worker implementation, full integration tests, and deployment/rollback checklist are in the mobile repository under `worker/` and `RELEASE.md`. Do not merge this frontend into a live deployment independently of that release.

`panelstock-client.js` must remain identical in both repositories. Node 22+ is required for `npm test`; tests inspect the embedded scripts and job filtering without accessing production.

One editing tab per app origin is allowed. Pending changes remain tied to the user who created them. Conflicts require review; no automatic overwrite is performed. Existing open sessions can queue offline changes, but login verification after a reload requires a connection. Device storage failures stop editing and offer export; unsaved work must be reconciled before discarding it.

## Standard operating procedures

[Open the approved SOP (PDF)](PanelStock_SOP.pdf). Both apps use the same user-supplied document. Replace this PDF in both repositories together; do not regenerate it from the retired SOP builders. The app download remains under Settings.
