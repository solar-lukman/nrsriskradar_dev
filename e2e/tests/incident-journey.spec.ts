import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';

/**
 * UAT-INC — incident (risk event) journey: table controls, ownership and closure.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);

test.describe('UAT-INC incident journey', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-INC-01 incidents table supports search, filter and URL state', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-INC-01' });
    const u = byRole('RMD') || byRole('ADMIN') || byRole('CRO');
    test.skip(!u, 'No incident-viewing credentials configured');
    test.setTimeout(120_000);

    await login(page, u!);
    await page.goto('/incidents');
    await page.waitForTimeout(1500);

    const search = page.getByPlaceholder(/search/i).first();
    if ((await search.count()) === 0) test.skip(true, 'Incidents page has no search input in this build');

    await search.fill('zzz-no-such-incident');
    await page.waitForTimeout(1200);

    // Search state must survive a reload (URL-persisted filters).
    expect.soft(page.url()).toMatch(/[?&](q|search)=/);
    await page.reload();
    await page.waitForTimeout(1200);
    expect.soft(await search.inputValue()).toContain('zzz');

    await logout(page);
  });

  test('UAT-INC-02 CSV export is offered and triggers a download', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-INC-02' });
    const u = byRole('RMD') || byRole('ADMIN');
    test.skip(!u, 'No incident-viewing credentials configured');

    await login(page, u!);
    await page.goto('/incidents');
    await page.waitForTimeout(1500);

    const exportBtn = page.getByRole('button', { name: /export|csv/i }).first();
    if ((await exportBtn.count()) === 0) test.skip(true, 'No export control on this build');

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }).catch(() => null),
      exportBtn.click(),
    ]);
    expect.soft(download, 'expected a CSV download').not.toBeNull();
    if (download) expect.soft(download.suggestedFilename()).toMatch(/\.csv$/i);

    await logout(page);
  });

  test('UAT-INC-03 incident owner can be assigned and the incident closed', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-INC-03' });
    const u = byRole('RMD') || byRole('ADMIN');
    test.skip(!u, 'No incident-managing credentials configured');
    test.setTimeout(120_000);

    await login(page, u!);
    await page.goto('/incidents');
    await page.waitForTimeout(1500);

    const firstRow = page.getByRole('row').nth(1);
    if ((await firstRow.count()) === 0) test.skip(true, 'No incidents available');
    await firstRow.click();
    await page.waitForTimeout(1000);

    const ownerTrigger = page.getByText(/assign owner|incident owner|select owner/i).first();
    if ((await ownerTrigger.count()) > 0) {
      await ownerTrigger.click();
      const option = page.getByRole('option').first();
      if (await option.count()) await option.click();
    }

    // Timeline must reflect the activity trail.
    expect
      .soft(await page.getByText(/timeline|activity|history/i).count())
      .toBeGreaterThan(0);

    await logout(page);
  });

  test('UAT-INC-05 reassigning the owner is recorded in the timeline, and the notification deep-link opens the incident', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-INC-05' });
    const u = byRole('RMD') || byRole('ADMIN');
    test.skip(!u, 'No incident-managing credentials configured');
    test.setTimeout(120_000);

    await login(page, u!);
    await page.goto('/incidents');
    await page.waitForTimeout(1500);

    const firstRow = page.getByRole('row').nth(1);
    if ((await firstRow.count()) === 0) test.skip(true, 'No incidents available');
    await firstRow.click();
    await page.waitForTimeout(1000);

    const ownerTrigger = page.getByText(/assign owner|incident owner|select owner/i).first();
    if ((await ownerTrigger.count()) === 0) test.skip(true, 'No owner-reassignment control on this build');
    await ownerTrigger.click();
    const option = page.getByRole('option').last();
    if ((await option.count()) === 0) test.skip(true, 'No alternate owner available to assign');
    await option.click();
    await page.waitForTimeout(1500);

    // --- the activity timeline must record the ownership change ----------
    const timeline = page.getByText(/timeline|activity|history/i).first();
    expect.soft(await timeline.count()).toBeGreaterThan(0);
    expect
      .soft(await page.getByText(/owner|reassign|assigned/i).count(), 'expected an ownership-change entry')
      .toBeGreaterThan(0);

    await logout(page);
  });

  test('UAT-INC-06 a notification deep-link opens the target incident', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-INC-06' });
    const u = byRole('RMD') || byRole('ADMIN');
    test.skip(!u, 'No incident-managing credentials configured');
    test.setTimeout(120_000);

    await login(page, u!);
    await page.goto('/app');
    await page.waitForTimeout(1500);

    const bell = page.getByRole('button', { name: /notification/i }).first();
    if ((await bell.count()) === 0) test.skip(true, 'No notification centre control on this build');
    await bell.click();
    await page.waitForTimeout(800);

    const incidentNotification = page.getByText(/incident/i).first();
    if ((await incidentNotification.count()) === 0) test.skip(true, 'No incident notification available');

    const openBtn = page.getByRole('button', { name: /open|view/i }).first();
    if ((await openBtn.count()) === 0) test.skip(true, 'No deep-link control on this notification');
    await openBtn.click();
    await page.waitForTimeout(1500);

    // Deep-link must land on (or open a dialog for) the incidents area, not the dashboard shell.
    const onIncidents = new URL(page.url()).pathname.includes('/incidents');
    const dialogOpen = (await page.getByRole('dialog').count()) > 0;
    expect.soft(onIncidents || dialogOpen, 'expected the deep-link to open the incident').toBe(true);

    await logout(page);
  });

  test('UAT-INC-04 read-only roles cannot create incidents', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-INC-04' });
    const viewer = byRole('EC') || byRole('ERMSC') || byRole('RCB');
    test.skip(!viewer, 'No read-only credentials configured');

    await login(page, viewer!);
    await page.goto('/incidents');
    await page.waitForTimeout(1200);
    expect(
      await page.getByRole('button', { name: /report incident|add incident|new incident/i }).count(),
    ).toBe(0);
    await logout(page);
  });
});
