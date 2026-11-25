import { expect, test, uniqueName } from './fixtures';

test('creating a land record with a map pin and survey traverse saves the boundary', async ({
  page,
}) => {
  const name = uniqueName('Ewuru Plot');

  await page.goto('/lands/new');
  await page.getByLabel('Name (required)').fill(name);
  await page.getByLabel('Address').fill('14 Jacaranda Close');

  // Place a location pin on the map using the toolbar action.
  const placePin = page.getByRole('button', { name: 'Place Pin at Map Centre' });
  await placePin.scrollIntoViewIfNeeded();
  await expect(placePin).toBeVisible();
  await placePin.click();
  await expect(page.getByRole('button', { name: 'Remove Pin' })).toBeVisible();

  // Switch to the Boundary tab and enter a closed 4-leg survey traverse.
  await page.getByRole('tab', { name: 'Boundary', exact: true }).click();
  await page.getByRole('button', { name: 'Bearings and Distances' }).click();

  await page.getByLabel('First Beacon (Northing)').fill('720000');
  await page.getByLabel('First Beacon (Easting)').fill('540000');

  const legs = [
    { deg: '0', dist: '50' },
    { deg: '90', dist: '40' },
    { deg: '180', dist: '50' },
    { deg: '270', dist: '40' },
  ];
  for (let i = 0; i < legs.length; i += 1) {
    await page.getByLabel(`Leg ${i + 1} bearing degrees`).fill(legs[i].deg);
    await page.getByLabel(`Leg ${i + 1} bearing minutes`).fill('0');
    await page.getByLabel(`Leg ${i + 1} distance in metres`).fill(legs[i].dist);
  }

  await expect(page.getByText(/Closes/i)).toBeVisible();
  await expect(page.getByText(/sqm calculated from the traverse/i)).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/lands\/[^/]+$/);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Boundary', exact: true })).toBeVisible();
});
