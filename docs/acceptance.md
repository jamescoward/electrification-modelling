# Acceptance evidence

All committed fixtures are synthetic. Automated checks establish the behaviour of the model and local application; they do not establish this household's account access, tariff availability, Intelligent Go extra-slot treatment, or a successful live Pages deployment. See [integration status](integration.md) for those gates.

Local validation on 14 October 2026: **76 model/adapter tests in 9 files passed; all 12 production Chromium workflows passed in 1.3 minutes; production build passed.** The browser refresh test supplies fixture responses and CORS headers, rather than testing a live account.

| Specification criteria | Evidence |
| --- | --- |
| A01: saved inputs survive reopening | IndexedDB adapter tests close/reopen the database; browser workflows edit and reload, then close/relaunch Chromium using the same persistent profile. Browser profile deletion is outside this guarantee. |
| A02: portable recovery, credentials absent | Backup schema tests round-trip full/input exports; browser workflow previews, confirms full restore and compares rebuilt results, then restores inputs without cached readings. |
| A03: inputs survive refetch | Source refresh tests and schema separation cover preserved manual inputs; real-account source changes remain an in-app integration check. |
| A04–A05: duplicate/corrected pages and incomplete refresh | Pure interval tests and mocked Octopus adapter refresh tests. No claim of live-account validation. |
| A06–A08: electricity £2.50, heating £6/day, DST/leap years | Worked pure-energy tests conserve source intervals and seasonal energy, count local standing-charge dates and retain effective heating prices. |
| A09–A12: whole-house charging/heating, UK MPG, tank stock, transition dates | Energy and integrated-model tests. Historic costs include measured household electricity once; avoided fuels start at their installation dates. |
| A13–A17: loans, caps, interest, payback | Finance tests cover zero-interest loans, £410/£4.10 example, excessive payments, £11,000 target and month-110 recovery. |
| A18–A19: overpayment and future oil scenarios | Model tests plus browser workflows preserve energy savings under an overpayment and historical facts under a future scenario change. |
| A20–A22: missing sources, exact bill overrides, forecast exports | Energy and model tests distinguish absent readings/rates from zero, replace bill components once, and credit reference exports once. |
| A23: invalid inputs/schema | Strict schema tests reject invalid MPG, principal, weights, unknown fields and unknown versions. Browser invalid-schema restore leaves saved data unchanged. |
| A24: storage/migration failure | Repository tests preserve original data after failed writes/invalid replacement and reject stale writers. Browser tests inject denied IndexedDB access without a saved claim and corrupt an existing schema, then recover through a local snapshot and a portable backup. Quota errors follow the same adapter error path. Schema 1 is the first supported version; no historical-version migration is claimed. |
| A25: Pages subpath | Browser tests build production assets at `/electrification-modelling/` and navigate/reload a hash route. Actual hosted-origin checking follows a successful Pages deployment. |
| A26–A28: signed rates, reconciliation and cutoff | Energy tests retain negative rates and reveal bill differences; model tests reject mixed heating reference periods and separate historic/forecast dates. Extra Intelligent Go slots remain unsupported without verified data. |

The focused browser journeys are in [household.spec.ts](../tests/browser/household.spec.ts). They inspect saved inputs as well as interacting with the rendered app, so a screen of fixed fixture numbers cannot satisfy them. The mocked browser refresh deliberately supplies CORS headers; it is not evidence of real Octopus CORS. Each test receives fresh browser storage (the restart test uses a temporary profile that is removed afterward); the demo and household are separate project keys.

Run `npm test` for model/adapter coverage and `npm run test:e2e` for the production-browser workflows (or `CI=1 npm run test:e2e` with Playwright-managed Chromium). The Pages workflow runs both before uploading its build. Test results are generated locally/within Actions, not embedded as permanent claims of a live release.

Owner-account acceptance still requires discovering and confirming real import/export meters and agreement history, fetching their historical rates, checking authenticated browser requests at the deployed origin, and comparing reconstructed charges with actual bills. Direct-debit payments and account balances are not bill costs. An unsupported browser integration must remain visible and must not quietly introduce an application backend.
