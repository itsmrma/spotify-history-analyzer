/* Reuse the same tabs in an animated mobile navigation drawer. */
window.MobileNavigation = (() => {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const mobile = window.matchMedia('(max-width: 767px)');
    const drawer = $('mobile-nav-drawer');
    const toggle = $('mobile-nav-toggle');
    const tabs = $('tabs-nav');
    const shell = document.querySelector('.app-shell');
    let open = false;

    function close(restoreFocus = true) {
        if (!open) return;
        open = false;
        shell.inert = false;
        if (restoreFocus) toggle.focus();
        drawer.inert = true;
        drawer.setAttribute('aria-hidden', 'true');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('nav-open');
    }
    function show() {
        if (!mobile.matches || open) return;
        open = true;
        drawer.inert = false;
        drawer.setAttribute('aria-hidden', 'false');
        toggle.setAttribute('aria-expanded', 'true');
        document.body.classList.add('nav-open');
        shell.inert = true;
        // Focus the control inside the drawer without scrolling the page.
        requestAnimationFrame(() => {
            if (open) $('mobile-nav-close').focus({ preventScroll: true });
        });
    }
    function updateSelected() {
        const selected = tabs.querySelector('[aria-selected="true"]');
        $('mobile-current-tab').textContent = Array.from(selected.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent.trim())
            .join(' ')
            .trim();
    }
    function layout() {
        const focusedNavigation =
            open ||
            tabs.contains(document.activeElement) ||
            drawer.contains(document.activeElement) ||
            document.activeElement === toggle;
        close(false);
        (mobile.matches ? $('mobile-nav-host') : $('desktop-nav-host')).append(tabs);
        tabs.setAttribute('aria-orientation', mobile.matches ? 'vertical' : 'horizontal');
        if (focusedNavigation) {
            requestAnimationFrame(() => {
                if (mobile.matches) toggle.focus();
                else tabs.querySelector('[aria-selected="true"]').focus();
            });
        }
    }
    toggle.addEventListener('click', show);
    $('mobile-nav-close').addEventListener('click', () => close());
    $('mobile-nav-backdrop').addEventListener('click', () => close());
    document.addEventListener('keydown', (event) => {
        if (open && event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    });
    drawer.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(drawer.querySelectorAll('button')).filter(
            (button) => button.tabIndex >= 0,
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    mobile.addEventListener('change', layout);
    layout();
    updateSelected();
    return { close, updateSelected };
})();
