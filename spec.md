Household Energy Savings & Payback — v1 Build Specification

Status: ready for implementation, subject to the explicit integration checks below.
Prepared: 14 October 2026. Currency: GBP. Household timezone: Europe/London.

This document is the build brief for a new public GitHub repository. No application has been built as part of preparing it. Household figures not supplied here are setup inputs, not reasons to interrupt implementation. Use synthetic data until the owner connects their account.

1. Product outcome

Build a private-data, single-household browser app that estimates the combined financial benefit of solar panels, a battery, electric cars and replacing an oil boiler with a heat pump. Compare the household with these changes against retaining oil heating, petrol cars and grid electricity without solar or a battery.

The owner opens a bookmark, sees previously saved information, optionally refreshes Octopus data, and explores savings, investment payback including loan interest, and household cash flow. No terminal, local server, recurring file upload, paid hosting or account registration for the app is required in normal use.

Deploy static assets to GitHub Pages from a public repository. Personal inputs, API credentials and private readings must never be committed or deployed. The public app has no household data until someone enters it in their own browser.

Required outputs

• Historical combined energy savings, clearly described as measured electricity costs versus an estimated alternative household.
• Estimated next-year savings and low/central/high oil-price projections.
• Combined investment payback including installation costs and loan interest.
• Cash-flow chart accounting for cash contributions, borrowing, repayments and overpayments.
• Separate loan balances, interest totals and payoff dates, even though technology savings are combined.
• Clear explanations of data sources, missing data and assumptions behind every headline.
• Portable, versioned input export that allows the model to be rebuilt and API data fetched again.

2. Decisions already agreed

|Area                |Decision                                                                                                                                                                           |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|Occupancy           |Moved into the home in July 2025; exact date is a setup input.                                                                                                                     |
|Solar, battery, EVs |In use from September 2025; exact dates are editable setup inputs.                                                                                                                 |
|Heat pump           |Installed October 2026; exact commissioning date required in setup.                                                                                                                |
|Solar               |Approximately 11 kWp; precise capacity is not yet known.                                                                                                                           |
|Inverter and battery|FoxESS, 7 kW inverter, 9.6 kWh battery. Capacities are metadata in v1.                                                                                                             |
|Heat pump           |Vaillant aroTHERM plus, 10 kW, 2026.                                                                                                                                               |
|Current import      |Intelligent Octopus Go. Discover exact agreements and dates through API where possible.                                                                                            |
|Current export      |Outgoing Octopus. Discover exact product and region through API where possible.                                                                                                    |
|Earlier import      |Probably an Octopus fixed tariff. Discover and ask for confirmation during setup.                                                                                                  |
|Oil records         |About one full seasonal year of purchases. Starting/ending tank contents unknown. Tank ran empty at least once; date may be entered if known.                                      |
|Old boiler          |Supplied both space heating and hot water.                                                                                                                                         |
|Cars                |Compare estimated petrol fuel expense against electricity already included in the household bill. Combined annual mileage and editable petrol MPG suffice.                         |
|Public charging     |Excluded as very infrequent; disclose that savings are slightly overstated.                                                                                                        |
|Finance             |Separate fixed-rate loans for solar/battery/charger and heat pump.                                                                                                                 |
|Solar loan          |Also financed EV charger installation. A substantial early overpayment, approximately half, shortened the term without reducing monthly payments. Exact amount/date to enter later.|
|Grants              |Enter the price actually paid after grants. No separate grant calculation.                                                                                                         |
|Maintenance         |Excluded. Energy costs, installation costs and loan interest only.                                                                                                                 |
|Heating forecast    |Owner enters design-estimated annual electrical consumption in kWh. Do not substitute thermal output or pump rated capacity.                                                       |
|Heating timing      |Allocate energy seasonally, uniformly throughout each local day; derive effective cost from standard tariff hours.                                                                 |
|Scope               |Combined technology savings/payback for v1. Separate technology attribution may follow.                                                                                            |
|Hosting             |GitHub Pages; public code acceptable, private data stays on device.                                                                                                                |
|Devices             |Computer first; phone synchronisation not required.                                                                                                                                |
|Future desktop      |Preserve reusable model, UI and storage boundaries for a possible Electron version. Do not build Electron now.                                                                     |

3. Scope boundaries

Include

Octopus account/meter/tariff discovery; import and export data; reconstructed electricity costs; bill reconciliation; oil purchase entry; manually supplied oil/petrol prices; annual mileage; heating forecast; fixed-rate loan schedules and overpayments; editable scenarios; charts and tables; persistence; backup/restore; synthetic demo; deployment automation and automated tests.

Exclude

MOT API, FoxESS or Vaillant integration, EV/charger integration, automatic oil-price scraping, live monitoring, hardware control, solar/battery sizing experiments, dispatch optimisation, separate technology savings allocation, multiple households, login, cloud database/sync, desktop packaging, weather API, vehicle ownership/depreciation/insurance/finance, servicing, carbon accounting, grants accounting, NPV and tax advice.

No new integrations or infrastructure should be added merely because a library makes them convenient. API failures must not silently expand the scope to a backend or proxy.

4. Architecture and implementation defaults

Use TypeScript, React and Vite for a static client application, IndexedDB behind a repository interface, runtime schema validation, a pure calculation package, a unit-test runner and Playwright browser tests. Choose small maintained libraries as needed; commit a lockfile. These are implementation defaults rather than owner-selected framework requirements.

Keep these boundaries explicit:

1. Domain: typed facts, assumptions, interval records, loans, date/rate schedules, pure calculations. No browser, network, React or database imports.
2. Adapters: Octopus network client, IndexedDB persistence, portable import/export, clock and credential storage.
3. Application: refresh, reconciliation, projection and backup workflows.
4. UI: forms, validation, explanatory text, charts and accessible tables.

A later desktop version should replace adapters while retaining the model and most of the interface. Do not build a general plugin framework.

Use UTC instants for meter intervals and effective rate timestamps. Use Europe/London calendar dates for bills, standing-charge days, installation dates and user-entered finance dates. Preserve timezone offsets from API data when parsing. Store currency with decimal-safe calculations; show GBP to pennies. Keep kWh precision until final presentation. MPG means UK imperial MPG, using 4.54609 litres per imperial gallon.

5. Integration feasibility gate — do this first

Before a large UI build, produce a short integration note and a minimal adapter test. Verify:

1. Browser-origin access to the needed Octopus public and authenticated endpoints from the intended Pages origin, including authentication preflight/CORS. A successful server-side request is not evidence of browser access.
2. Account discovery, previous agreements, meter changes and import/export identification.
3. Historic rate availability for the actual products and region.
4. Whether Intelligent Go extra cheap charging periods can be obtained accurately through an appropriate documented interface, and how reconstructed costs reconcile to bills.
5. Persistence and recovery on the selected deployment URL.

Document evidence, tested endpoint shapes, limitations and a fallback. No owner credentials in test fixtures or logs. If no credentials are available, finish public checks and mocked implementation; mark authenticated checks pending until in-app setup. Do not claim live-account verification from mocks.

If direct authenticated browser access is blocked, continue the model/UI using fixtures and a reusable manual import adapter, but report the blocked automatic-import requirement clearly. Do not call manual import a complete substitute for the agreed Octopus workflow. Do not publish an open CORS proxy, embed secrets, or introduce a paid/backend dependency without owner agreement.

6. Setup inputs

Use a short wizard with autosave and a checklist. The owner can return later. Unknown values stay unknown; do not persist guessed dates or amounts as facts.

Household and installations

• Occupancy/start date; exact commissioning dates for solar, battery, heat pump, EV use and charger as applicable.
• Installation records with stable IDs, type, date, price paid after grants, optional notes and allocated loan funding.
• Solar/battery/charger may be a single invoice record with optional component allocations. Never require a guessed cost split.
• Separate heat-pump cost record. Costs may be financed or paid from cash; the full cost must reconcile with funding.
• Optional capacity metadata as above, without affecting calculations in v1.

Octopus

• API key and account number entered locally; discover property, MPANs, meters, import/export directions and tariff agreements.
• Ask the user to choose the property/meter only if ambiguous. Provide editable account/meter details as a fallback.
• Show discovered agreements for confirmation. Keep factual agreements separate from hypothetical comparison tariffs.
• Optional monthly actual bill charges and export credits for reconciliation. Direct-debit payments and account balances are not energy costs.

Baseline electricity

• Select the occupied, pre-solar/pre-EV/pre-heat-pump period, probably July–September 2025.
• Estimate daily household consumption from complete days; annualise using day counts. Default seasonal adjustment is flat because there is little evidence for a measured winter profile.
• Provide an annual kWh override and optional monthly weights. Display source dates and coverage.
• Select the previous fixed tariff if verified. On expiry, use an explicit editable continuation assumption; default to a regional standard-variable product if available, labelled hypothetical. Offer selection of a fixed product available on a chosen date instead.
• Never apply today’s fixed deal retrospectively or silently switch the assumed historical tariff when the API refreshes.

Oil

• Purchase table: delivery date, litres, total paid including VAT/delivery, optional unit price and note. If both total and unit price are given, flag discrepancies.
• Explicit period covered by the annual-use estimate, with optional opening and closing tank litres and an optional dated run-empty observation.
• Derived annual litres with editable override. Unknown tank stock means estimated, not measured, consumption.
• Current quote in pence/litre, quote date, optional supplier and order size; specify whether VAT/delivery are included and normalise to total household cost.
• Low/central/high future pence/litre assumptions. Suggested defaults are 80%/100%/120% of the entered quote, explicitly illustrative sensitivities, not confidence intervals or market forecasts.
• Optional dated historical price assumptions; otherwise derive an editable volume-weighted purchase price and label its use as an approximation.

Cars

• Combined annual miles, editable petrol efficiency in UK MPG and petrol price in pence/litre with date.
• No vehicle registration, MOT connection or per-car records required.
• Assume reference-year mileage represents future mileage. This version does not simulate a change in driving behaviour; editing mileage corrects that assumption, rather than changing EV consumption independently of the reference electricity profile.
• MPG and petrol price may start blank with helpful explanatory examples; never label an arbitrary example as a measured national average.

Heating

• Design-estimated annual electrical input kWh, covering space heating plus hot water; help text distinguishes electrical input from thermal output and 10 kW rated capacity.
• Default monthly allocation: Jan 16%, Feb 14%, Mar 12%, Apr 9%, May 5%, Jun 3%, Jul 2%, Aug 2%, Sep 5%, Oct 8%, Nov 11%, Dec 13% (100% total).
• These weights are a rough editable model assumption, not local weather or design data. They retain summer hot-water use. Allow design monthly figures to replace them if available.
• Heat-pump telemetry exists in the manufacturer’s app but is not required for v1.

Loans

For each loan: stable ID, linked installation IDs, drawdown/start date, original principal, fixed annual rate and rate convention, contractual monthly payment, first repayment date, payment day, optional original term, fees if any (default zero), and dated past/planned overpayments.

Keep actual amounts and planned amounts distinguishable. Overpayments reduce principal and shorten term; regular repayments remain unchanged. A user-supplied balance at a statement date can anchor projections when the simplified schedule does not match the lender. Retain the original records and explicit adjustment provenance.

Do not infer the exact overpayment from ‘half paid off’. Exact figures are setup inputs. No loan figures are known yet.

7. Model definitions

7.1 Historical electricity cost

For each covered interval: imported kWh × applicable import rate, minus exported kWh × applicable export rate. Add standing charges once per applicable local calendar day. Include VAT exactly once; API pence values convert to GBP exactly once. Support negative rates and preserve their sign.

Split overlapping rate boundaries correctly and support distinct meter serials/agreements without duplicate energy. A meter interval spanning a rate boundary may be apportioned by elapsed duration only when finer information is unavailable; tag this as estimated.

Intelligent Go standard hours alone may miss extra discounted periods. Until those are resolved, mark reconstructed costs provisional. Permit bill-period overrides of import charges and export credits separately. An override replaces the corresponding calculated cost for its exact period; it is not an additional expense. Preserve API energy and show reconciliation differences. Reject overlapping overrides for the same cost component unless the user explicitly replaces an earlier one.

Use the latest fully covered comparison date, not today’s partial readings, as the default historic cutoff. Show provisional recent periods separately. Gaps must be visible; missing export/import is not zero. Let the user explicitly choose estimated gap filling or exclude incomplete periods from reported totals. All comparison components must cover the same included dates.

7.2 Savings against the alternative household

For any included period:

operating savings = alternative-household energy cost − upgraded-household energy cost

Alternative cost includes estimated ordinary household grid electricity, oil heating/hot water and petrol for the equivalent mileage. Upgraded cost includes net actual grid costs, any oil still used before the heat-pump transition, and petrol before the EV transition.

Use each installation’s actual start date. Before EV use, petrol costs on both sides cancel. Before the heat pump, oil costs on both sides cancel. Before the first upgrade, report no upgrade savings. Existing fossil fuel costs may be shown for context but cannot be claimed as avoided before the relevant transition.

Home EV charging and heat-pump electricity are already in actual whole-house grid readings. Never add them again to measured periods. Export income is subtracted once. No separate battery or self-consumption credit is added to net-metered costs.

Historical savings remain a counterfactual estimate even when the actual electricity side is fully reconciled. The headline must not say the full savings figure was measured.

7.3 Oil and petrol arithmetic

When tank levels are known:

oil used = litres delivered + opening tank litres − closing tank litres

When unknown, deliveries are a proxy over the declared coverage period, with an annual-use override and a visible stock-level uncertainty note. A single purchase or arbitrary first-to-last delivery span must not silently become a complete annual baseline. Allocate consumption seasonally; do not treat delivery day as the day all that oil was burned.

Use the heating monthly weights as the initial oil-consumption profile, editable independently later. Historical avoided oil uses dated prices where supplied, or the labelled historical price approximation. The current quote affects future scenarios only; it must not rewrite historical savings unless the user explicitly edits historic assumptions.

petrol litres = annual miles ÷ UK MPG × 4.54609

petrol cost = petrol litres × GBP per litre

Allocate mileage by day count unless more detail is supplied. Public charging is excluded, with that limitation visible in model assumptions.

7.4 Future electricity and heating

Use a user-confirmed full seasonal reference year after solar/EV adoption and before heat-pump commissioning, ideally approximately September 2025–September 2026. Preserve imported and exported kWh profiles, not just old pound totals. Reprice them using selected forecast import/export rates. If a complete year is unavailable, identify missing months and require an explicit estimated/entered profile; do not invent measured data.

This reference already embodies solar, battery and EV operation. Do not add a second solar benefit or EV charging cost. Reference conditions and mileage are assumed unchanged. Forecast charging discounts outside the standard tariff schedule are excluded unless explicitly represented by a supported model; show this as a simplification.

For a forecast month:

1. Allocate the entered annual heat-pump electricity to the month by the selected weights.
2. Divide across the month’s local days, then uniformly across actual elapsed time within each day.
3. Apply import prices to each overlapping tariff interval. DST days contain 23 or 25 hours; conserve total monthly kWh.
4. Add this heating grid cost to the reference-year net electricity forecast.

The effective heating price is heating cost divided by heating kWh. For an ordinary 24-hour day with six cheap hours, this is 25% cheap rate plus 75% daytime rate; derive the hours from the selected tariff schedule, not a hard-coded six hours.

Initially assume all incremental heating electricity comes from the grid. Keep reference export unchanged. Additional solar self-consumption, battery interaction and extra Intelligent charging slots are not modelled for heating. This can overstate heating costs and understate benefits, but it is not a guaranteed bound on total forecast error.

For a post-installation historic period with actual household readings, use those actual costs without adding forecast heating. For future periods, use the pre-heat-pump reference plus heating estimate. Do not automatically use a mixed post-heat-pump year and add another full heating estimate. A later ‘whole-house year with heat pump’ reference mode may replace the entire forecast profile and must explicitly disable the heating addition.

7.5 Scenario defaults and horizon

Default projection horizon: 20 years from the first upgrade, editable. Use nominal GBP, no discounting, and flat future prices within each scenario unless the user adds dated changes. No assumed annual price escalation, equipment replacement, degradation or residual value in v1. State these exclusions beside long-horizon results.

Low/central/high labels refer to oil prices; higher oil prices normally increase the benefit of the heat pump. Do not label the low-oil case ‘optimistic’. Future petrol and electricity prices stay fixed at selected assumptions unless explicitly edited. Future tariff prices are assumptions, never presented as known API facts.

Show ‘not reached within N years’ if there is no payback; never force a date from negative or zero savings.

7.6 Loan calculation

Implement a transparent, monthly amortisation approximation, with optional statement-date balance anchors. Do not promise lender-exact daily interest.

• For a nominal annual interest rate, monthly rate is annual rate/12.
• For an effective annual rate, monthly rate is (1 + annual rate)^(1/12) − 1.
• Keep APR distinct: an APR that includes fees does not necessarily equal the contractual interest rate. If only APR is supplied, permit a labelled approximation and allow balance reconciliation.
• Define monthly boundaries by the loan start-date anniversary. Calculate each period’s interest on its opening principal. Payments and overpayments in that period reduce the balance at its end for interest purposes. Preserve real cash dates for the cash-flow chart. Clearly disclose this monthly approximation for mid-period overpayments and irregular first payments.
• Apply contractual payments to accrued interest first, then principal. Overpayments reduce remaining principal. Handle zero rate directly; reject negative amounts and non-amortising schedules rather than looping forever.
• On the same date, apply regular payment before overpayment. Clamp the final payment to the amount owed; never create negative debt. Flag excess proposed overpayments and retain the user’s entered request separately from the amount applied.
• Use the contractual payment in preference to recalculating it. If payment is missing but term and rate are given, offer a calculated estimate with that provenance.
• Future interest is recomputed after each planned overpayment. Known fees are separate and counted once.
• Report each loan’s remaining principal, estimated remaining interest, total interest, scheduled payoff date and the interest/payoff change from planned overpayments.

7.7 Investment payback and cash flow

Headline investment payback including finance:

investment cost = sum of entered installation prices + actual/estimated full-loan interest + separate finance fees

Loan interest includes the modelled complete loan schedules, even if a loan ends beyond the selected chart horizon. Do not add financed principal again. Payback is the first month cumulative operating savings since the first upgrade recover that total committed investment cost. All agreed installation costs are included, even though installation dates differ. Show month/year, scenario and total investment cost used. If later negative savings cause a subsequent fall below recovery, flag that rather than implying permanent recovery.

This is a deliberately explicit simple payback definition: full modelled financing cost is included from the outset. It is not discounted payback, a lender quote, or a claim that all interest has already been paid.

Separate cumulative household cash benefit:

operating savings − installation cash payments + loan drawdowns − regular loan payments − overpayments − separately paid finance fees

Equivalently, when funding occurs on the invoice date, deduct only the owner’s cash-funded installation contribution, then repayments. Never mix the two formulations or double-count fees. Retain dated drawdowns/payments if they differ. Show the outstanding loan balances beside the chart: a positive cash position does not mean debt-free or that the investment has paid back.

Past overpayments are actual household outflows. Planned overpayments reduce future interest but create future cash outflows. Keep those effects visible. Separate technology payback remains out of scope despite separate loan reporting.

8. Data ownership, persistence and recovery

Independent data layers

1. Authoritative entered facts: installations, invoices, oil deliveries, loans, payments, balance anchors, mileage, design estimate, bill corrections and selected reference periods.
2. Explicit model assumptions: price scenarios, baseline consumption, tariff continuation, seasonal weights, forecast horizon and exclusions.
3. Replaceable source cache: Octopus records with endpoint identity, request period, retrieval timestamp, units and source metadata. Retain needed source values for audit, avoiding unrelated personal account fields.
4. Derived results: calculation output, coverage flags, input hash, model version and calculation timestamp. These may always be discarded and rebuilt.
5. Credentials: separate from all exportable model data.

Use stable entity IDs, schemaVersion and migration functions. Preserve input provenance: entered, API-derived, estimated or overridden. Refetch must never overwrite a manual fact or selected assumption silently. An account/MPAN may appear in a private export for reconnection but must never enter the repository.

Persistence behaviour

• Autosave validated edits transactionally to IndexedDB; show saved/saving/error status. Closing/reopening the same browser profile preserves inputs and cache without import.
• Request persistent browser storage where supported and show whether granted. It reduces eviction risk; it is not a backup and does not survive explicit site-data deletion.
• Keep pre-migration local snapshots, with rollback on a failed migration. Do not describe snapshots in the same browser storage as disaster-recovery backups.
• Namespace the database for this application. Keep the deployment origin stable; a new hostname/origin needs export/import. Other applications hosted on the same GitHub Pages origin are not isolated merely by repository path, so do not claim path-level privacy isolation.
• Handle denied storage/quota errors without saying edits were saved. Support a single-writer/multi-tab conflict policy so two open tabs cannot silently overwrite changes.
• Network refresh is explicit, incremental and resumable. Keep the last good cache after errors. Provide a separate deliberate full refetch action; re-fetch recent periods to pick up corrections, default last 30 days.

Portable backups

• Export inputs and assumptions as a documented versioned JSON file. Offer a full backup including cached readings and reconciliations for reproducible historic results.
• Exclude API keys/tokens by construction. An inputs-only restore rebuilds calculations and requests credentials again to refetch data; explain that future API revisions may change retrieved source data.
• Validate schema, units and references before import. Show a summary, create a pre-import snapshot, and replace atomically only after confirmation. Do not silently merge conflicting projects.
• Unknown newer schema versions must fail safely. Older supported versions migrate with a recorded migration history.
• Offer a gentle backup reminder after substantial changes or a long interval. Export is an occasional recovery action, never required on each use.

Credentials and network privacy

Default to session-only API-key use, with an explicit ‘remember on this browser’ option and forget-key control. Persistent browser storage is not an encrypted credential vault; explain this briefly when enabling it. Never store keys in URL/query strings, telemetry, error reports, exports, source code, build settings or GitHub Actions secrets for a client bundle. Use the documented authentication header.

No analytics or third-party tracking. Bundle dependencies/assets rather than runtime CDN scripts. Restrict network destinations to required API endpoints and app assets; do not promise zero network traffic because the host and API necessarily receive requests. Treat imported files and API strings as untrusted content; do not render executable HTML. Avoid an unnecessary service worker in v1; calculations can continue with loaded/cached data during network failure, but offline cold-start is not a launch requirement.

9. User experience

Desktop-first, simple and readable. No need for a bespoke mobile layout, but forms must remain usable when the window is narrow. Use keyboard-accessible controls, labelled fields, clear units, and tables accompanying charts.

Dashboard

• Historical energy savings to a stated date, with ‘estimated comparison’ and data-coverage indicator.
• Estimated next 12 months’ savings.
• Combined payback month/year including interest, or no payback within horizon.
• Combined outstanding loan balance; links to individual loans.
• Cumulative savings versus investment chart; visually separate historic and forecast periods.
• Cash-flow chart with overpayment markers and remaining debt context.
• Oil scenario selector and a short assumptions summary.

Energy and comparison

Monthly actual/reconstructed net electricity costs, baseline costs, avoided oil/petrol estimates, coverage, source and override status. Expand a month to understand its arithmetic. Show effective heating price and how tariff hours produced it. Energy exports and financial loan repayments must not share ambiguous ‘export/payment’ terminology.

Inputs and finance

Editable inputs grouped into installations, baseline, oil, mileage/heating and loans. Separate loan cards with schedule tables and past/planned overpayments. Scenario changes update results without mutating factual history.

Data and settings

Connection status, discovered meters/tariffs, last refresh, data ranges/gaps, reconciliation, backup/restore, storage status and model version. A labelled synthetic demo mode must never intermingle with household data.

10. Acceptance criteria and worked fixtures

Use synthetic data only in public tests. These criteria are required behavioural tests, not a request to duplicate every UI implementation detail.

|ID |Check                                                                                                  |Expected result                                                                                               |
|---|-------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
|A01|Reload and close/reopen browser with saved inputs                                                      |Inputs and cached results survive; no file upload needed.                                                     |
|A02|Export inputs, wipe app data, restore, run against same cached fixture sources                         |Same facts/assumptions and same model results; credentials absent.                                            |
|A03|Inputs-only restore followed by source refetch                                                         |Manual edits survive; derived results rebuild; changed sources are traceable.                                 |
|A04|Fetch the same intervals twice                                                                         |No doubled kWh, cost, standing charges or export credits.                                                     |
|A05|Fetch fails after some pages; rate limit or key expires                                                |Keep good saved data, show incomplete refresh, permit safe retry.                                             |
|A06|10 kWh at 10p, 5 kWh at 30p, 4 exported kWh at 15p, 60p standing charge                                |Net daily cost £2.50.                                                                                         |
|A07|Heating 24 kWh on normal day, six hours at 10p, eighteen at 30p                                        |Heating cost £6.00; effective price 25p/kWh.                                                                  |
|A08|March/October DST and leap-year fixtures                                                               |No lost/duplicated intervals; monthly allocated kWh conserved; standing charges count local dates.            |
|A09|Actual post-install household electricity bill £100 includes heating and EVs                           |Use £100 once; do not add simulated heating/charging.                                                         |
|A10|10,000 miles, 40 UK MPG, petrol £1.50/litre                                                            |1,136.5225 litres; £1,704.78 fuel cost after final rounding.                                                  |
|A11|Oil deliveries 1,500 L, opening 200 L, closing 100 L                                                   |Consumption 1,600 L; unknown levels instead produce a labelled proxy.                                         |
|A12|Period before heat-pump installation                                                                   |No avoided-oil savings; oil present on both sides cancels.                                                    |
|A13|Zero-interest £1,200 loan, £100 monthly payment                                                        |12 payments; no interest or division-by-zero.                                                                 |
|A14|Synthetic monthly loan: £1,000 opening, 1% monthly rate, £100 payment, £500 overpayment in first period|£10 first-period interest; £410 closing principal; next-period interest £4.10; payment remains £100.          |
|A15|Requested final payment/overpayment exceeds debt                                                       |Applied amount capped, debt zero, excess flagged, no further interest.                                        |
|A16|£10,000 installation financed with £8,000 loan; £1,000 total interest                                  |Investment target £11,000; initial own-cash outlay £2,000 if funding coincides; principal never counted twice.|
|A17|Target £11,000; constant £100 monthly savings                                                          |Payback at month 110 on monthly reporting basis. Zero/negative savings returns no payback.                    |
|A18|Add a planned overpayment                                                                              |Loan term/interest and cash-flow change; energy savings do not.                                               |
|A19|Change future oil quote/scenario                                                                       |Future avoided oil changes; historic purchased prices and saved historical price assumptions do not.          |
|A20|Missing export intervals or missing rate agreement                                                     |Visible gap/provisional state; never silently use zero or an unrelated tariff.                                |
|A21|Bill override for an exact period                                                                      |Replaces relevant reconstructed charge once; excludes direct-debit/account-credit confusion.                  |
|A22|Solar/battery reference profile plus heating                                                           |Reference export credited once; no additional solar or battery savings added.                                 |
|A23|Invalid MPG, negative principal, weights not summing to 100%, unknown schema                           |Clear validation; no partial destructive save/import.                                                         |
|A24|Storage failure or failed schema migration                                                             |No false saved indicator; earlier usable data preserved or recovery offered.                                  |
|A25|GitHub Pages project subpath deployment                                                                |Assets/routes load on direct navigation and refresh; public build contains no private data.                   |
|A26|Negative import/export rates                                                                           |Signed arithmetic retained; no arbitrary clamp to zero.                                                       |
|A27|Reconciled bill compared to standard-hours reconstruction under Intelligent Go                         |Difference visible; unsupported extra cheap periods not claimed as handled.                                   |
|A28|Installation date or forecast cutoff changes                                                           |Dates respected, no actual/forecast overlap, no fictitious full first heating year.                           |

Test the pure engine first, then persistence migrations and a small number of end-to-end flows: setup with fixtures, refresh, scenario change, overpayment, backup/restore and deployed-path navigation. Test API adapters with paginated, overlapping, missing and corrected records. A successful test suite does not substitute for the live browser API feasibility gate.

11. Build-agent work plan

The owner intends to hand this specification to a coordinating agent and parallel build agents. This section describes future implementation; it does not authorise changes to live household accounts or hardware.

Milestone 0 — contracts and feasibility

Coordinator defines domain interfaces and acceptance fixtures. Integration owner runs the checks in section 5. Produce a short architecture decision note, explicit integration status and a working synthetic-data harness. Do not let several agents independently redefine money/date/interval conventions.

Milestone 1 — parallel workstreams after interfaces are agreed

|Owner                   |Deliverables                                                                              |Dependency                                              |
|------------------------|------------------------------------------------------------------------------------------|--------------------------------------------------------|
|Model agent             |Baselines, costs, projections, scenarios, payback and worked tests                        |Shared types and fixtures                               |
|Finance agent           |Loan schedules, balance anchors, overpayments, cash-flow integration and tests            |Shared money/date conventions                           |
|Data agent              |Octopus adapter, coverage/reconciliation, IndexedDB, schema migration and portable backups|Feasibility findings and shared types                   |
|UI agent                |Setup, dashboard, inputs, loan views, charts, data status and demo                        |Stable application interfaces; mocked adapters initially|
|Integration/review agent|End-to-end tests, privacy review, Pages workflow, documentation                           |Incremental integration of all workstreams              |

Coordinator owns shared interfaces and merges; assign non-overlapping files or isolated branches. Parallel agents may use normal development tooling, but the delivered owner workflow must never require a local server or terminal.

Milestone 2 — integrated demo

Finish a complete synthetic household journey, validate arithmetic and backup recovery, and deploy a preview/build artifact appropriate to repository permissions. A dashboard that only displays fixture numbers without the real model is not completion.

Milestone 3 — owner-ready release

Ship a reproducible production build, GitHub Actions Pages workflow, concise README with browser-only initial deployment steps, plain-language usage/backup notes, and an integration-status note. Show exactly which account-specific checks remain pending. Do not require a custom domain, paid plan or cloud database.

Use sensible defaults from this document. Ask the owner only when a material blocker changes the architecture, requires a new service/cost, or prevents the intended data integration. Missing household amounts/dates belong in setup. Do not silently turn approximations into measured facts to avoid asking.

12. Release definition of done

• All in-scope flows work with synthetic fixtures and the calculation examples pass.
• User inputs persist across browser restarts and survive supported migrations.
• Export/restore works independently of cached results and preserves manual corrections.
• Combined payback includes financing exactly once; individual loan payoff dates are distinct from investment payback.
• Estimated heating, counterfactual costs and incomplete data are visibly labelled.
• API integration status is truthful; real account checks are completed where credentials are available.
• Production assets work at a GitHub Pages repository subpath and contain no credentials, private bills or readings.
• No owner CLI/server requirement; no repeated JSON upload; no unapproved backend or paid dependency.
• README explains deployment, updates, browser storage/backup limitations and how to start with the owner’s real inputs.

13. Remaining setup values, not unresolved product decisions

Exact installation/occupancy dates; precise solar kWp; invoices/net prices paid; loan principals, start dates, rates/conventions, monthly payments, fees and overpayment dates/amounts; oil records and coverage; manual oil and petrol prices; annual mileage and MPG; heat-pump design electrical kWh; Octopus connection details and confirmed meter/tariff history; reference period selection; any bill reconciliation figures.

None should be guessed from approximate comments in the planning conversation. Prepopulate approximate metadata only with an explicit ‘needs confirmation’ marker. Calculations needing missing required values should show what is missing rather than fabricated payback.

14. Sources and verification notes

Official documentation checked on 14 October 2026. Documentation establishes available interfaces, not successful access to this household’s account.

• Octopus REST endpoint guide: account/meter/agreement discovery, consumption, products, regional rates, standing charges and historical availability. Browser CORS and exact Intelligent Go billed-cost treatment remain implementation checks.
• GitHub Pages overview: static hosting and public-repository availability on GitHub Free.
• IndexedDB: browser-side structured storage.
• Persistent storage request: persistence can be requested but is browser-dependent; explicit deletion still matters.
• DVSA MOT API authentication: credential requirements informed deferring this optional integration.
• Electron distribution and Electron automated testing: possible future desktop route, explicitly outside v1.

15. Suggested kickoff instruction for the coordinating agent

> Implement the app described in SPEC.md. Begin with its integration feasibility gate and agree shared domain contracts before delegating parallel work. Preserve the agreed v1 scope and calculation definitions. Use synthetic data in all public fixtures, keep personal inputs and API credentials out of the repository, and deliver a GitHub Pages app that needs no local server or repeated data upload. Treat missing household figures as setup fields. Work through the acceptance criteria, document any integration limitations honestly, and stop for owner input only if a material blocker requires a new architectural decision or external service. Do not build Electron or add deferred integrations.