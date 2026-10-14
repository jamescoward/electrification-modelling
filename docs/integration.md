# Octopus and browser-storage integration status

Checked 14 October 2026. This implementation has synthetic adapter tests; it has **not** been verified against the owner's account or an operational GitHub Pages deployment.

## Feasibility evidence

| Check | Evidence and status |
| --- | --- |
| Public products/rates access | A normal HTTPS request with `Origin: https://jamescoward.github.io` to `https://api.octopus.energy/v1/products/?page_size=1` failed at the environment proxy CONNECT step with HTTP 403. Octopus was not reached; its CORS headers could not be inspected. |
| Browser public CORS and authentication preflight | System Chromium, actual document origin `https://jamescoward.github.io`, attempted public products fetch and the same request with a synthetic Basic Authorization header. Both failed with `net::ERR_CERT_AUTHORITY_INVALID` because the browser lacks the environment proxy CA in its trust store. TLS verification was retained. This is **not** evidence that Octopus rejects browser requests. The runtime network policy also excludes the API domain. |
| Account, previous agreements and changed meters | Mocked account responses test multiple serials, historic agreements and `is_export` identification. Live account checks remain pending in browser setup. No configured credential bindings or Octopus variable names were present; no values were read. |
| Actual tariff/region historic rates | Public paginated rate parsing is implemented, including negative VAT-inclusive rates. Owner-specific products, regions, historical coverage and live endpoint responses remain pending. |
| Intelligent Octopus Go additional cheap slots | Unsupported by the REST standard-unit-rate adapter. Reconstructed charges are provisional; the app must disclose this and accept exact-period import-charge/export-credit bill corrections. No dispatch/extra-slot support is claimed. |
| Persistence/recovery | Fake IndexedDB tests verify reload, separate demo data, revision conflicts, strict imports, atomic pre-import snapshots and recovery. Actual deployed-origin persistence remains a browser acceptance check after deployment. |

The coordinator saved additive network-domain requirements (`api.octopus.energy`, `developer.octopus.energy`) in the environment draft; these are not runtime-applied permissions. Retry the browser gate after the environment network settings and browser CA trust are available. No owner secret is needed for public checks. Use a real key only through the app's local credential control for authenticated checks; never add it to public fixtures or build variables.

## Adapter endpoint shapes

All API traffic is restricted by construction to HTTPS `api.octopus.energy/v1/`; foreign pagination destinations are rejected before sending headers. Consumption/account requests use the documented HTTP Basic header with API key as username and empty password, never URLs or query strings. Requests omit cookies. Rate values use `value_inc_vat` in pence and consumption uses `consumption` in kWh.

- `GET /v1/accounts/{account}/`: properties → electricity meter points (`mpan`, `is_export`), meters (`serial_number`), agreements (`tariff_code`, `valid_from`, `valid_to`). Unrelated addresses and account fields are discarded. Discovery returns proposed selections; the caller must obtain user confirmation before saving.
- `GET /v1/products/`: paginated products; optional `available_at` selects a date. Product discovery is independent of factual/hypothetical tariff assumptions.
- `GET /v1/electricity-meter-points/{mpan}/meters/{serial}/consumption/`: `period_from`, `period_to`, `page_size`, `order_by=period`; preserves returned timestamp offsets.
- `GET /v1/products/{product}/electricity-tariffs/{tariff}/standard-unit-rates/` and `standing-charges/`: paginated effective-date ranges, clipped to confirmed agreement ranges. The explicit adapter default is `DIRECT_DEBIT`; the client also supports selecting `NON_DIRECT_DEBIT`. Rows labelled with the other method are excluded. If unlabelled/same-method records contain conflicting overlapping prices, the adapter rejects the ambiguity rather than relying on pagination order. Confirm the payment method against the owner's bills during live setup.

Refreshing changes only the replaceable cache. It preserves manual facts, bill corrections and assumptions; replaces corrections by UTC-equivalent interval identity; preserves partial successes if later pages fail; reports incomplete status and permits safe retry. Completed endpoints replace the requested cache window, allowing deleted/corrected records to be reflected. By default it refreshes the latest known reading date minus 30 days; a deliberate full refresh starts at London midnight on occupancy. Select one meter point per direction for one property; replacement serials on that point are supported. `complete` describes request completion, **not** proof of complete meter/rate coverage or bill accuracy. Coverage and reconciliation must remain visible in the model/UI.

## Fallback and pending launch checks

While live access is pending, the synthetic demo and validated version-one JSON import/export provide a reusable manual source-data path. A full backup includes typed meter intervals, VAT-inclusive rates and bill corrections; inputs-only backup discards the source cache. This is not a complete substitute for automatic Octopus import. If real browser authenticated CORS is blocked, report that requirement as blocked and use manual data without introducing an open proxy or backend.

Before claiming owner-ready integration, verify public CORS and Basic Authorization preflight from the actual Pages origin, authenticated account discovery, import/export serial selection, prior and current agreements, rates for each actual tariff and region, incremental refresh with corrections, and reconstructed bills against real billed amounts. Show Intelligent Go reconciliation differences explicitly.

The app database is `household-energy-payback-v1`; household and synthetic demo records are separate. Credentials use a separate storage key, default to session-only, and persistent remembering requires explicit selection. Remembered browser keys are not encrypted vault secrets. IndexedDB snapshots are local recovery points, not disaster-recovery backups. Origin changes require portable export/import; Pages repository paths sharing one origin do not isolate personal data from other applications on that origin. Persistent storage is browser-dependent and explicit site-data deletion still destroys local data.

Version one is the first supported schema. Unknown/older schemas fail safely without replacing existing data; no unsupported migration is guessed. Future schema versions must add a tested migration and an atomic pre-migration snapshot.
