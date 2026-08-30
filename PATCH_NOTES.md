# Security and stock reliability update

Release status: prepared for coordinated deployment; not yet live.

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

Cloud staging and production migration remain pending because the Cloudflare connection previously rejected staging KV creation with authentication error 10000. Do not deploy this frontend against the old backend: login is incompatible.

See the [coordinated release checklist](https://github.com/matthewlakerdis-dev/panelstock/blob/fix/security-and-stock-integrity/RELEASE.md) and [mobile/backend PR #1](https://github.com/matthewlakerdis-dev/panelstock/pull/1).
