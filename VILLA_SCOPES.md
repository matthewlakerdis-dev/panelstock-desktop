# Villa Scopes desktop integration

Adds **Work → Villa Scopes** using the existing PanelStockHQ login and backend. Administrators open management; users explicitly granted `site.scopes.manage` open management, and users with only `site.scopes.view` open the read-only report. Neither permission is enabled by default for ordinary users.

`villa-scopes-launcher.js` requests a one-use, 60-second ticket through `PanelStock.apiFetch` and opens the module on the existing Worker host. It passes the ticket in the URL fragment rather than forwarding the full PanelStock session token or PIN. The module exchanges and clears the ticket. The navigation follows the existing Toolbox Talks pattern and opens a separate tab.

Both task permissions appear in the existing User Access role/user editor. The production and staging build allowlists include the launcher, so the published navigation has its required asset.

## Coordinated release

Release the counterpart in `matthewlakerdis-dev/panelstock`, branch `codex/villa-scopes-module`, **before** this desktop change. The Worker supplies the authenticated API, shared register, management UI and iPad report. Full setup, import, storage and rollback notes are in that repository's `VILLA_SCOPES.md`.

The existing Pages workflow publishes `main`; a push to this feature branch only runs verification. After release, refresh the desktop app, open Work → Villa Scopes, import the current populated workbook and use **iPad report link** to obtain the viewing URL. Managers can create a private, revocable report link in the module. That link opens the read-only iPad report without sign-in and carries a report-only viewing key; it never carries the normal PanelStock session token or PIN. Share it only with intended viewers. No private workbook or project data is bundled.

## Validation

```sh
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
npm test
node scripts/build-production.cjs
node scripts/build-staging.cjs
```

The navigation tests evaluate the actual Work group and handoff, checking default-deny permissions, manager/viewer routing and the role editor. Backend and tablet-size Chromium tests live in the Worker counterpart. Real iPad Safari remains a release check.
