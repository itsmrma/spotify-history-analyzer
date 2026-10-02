/* Material listboxes; native selects remain hidden data controls for the app. */
(() => {
    'use strict';
    let opened = null;
    for (const select of document.querySelectorAll('select')) {
        const wrapper = document.createElement('span');
        wrapper.className = 'material-select';
        const trigger = document.createElement('button');
        trigger.id = `${select.id}-trigger`;
        trigger.type = 'button';
        trigger.className = 'history-type-trigger material-select-trigger';
        trigger.setAttribute('role', 'combobox');
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        const value = document.createElement('span');
        value.id = `${select.id}-value`;
        const icon = document.createElement('span');
        icon.className = 'material-icons-outlined icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'arrow_drop_down';
        trigger.append(value, icon);
        const menu = document.createElement('div');
        menu.id = `${select.id}-options`;
        menu.className = 'history-type-menu material-select-menu hidden';
        menu.setAttribute('role', 'listbox');
        const labels = Array.from(select.labels);
        const labelText =
            select.getAttribute('aria-label') ||
            labels[0]?.textContent.trim().split('\n')[0] ||
            'Select';
        menu.setAttribute('aria-label', labelText);
        trigger.setAttribute('aria-controls', menu.id);
        for (const [index, label] of labels.entries()) {
            if (!label.id) label.id = `${select.id}-label-${index}`;
            if (label.htmlFor) label.htmlFor = trigger.id;
        }
        if (labels[0]?.htmlFor)
            trigger.setAttribute('aria-labelledby', `${labels[0].id} ${value.id}`);
        select.before(wrapper);
        wrapper.append(trigger, select);
        document.body.append(menu);
        select.hidden = true;
        select.setAttribute('aria-hidden', 'true');
        select.tabIndex = -1;
        let active = 0;
        let options = [];
        let typed = '';
        let typingTimer;

        function close() {
            menu.classList.add('hidden');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.removeAttribute('aria-activedescendant');
            if (opened === close) opened = null;
        }
        function sync() {
            trigger.disabled = select.disabled || !select.options.length;
            value.textContent = select.selectedOptions[0]?.textContent || 'No years available';
            if (!trigger.hasAttribute('aria-labelledby'))
                trigger.setAttribute('aria-label', `${labelText}: ${value.textContent}`);
            options = Array.from(select.options);
            menu.replaceChildren(
                ...options.map((option, index) => {
                    const item = document.createElement('div');
                    item.id = `${select.id}-option-${index}`;
                    item.setAttribute('role', 'option');
                    item.setAttribute('aria-selected', String(option.selected));
                    item.setAttribute('aria-disabled', String(option.disabled));
                    item.textContent = option.textContent;
                    item.addEventListener('mousedown', (event) => event.preventDefault());
                    item.addEventListener('click', (event) => {
                        event.preventDefault();
                        choose(index);
                    });
                    return item;
                }),
            );
            if (trigger.disabled) close();
        }
        function highlight(index) {
            active = (index + options.length) % options.length;
            for (const [position, item] of Array.from(menu.children).entries())
                item.classList.toggle('is-active', position === active);
            const item = menu.children[active];
            trigger.setAttribute('aria-activedescendant', item.id);
            item.scrollIntoView({ block: 'nearest' });
        }
        function position() {
            const rect = trigger.getBoundingClientRect();
            const below = innerHeight - rect.bottom - 12;
            const above = rect.top - 12;
            const up = below < 192 && above > below;
            menu.style.width = `${Math.min(Math.max(rect.width, 160), innerWidth - 16)}px`;
            menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - parseFloat(menu.style.width) - 8))}px`;
            menu.style.maxHeight = `${Math.max(48, Math.min(320, up ? above : below))}px`;
            menu.style.top = up ? 'auto' : `${rect.bottom + 4}px`;
            menu.style.bottom = up ? `${innerHeight - rect.top + 4}px` : 'auto';
        }
        function show() {
            if (trigger.disabled) return;
            if (opened) opened();
            sync();
            opened = close;
            menu.classList.remove('hidden');
            trigger.setAttribute('aria-expanded', 'true');
            position();
            highlight(Math.max(0, select.selectedIndex));
        }
        function choose(index) {
            if (options[index].disabled) return;
            const changed = select.value !== options[index].value;
            select.value = options[index].value;
            close();
            if (changed) {
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        // Application code also sets values and focuses selectors programmatically.
        const valueProperty = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        Object.defineProperty(select, 'value', {
            get() {
                return valueProperty.get.call(this);
            },
            set(next) {
                valueProperty.set.call(this, next);
                sync();
            },
        });
        select.focus = (options) => trigger.focus(options);
        new MutationObserver(sync).observe(select, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
        });
        select.addEventListener('change', sync);
        trigger.addEventListener('click', () =>
            trigger.getAttribute('aria-expanded') === 'true' ? close() : show(),
        );
        trigger.addEventListener('blur', close);
        document.addEventListener('pointerdown', (event) => {
            if (!wrapper.contains(event.target) && !menu.contains(event.target)) close();
        });
        window.addEventListener('resize', close);
        window.addEventListener(
            'scroll',
            (event) => {
                if (opened === close && !menu.contains(event.target)) position();
            },
            true,
        );
        trigger.addEventListener('keydown', (event) => {
            const expanded = trigger.getAttribute('aria-expanded') === 'true';
            if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
                event.preventDefault();
                if (!expanded) show();
                else if (event.key === 'Enter' || event.key === ' ') choose(active);
                else
                    highlight(
                        event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? options.length - 1
                              : active + (event.key === 'ArrowDown' ? 1 : -1),
                    );
            } else if (event.key === 'Escape') {
                event.preventDefault();
                close();
            } else if (
                event.key.length === 1 &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey
            ) {
                event.preventDefault();
                if (!expanded) show();
                clearTimeout(typingTimer);
                typed += event.key.toLocaleLowerCase();
                const index = options.findIndex((option) =>
                    option.textContent.toLocaleLowerCase().startsWith(typed),
                );
                if (index >= 0) highlight(index);
                typingTimer = setTimeout(() => {
                    typed = '';
                }, 500);
            }
        });
        sync();
    }
})();
