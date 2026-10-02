const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: 'list',
    use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
    projects: [
        {
            name: 'desktop',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
        },
        { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
        { name: 'mobile-webkit', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
    ],
    webServer: {
        command: 'node scripts/serve.cjs',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
    },
});
