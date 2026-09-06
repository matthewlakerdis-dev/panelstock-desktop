# Stylesheet build

Run these commands from the repository root with Node 22 or later:

```sh
npm ci
npm run build:css
npm test
```

Tailwind CSS 3.4.17 and PostCSS 8.5.6 are pinned in the package manifest and lockfile. `tailwind.config.cjs` explicitly scans `index.html` and `panelstock-client.js`. Write complete utility class names in these inputs; add any new class-producing files to the content list.

Commit `tailwind.css` alongside markup changes. `npm run check:css` rebuilds in memory and fails if the committed stylesheet is stale; the test command and verification workflow run this check. The build normalizes line endings for Windows and Linux. No runtime CSS CDN is required.

Review affected screens and conditional states after adding styles. These commands build and test locally; they do not deploy.

