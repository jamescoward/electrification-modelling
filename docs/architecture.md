# Architecture and conventions

The static React/Vite client uses pure TypeScript domain modules, browser adapters, application orchestration, and UI components. No backend, analytics, remote scripts, or service worker is required.

Money inputs are GBP; VAT-inclusive electricity rates are pence/kWh. Decimal.js performs financial arithmetic before presentation rounding. Interest rates are fractional annual rates (0.12 = 12%). Loan periods follow start-date anniversaries with actual cash dates preserved; this is a monthly approximation, not lender-exact daily interest. ISO local dates belong to Europe/London; source intervals use offset-bearing ISO timestamps. Date ranges are half-open (end excluded). Temporal handles local days and DST.

Unknown inputs are null, never guessed household facts. Source cache, assumptions, manual facts and credentials have distinct boundaries. A separate demo project/database key prevents synthetic examples mixing with household inputs. IndexedDB revisions reject stale writers. Imports validate before confirmation and atomic replacement, preserving a snapshot. Credentials never enter the Project/export schema.

Forecasts reprice a confirmed pre-heat-pump seasonal import/export profile, then add only incremental grid heating. Actual historic readings already include EV/heating use. EV records mark adoption dates only, require zero cost, and cannot receive loan funding because vehicle ownership and finance are excluded. Export credit is counted once. Simple payback uses full installation costs plus complete finance interest and fees; cash flow separately accounts for invoices, drawdowns and actual repayments.

Integration evidence and unresolved live-account checks are recorded in integration.md. No deployed release or live-account validation is implied by local fixture tests.

Reference profiles can be saved while incomplete: imported kWh, exported kWh and cheap fractions use null for missing components. Available source components are derived independently, with separate import/export provenance. An explicit representative-export start date excludes earlier exports only from the forecast reference; the cache and historical costs are retained. A complete forecast requires all twelve months plus confirmation. No solar seasonal extrapolation or missing-export-as-zero assumption is made.
