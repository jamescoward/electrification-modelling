# Home Current

A browser app for estimating the combined energy savings, financing costs and payback of household solar, a battery, EV use and a heat pump. It compares net household electricity costs with an estimated alternative using grid electricity, oil and petrol. Figures are GBP; dates use Europe/London.

The public app starts with no household facts. **Synthetic demo** opens a separate example project; it never fills in your household setup. Historical savings are an estimated comparison, even when electricity costs are reconciled to bills. Loan interest uses an explicitly labelled monthly approximation.

## Publish with GitHub Pages

The owner needs only a browser for deployment and normal use:

1. Commit the application files to this public repository (or your own public fork).
2. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the source.
3. Open **Actions**, enable workflows if GitHub asks, and run the Pages workflow or push a change to `main`.
4. After the workflow succeeds, open the Pages URL shown by GitHub and bookmark it. For this repository the expected project path is `https://jamescoward.github.io/electrification-modelling/`.

Pages serves the app and its bundled assets; no account registration, paid hosting, custom domain, local server or repeated file upload is needed. The workflow rebuilds on updates. Hash navigation keeps bookmarked sections working under the repository subpath.

Only source code and synthetic test data belong in the repository. Never commit real readings, bills, backups or API credentials. The app does not require household credentials in GitHub Actions or deployment settings.

## Start with your household

Choose **My household**, then work through **Inputs**. Enter exact occupancy and installation dates, prices paid after grants, oil records and coverage, baseline electricity, annual mileage and UK MPG, and heat-pump design **electrical input** in kWh. Missing values stay unknown; the dashboard explains what it needs before calculating a result.

Add each fixed-rate loan separately under **Loans**, including its monthly payment, rate convention, dates, linked installation and actual or planned overpayments. Regular repayments remain unchanged when an overpayment shortens the term. Loan payoff and combined investment payback are different dates.

For a forecast, confirm a full seasonal electricity reference profile from before the heat pump, including EV use, solar and battery. Explicit estimates are allowed and labelled. Forecast heating is extra grid consumption; measured historical whole-house electricity already includes heating and EVs. Oil sensitivity buttons adjust future assumptions; they do not rewrite purchased historical oil prices.

In **Data & backup**, enter your Octopus account details and API key locally. Refresh is deliberate. Review discovered meters and tariff agreements before relying on their costs, and reconcile against bills where available. Intelligent Go extra discounted slots are not assumed to be handled by standard-hour reconstruction. [Integration status](docs/integration.md) records evidence and checks that still require a real account; synthetic tests do not prove authenticated browser access. A manual source-import fallback is available when direct API access fails, but it does not complete automatic account integration.

## Save, back up and recover

Inputs and cached source data are saved in this browser's IndexedDB. Keep the same browser profile and deployment origin to reopen them. Storage can be denied or evicted; private browsing and clearing site data can remove it. Requesting persistent storage reduces eviction risk when granted, but it is not a backup. Repository paths on the same GitHub Pages origin do not provide separate privacy isolation.

Use **Export inputs** for portable facts and assumptions or **Export full backup** to also keep cached readings and reconciliations. Both exclude API keys. Keep the downloaded file somewhere you can recover it; backups may contain private household details. Input-only restore needs credentials again and a source refetch; revised API data may produce different reconstructed results.

To restore, choose a backup file, review the preview and **Confirm replace**. Imports validate schema, units and references before replacing the current project atomically. A local pre-import snapshot supports rollback, but snapshots in the same browser do not survive site-data deletion. Unknown future schema versions fail safely. This release starts at schema version 1; no older schema is declared supported.

Keys are session-only by default. The explicit remember option keeps a key in browser storage, which is not an encrypted vault. Use the forget-key control when finished. Two open tabs cannot silently overwrite a newer revision: reload a stale tab before making more changes. No analytics, tracking scripts, runtime CDNs, cloud sync or application backend are included.

## Development and checks

Requires Node.js 24 (the GitHub workflow selects it). Dependencies are pinned by `package-lock.json`.

```sh
npm ci
npm test
npm run build
npm run dev
```

For browser workflows, install Playwright Chromium once and run:

```sh
npx playwright install --with-deps chromium
CI=1 npm run test:e2e
```

The cloud workspace can use its existing `/usr/bin/chromium` with `npm run test:e2e`; set `CHROMIUM_PATH` to choose another installed Chromium. Browser tests build and serve the production app at `/electrification-modelling/` and use synthetic data only. They do not call a household's live account. See [acceptance coverage](docs/acceptance.md), [architecture](docs/architecture.md) and the original [specification](spec.md).

Local validation on 14 October 2026 passed 76 model/adapter tests and 12 Chromium workflows, including browser restart, backup recovery, failed refresh/retry and the Pages subpath. The production build passed. Authenticated Octopus access and the hosted Pages origin still require the checks recorded in the integration note.
