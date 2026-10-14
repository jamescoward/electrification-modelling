import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';
import type { Project } from '../../src/domain/types';
import { projectModel } from '../../src/application/model';
import { emptyProject } from '../../src/domain/project';

test.beforeEach(({ page }) => {
  page.setDefaultTimeout(10000);
});

async function stored(page: Page, mode: Project['mode']): Promise<Project | null> {
  return page.evaluate(
    (mode) =>
      new Promise<Project | null>((resolve, reject) => {
        const opening = indexedDB.open('household-energy-payback-v1', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction('projects', 'readonly');
          const request = tx.objectStore('projects').get(mode);
          request.onsuccess = () => resolve(request.result ?? null);
          tx.oncomplete = () => db.close();
          tx.onerror = () => reject(tx.error);
        };
      }),
    mode,
  );
}
async function nav(page: Page, name: string) {
  if (name === 'My household' || name === 'Synthetic demo')
    await expect(page.locator('.topbar').getByRole('status')).toHaveText(
      /Saved on this browser|No household inputs entered|Local project cleared|Synthetic demo · ready/,
    );
  await page.getByRole('button', { name, exact: true }).click();
}
async function exported(page: Page, full = false): Promise<Project> {
  await nav(page, 'Data & backup');
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: full ? 'Export full backup' : 'Export inputs', exact: true })
    .click();
  const path = await (await download).path();
  if (!path) throw new Error('No downloaded backup');
  return JSON.parse(await readFile(path, 'utf8')) as Project;
}
async function chooseBackup(page: Page, value: unknown) {
  await page.getByLabel('Choose backup file').setInputFiles({
    name: 'synthetic-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
}
async function demo(page: Page) {
  await page.goto('./');
  await nav(page, 'Synthetic demo');
  await expect
    .poll(async () => Boolean((await stored(page, 'demo'))?.cache.intervals.length))
    .toBe(true);
}
const headline = (page: Page, name: string) =>
  page
    .locator('.metric')
    .filter({ has: page.locator('.metric-title').filter({ hasText: name }) })
    .locator('.metric-value');
const compactGBP = (value: number | null) =>
  value === null
    ? 'Needs inputs'
    : new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        maximumFractionDigits: 0,
      }).format(value);

test('saved household facts survive reload and synthetic demo is separate', async ({ page }) => {
  await page.goto('./');
  await nav(page, 'Inputs');
  await page.getByLabel('Occupancy / comparison start date', { exact: false }).fill('2025-07-12');
  await expect
    .poll(async () => (await stored(page, 'household'))?.occupancyDate)
    .toBe('2025-07-12');
  await nav(page, 'Synthetic demo');
  const synthetic = await exported(page, true);
  expect(synthetic.mode).toBe('demo');
  expect(synthetic.cache.intervals.length).toBeGreaterThan(0);
  await nav(page, 'My household');
  await nav(page, 'Inputs');
  await expect(page.getByLabel('Occupancy / comparison start date', { exact: false })).toHaveValue(
    '2025-07-12',
  );
  await page.reload();
  await expect(page.getByLabel('Occupancy / comparison start date', { exact: false })).toHaveValue(
    '2025-07-12',
  );
  expect((await stored(page, 'household'))?.cache.intervals).toEqual([]);
});

test('household facts survive closing and reopening a persistent browser profile', async ({
  baseURL,
}, testInfo) => {
  const profile = await mkdtemp(join(tmpdir(), 'home-current-browser-'));
  const options = { ...testInfo.project.use.launchOptions, headless: true, baseURL };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    let page = await context.newPage();
    await page.goto('./#inputs');
    await page.getByLabel('Household name', { exact: true }).fill('Persistent synthetic household');
    await expect
      .poll(async () => (await stored(page, 'household'))?.name)
      .toBe('Persistent synthetic household');
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = await context.newPage();
    await page.goto('./#inputs');
    await expect(page.getByLabel('Household name', { exact: true })).toHaveValue(
      'Persistent synthetic household',
    );
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('future oil sensitivity changes forecasts while historic facts stay fixed', async ({
  page,
}) => {
  await demo(page);
  const before = (await stored(page, 'demo'))!;
  const base = projectModel(before);
  await nav(page, 'Overview');
  await expect(headline(page, 'Next-year savings')).toHaveText(compactGBP(base.nextYearSavings));
  await nav(page, 'High');
  await expect.poll(async () => (await stored(page, 'demo'))?.forecast.oilScenario).toBe('high');
  const after = (await stored(page, 'demo'))!;
  const changed = projectModel(after);
  expect(after.oil).toEqual(before.oil);
  expect(after.cache).toEqual(before.cache);
  expect(changed.historicalSavings).toBe(base.historicalSavings);
  expect(changed.nextYearSavings!).toBeGreaterThan(base.nextYearSavings!);
  await expect(headline(page, 'Next-year savings')).toHaveText(compactGBP(changed.nextYearSavings));
  await expect(headline(page, 'Historical energy savings')).toHaveText(
    compactGBP(base.historicalSavings),
  );
  await page.reload();
  expect((await stored(page, 'demo'))?.forecast.oilScenario).toBe('high');
});

test('planned overpayment changes loan interest and cash flow but never energy savings', async ({
  page,
}) => {
  await demo(page);
  const before = (await stored(page, 'demo'))!;
  const base = projectModel(before);
  await nav(page, 'Loans');
  await page.getByRole('button', { name: 'Add overpayment', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Date', { exact: true }).fill('2026-11-15');
  await dialog.getByLabel('Amount (£)', { exact: true }).fill('1000');
  await dialog.getByRole('combobox', { name: /^Status/ }).selectOption('planned');
  await dialog.getByRole('button', { name: 'Save overpayment', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () =>
      (await stored(page, 'demo'))?.loans
        .flatMap((l) => l.overpayments)
        .some((o) => o.date === '2026-11-15' && o.amount === 1000 && o.kind === 'planned'),
    )
    .toBe(true);
  const changed = projectModel((await stored(page, 'demo'))!);
  expect(changed.historicalSavings).toBe(base.historicalSavings);
  expect(changed.nextYearSavings).toBe(base.nextYearSavings);
  expect(changed.loans[0].schedule.totalInterest).toBeLessThan(
    base.loans[0].schedule.totalInterest,
  );
  expect(changed.loans[0].schedule.payoffDate! < base.loans[0].schedule.payoffDate!).toBe(true);
  expect(changed.months.map((m) => m.cashFlow)).not.toEqual(base.months.map((m) => m.cashFlow));
  await expect(page.getByRole('cell', { name: '2026-11-15', exact: true })).toBeVisible();
});

test('full and input-only backups require confirmation and exclude credentials', async ({
  page,
}) => {
  await demo(page);
  await nav(page, 'Data & backup');
  await page.getByLabel('Octopus API key', { exact: false }).fill('synthetic-secret-do-not-export');
  await page.getByLabel('Octopus account number', { exact: true }).fill('A-SYNTHETIC');
  await page.getByRole('button', { name: 'Save connection credentials', exact: true }).click();
  const full = await exported(page, true);
  const inputs = await exported(page);
  expect(inputs.cache.intervals).toEqual([]);
  expect(full.cache.intervals.length).toBeGreaterThan(0);
  expect(JSON.stringify(full)).not.toMatch(/apiKey|accessToken|synthetic-secret/);
  await nav(page, 'My household');
  await nav(page, 'Inputs');
  await page.getByLabel('Household name', { exact: true }).fill('Synthetic household to clear');
  await expect
    .poll(async () => (await stored(page, 'household'))?.name)
    .toBe('Synthetic household to clear');
  await nav(page, 'Data & backup');
  await page.getByRole('button', { name: 'Clear household data…', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm clear data', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await stored(page, 'household')).toBeNull();
  expect((await stored(page, 'demo'))?.cache.intervals.length).toBeGreaterThan(0);
  const original = await stored(page, 'household');
  const restored = {
    ...full,
    mode: 'household',
    id: 'household',
    name: 'Restored synthetic fixture',
  };
  await chooseBackup(page, restored);
  expect(await stored(page, 'household')).toEqual(original);
  await page.getByRole('button', { name: 'Confirm replace', exact: true }).click();
  await expect
    .poll(async () => (await stored(page, 'household'))?.name)
    .toBe('Restored synthetic fixture');
  const saved = (await stored(page, 'household'))!;
  expect(saved.cache).toEqual(full.cache);
  expect(projectModel(saved).nextYearSavings).toBe(projectModel(full).nextYearSavings);
  await nav(page, 'Data & backup');
  await chooseBackup(page, {
    ...inputs,
    mode: 'household',
    id: 'household',
    name: 'Inputs restored',
  });
  await page.getByRole('button', { name: 'Confirm replace', exact: true }).click();
  await expect.poll(async () => (await stored(page, 'household'))?.name).toBe('Inputs restored');
  const inputSaved = (await stored(page, 'household'))!;
  expect(inputSaved.installations).toEqual(full.installations);
  expect(inputSaved.loans).toEqual(full.loans);
  expect(inputSaved.forecast).toEqual(full.forecast);
  expect(inputSaved.cache.intervals).toEqual([]);
});

test('unknown schema backup leaves saved data untouched', async ({ page }) => {
  await demo(page);
  const before = (await stored(page, 'demo'))!;
  await nav(page, 'Data & backup');
  await chooseBackup(page, { ...before, schemaVersion: 999 });
  await expect(page.getByRole('alert')).toContainText(/schema|unsupported/i);
  await expect(page.getByRole('button', { name: 'Confirm replace', exact: true })).toHaveCount(0);
  expect(await stored(page, 'demo')).toEqual(before);
});

test('production assets and direct hash routes survive project-subpath refresh', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith('http://127.0.0.1:4173'))
      failures.push(response.url());
  });
  await page.goto('./#data');
  await expect(page.getByRole('button', { name: 'Export inputs', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Export inputs', exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/electrification-modelling/');
  expect(failures).toEqual([]);
});

test('two tabs cannot silently overwrite the newer saved household', async ({ page, context }) => {
  await page.goto('./#inputs');
  const second = await context.newPage();
  await second.goto('./#inputs');
  await expect(second.getByLabel('Household name', { exact: true })).toBeVisible();
  await page.getByLabel('Household name', { exact: true }).fill('First tab saved');
  await expect.poll(async () => (await stored(page, 'household'))?.name).toBe('First tab saved');
  await second.getByLabel('Household name', { exact: true }).fill('Stale tab attempted overwrite');
  await expect(second.getByRole('alert')).toContainText(/another tab|newer|reload/i);
  expect((await stored(page, 'household'))?.name).toBe('First tab saved');
  await second.reload();
  await expect(second.getByLabel('Household name', { exact: true })).toHaveValue('First tab saved');
});

test('invalid MPG is explained and leaves the last good household data intact', async ({
  page,
}) => {
  await demo(page);
  const before = (await stored(page, 'demo'))!;
  await nav(page, 'Inputs');
  await nav(page, 'Cars');
  await page.getByLabel('Petrol efficiency (UK MPG)', { exact: false }).fill('0');
  await expect(page.getByRole('alert')).toContainText(/MPG|positive|greater than/i);
  expect((await stored(page, 'demo'))?.cars).toEqual(before.cars);
  await page.reload();
  await nav(page, 'Cars');
  await expect(page.getByLabel('Petrol efficiency (UK MPG)', { exact: false })).toHaveValue(
    String(before.cars.mpg),
  );
});

test('fixture discovery and resumable refetch preserve restored manual facts', async ({ page }) => {
  let failSecondPage = true;
  let corrected = false;
  const agreement = {
    tariff_code: 'E-1R-SYNTHETIC-26-01-01-A',
    valid_from: '2026-10-01T00:00:00Z',
    valid_to: null,
  };
  const first = {
    interval_start: '2026-10-01T00:00:00Z',
    interval_end: '2026-10-01T00:30:00Z',
    consumption: 1,
  };
  await page.route('https://api.octopus.energy/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const cors = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
      'Access-Control-Allow-Headers': 'authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify(body),
      });
    if (url.pathname.includes('/accounts/')) {
      expect(route.request().headers().authorization).toMatch(/^Basic /);
      return json({
        properties: [
          {
            electricity_meter_points: [
              {
                mpan: 'SYNTHETIC-IMPORT',
                is_export: false,
                meters: [{ serial_number: 'IMPORT' }],
                agreements: [agreement],
              },
              {
                mpan: 'SYNTHETIC-EXPORT',
                is_export: true,
                meters: [{ serial_number: 'EXPORT' }],
                agreements: [agreement],
              },
            ],
          },
        ],
      });
    }
    if (url.pathname.includes('/consumption/')) {
      if (url.pathname.includes('SYNTHETIC-EXPORT'))
        return json({ results: [{ ...first, consumption: 0 }], next: null });
      if (url.searchParams.has('page')) {
        if (failSecondPage)
          return route.fulfill({ status: 429, body: '', headers: { ...cors, 'Retry-After': '1' } });
        return json({
          results: [
            {
              interval_start: first.interval_end,
              interval_end: '2026-10-01T01:00:00Z',
              consumption: 2,
            },
          ],
          next: null,
        });
      }
      return json({
        results: [{ ...first, consumption: corrected ? 3 : 1 }],
        next: `https://api.octopus.energy${url.pathname}?page=2`,
      });
    }
    return json({
      results: [
        {
          valid_from: '2026-10-01T00:00:00Z',
          valid_to: null,
          value_inc_vat: url.pathname.includes('standing-charges') ? 60 : 10,
        },
      ],
      next: null,
    });
  });
  await page.goto('./#data');
  const input = emptyProject();
  input.name = 'Restored synthetic manual facts';
  input.occupancyDate = '2026-10-01';
  input.cars = { annualMiles: 10000, mpg: 40, petrolPence: 150, priceDate: '2026-10-01' };
  await chooseBackup(page, input);
  await page.getByRole('button', { name: 'Confirm replace', exact: true }).click();
  await expect.poll(async () => (await stored(page, 'household'))?.name).toBe(input.name);
  await page.getByLabel('Octopus account number', { exact: true }).fill('A-SYNTHETIC');
  await page.getByLabel('Octopus API key', { exact: false }).fill('synthetic-secret-do-not-export');
  await page.getByRole('button', { name: 'Save connection credentials', exact: true }).click();
  await page.getByRole('button', { name: 'Discover meters & tariffs', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Review discovered meters & agreements', exact: true }),
  ).toBeVisible();
  expect((await stored(page, 'household'))?.connection.meters).toEqual([]);
  await page
    .getByRole('button', { name: 'Confirm selected meters & agreements', exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page, 'household'))?.connection.meters.length)
    .toBe(2);
  await page.getByRole('button', { name: 'Refresh Octopus data', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/rate limit/i);
  const partial = (await stored(page, 'household'))!;
  expect(partial.cache.refreshStatus).toBe('incomplete');
  expect(partial.cache.intervals).toHaveLength(1);
  expect(partial.cars).toEqual(input.cars);
  failSecondPage = false;
  corrected = true;
  await page.getByRole('button', { name: 'Refresh Octopus data', exact: true }).click();
  await expect
    .poll(async () => (await stored(page, 'household'))?.cache.refreshStatus)
    .toBe('complete');
  const refreshed = (await stored(page, 'household'))!;
  expect(refreshed.cache.intervals).toHaveLength(3);
  expect(
    refreshed.cache.intervals.find(
      (row) => row.meter === 'IMPORT' && row.start === first.interval_start,
    )?.kWh,
  ).toBe(3);
  expect(refreshed.cars).toEqual(input.cars);
  expect(refreshed.name).toBe(input.name);
  await page.getByRole('button', { name: 'Refresh Octopus data', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Refresh Octopus data', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText(
      'Refresh completed. Saved manual facts and model assumptions have been preserved.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect
    .poll(async () => (await stored(page, 'household'))?.cache.refreshStatus)
    .toBe('complete');
  expect((await stored(page, 'household'))?.cache.intervals).toEqual(refreshed.cache.intervals);
});

test('denied browser storage surfaces a failure without claiming edits were saved', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(indexedDB, 'open', {
      value: () => {
        throw new DOMException('Synthetic storage access denied', 'SecurityError');
      },
    });
  });
  await page.goto('./#inputs');
  await expect(page.getByRole('alert')).toContainText(/storage access denied/i);
  await expect(page.locator('.topbar').getByRole('status')).toHaveText(
    'Saved data could not be opened',
  );
  await page.getByLabel('Household name', { exact: true }).fill('Unsaved synthetic edit');
  await expect(page.locator('.topbar').getByRole('status')).not.toHaveText('Saved on this browser');
  await expect(
    page.getByRole('button', { name: 'Reload saved inputs', exact: true }),
  ).toBeVisible();
});

test('a corrupt saved schema can recover the valid pre-import snapshot', async ({ page }) => {
  await page.goto('./#inputs');
  await page
    .getByLabel('Household name', { exact: true })
    .fill('Original recoverable synthetic household');
  await expect
    .poll(async () => (await stored(page, 'household'))?.name)
    .toBe('Original recoverable synthetic household');
  const original = (await stored(page, 'household'))!;
  await nav(page, 'Data & backup');
  await chooseBackup(page, { ...original, name: 'Replacement synthetic household' });
  await page.getByRole('button', { name: 'Confirm replace', exact: true }).click();
  await expect
    .poll(async () => (await stored(page, 'household'))?.name)
    .toBe('Replacement synthetic household');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('household-energy-payback-v1', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction('projects', 'readwrite');
          const store = tx.objectStore('projects');
          const request = store.get('household');
          request.onsuccess = () => store.put({ ...request.result, schemaVersion: 999 });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(/validation|schema|recovery/i);
  await page.getByText('Local snapshots (1)', { exact: true }).click();
  await page.getByRole('button', { name: 'Recover snapshot', exact: true }).click();
  await expect.poll(async () => (await stored(page, 'household'))?.name).toBe(original.name);
  expect((await stored(page, 'household'))?.schemaVersion).toBe(1);
  await expect(page.locator('.topbar').getByRole('status')).toHaveText('Saved on this browser');
  await nav(page, 'Inputs');
  await expect(page.getByLabel('Household name', { exact: true })).toHaveValue(original.name);
  await nav(page, 'Data & backup');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('household-energy-payback-v1', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction('projects', 'readwrite');
          const store = tx.objectStore('projects');
          const request = store.get('household');
          request.onsuccess = () => store.put({ ...request.result, schemaVersion: 999 });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(/validation|schema|recovery/i);
  await chooseBackup(page, { ...original, name: 'Portable recovery synthetic household' });
  await page.getByRole('button', { name: 'Confirm replace', exact: true }).click();
  await expect
    .poll(async () => (await stored(page, 'household'))?.name)
    .toBe('Portable recovery synthetic household');
  expect((await stored(page, 'household'))?.schemaVersion).toBe(1);
  await expect(page.locator('.topbar').getByRole('status')).toHaveText('Saved on this browser');
});
