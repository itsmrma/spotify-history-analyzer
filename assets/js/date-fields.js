/* Keep visible dates in day/month/year order, with the native calendar available. */
(() => {
    'use strict';
    const A = window.HistoryAnalytics;
    for (const input of document.querySelectorAll('.date-input')) {
        const picker = document.createElement('input');
        picker.type = 'date';
        picker.className = 'date-native';
        picker.tabIndex = -1;
        picker.setAttribute('aria-hidden', 'true');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'date-calendar';
        button.setAttribute(
            'aria-label',
            `Open calendar for ${input.labels[0].textContent.trim()}`,
        );
        const icon = document.createElement('span');
        icon.className = 'material-icons-outlined icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'calendar_month';
        button.append(icon);
        input.after(picker, button);

        const validate = () => {
            const iso = A.parseInputDate(input.value);
            let error = '';
            if (input.value && !iso) error = 'Enter a valid date in gg/mm/yyyy format.';
            else if (iso && input.max && iso > input.max)
                error = 'Choose a date on or before today.';
            input.setCustomValidity(error);
            input.setAttribute('aria-invalid', String(Boolean(error)));
            picker.value = iso || '';
        };
        input.addEventListener('input', () => {
            // Numeric mobile keyboards can enter the date without typing slashes.
            const raw = input.value;
            const digits = raw.replaceAll('/', '');
            if (/^[\d/]*$/.test(raw) && digits.length <= 8) {
                const formatted = `${digits.slice(0, 2)}${digits.length > 2 ? `/${digits.slice(2, 4)}` : ''}${digits.length > 4 ? `/${digits.slice(4)}` : ''}`;
                if (formatted !== raw) {
                    const before = raw.slice(0, input.selectionStart).replaceAll('/', '').length;
                    input.value = formatted;
                    let position = 0;
                    let count = 0;
                    while (position < formatted.length && count < before) {
                        if (formatted[position] !== '/') count++;
                        position++;
                    }
                    input.setSelectionRange(position, position);
                }
            }
            validate();
        });
        input.addEventListener('blur', () => {
            const iso = A.parseInputDate(input.value);
            if (iso) input.value = A.formatInputDate(iso);
            validate();
        });
        const selectDate = () => {
            input.value = A.formatInputDate(picker.value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        picker.addEventListener('input', selectDate);
        picker.addEventListener('change', selectDate);
        button.addEventListener('click', () => {
            picker.value = A.parseInputDate(input.value) || '';
            picker.max = input.max;
            try {
                picker.showPicker();
            } catch (_) {
                // Typing remains available when the browser cannot open a native picker.
                input.focus();
            }
        });
    }
})();
