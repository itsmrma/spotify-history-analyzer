/* Apply the saved/system theme before styles paint; persist display preference only. */
(() => {
    'use strict';
    const key = 'music-history-theme';
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    let preference = null;
    let palette = null;
    try {
        const saved = localStorage.getItem(key);
        if (saved === 'light' || saved === 'dark') preference = saved;
    } catch (_) {
        // Theme switching still works when browser storage is unavailable.
    }

    function colors() {
        if (!palette) {
            const style = getComputedStyle(document.documentElement);
            palette = Object.fromEntries(
                [
                    'primary',
                    'mint',
                    'muted',
                    'text',
                    'line',
                    'chart-fill',
                    'tooltip-bg',
                    'tooltip-text',
                ].map((name) => [name, style.getPropertyValue(`--${name}`).trim()]),
            );
        }
        return palette;
    }

    function apply() {
        const theme = preference || (system.matches ? 'dark' : 'light');
        document.documentElement.dataset.theme = theme;
        document.querySelector('meta[name="theme-color"]').content =
            theme === 'dark' ? '#141218' : '#fdf7ff';
        palette = null;
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            toggle.setAttribute('aria-pressed', String(theme === 'dark'));
            toggle.title = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
            toggle.querySelector('.icon').textContent =
                theme === 'dark' ? 'dark_mode' : 'light_mode';
            toggle.querySelector('.theme-label').textContent = theme === 'dark' ? 'Dark' : 'Light';
        }
        // Update existing canvases in place, preserving filters, selection and focus.
        if (window.Chart)
            for (const chart of Object.values(window.Chart.instances)) chart.update('none');
    }

    window.AppTheme = { colors };
    apply();
    system.addEventListener('change', () => {
        if (!preference) apply();
    });
    window.addEventListener('storage', (event) => {
        if (event.key !== key && event.key !== null) return;
        preference = ['dark', 'light'].includes(event.newValue) ? event.newValue : null;
        apply();
    });
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('theme-toggle').addEventListener('click', () => {
            preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            try {
                localStorage.setItem(key, preference);
            } catch (_) {
                // Keep the selected theme for this page session.
            }
            apply();
        });
        apply();
    });
})();
