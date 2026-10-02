const { expect } = require('@playwright/test');
async function openNavigation(page) {
    const toggle = page.locator('#mobile-nav-toggle');
    if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') {
        await toggle.click();
        await expect(page.locator('#mobile-nav-drawer')).toBeVisible();
    }
}
async function switchTab(page, name) {
    await openNavigation(page);
    await page.getByRole('tab', { name, exact: true }).click();
}
async function selectDropdown(page, id, value) {
    const label = await page
        .locator(`#${id}`)
        .evaluate(
            (select, value) =>
                Array.from(select.options).find((option) => option.value === value)?.textContent,
            value,
        );
    await page.locator(`#${id}-trigger`).click();
    const option = page.locator(`#${id}-options`).getByRole('option', { name: label, exact: true });
    if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await option.tap();
    else await option.click();
}
module.exports = { openNavigation, switchTab, selectDropdown };
