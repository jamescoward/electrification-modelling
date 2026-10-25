# Electrification payback

A single-page calculator for rough simple-payback estimates of household solar, battery and EVs, a heat pump replacing oil heating, and the two combined. All figures are GBP annual totals.

```
Solar/EV saving per year  = petrol avoided + old electricity bill − current net electricity bill
Heat-pump saving per year = oil avoided − heat-pump electricity cost
Payback (years)           = (installation cost + total loan interest) ÷ saving per year
```

Heat-pump and combined paybacks are shown for low/central/high oil prices (80%/100%/120% of the entered price). Price changes, maintenance, equipment replacement and discounting are ignored. Inputs are saved in the browser's local storage only; nothing is sent anywhere.

## Inputs

| Input                                                                 | Where to find it                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------- |
| Oil used per year (litres) and price (p/litre)                        | Delivery receipts; current quote incl. VAT and delivery   |
| Miles per year, petrol UK MPG, petrol price (p/litre)                 | Estimates                                                 |
| Electricity bill per year before solar/EV (£)                         | Old bills scaled to a year                                |
| Net electricity bill per year with solar/EV, before the heat pump (£) | Last 12 months of statements: imports minus export income |
| Heat-pump electricity per year (kWh) and average price (p/kWh)        | Installer design estimate; blend of cheap and day rates   |
| Installation costs after grants and total loan interest (£)           | Invoices; lender statement or credit agreement            |

## Publish with GitHub Pages

In the repository, open **Settings → Pages** and choose **GitHub Actions** as the source. Each push to `main` runs the tests, builds and deploys to `https://jamescoward.github.io/electrification-modelling/`.

## Development

Requires Node.js 24.

```sh
npm ci
npm test
npm run dev
```
