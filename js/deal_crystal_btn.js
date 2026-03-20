BX.ready(function () {

    var url = window.location.href;
    if (!url.match(/crm\/deal\/details\/(\d+)/)) {
        return;
    }

    var BUTTON_ID = 'crystal-sidebar-btn';
    var FEEDBACK_ID = 'crystal-feedback';

    // ===== ПАРСЕР =====

    function parseDeliveryData() {
        var dimensionsEl = document.querySelector('[data-cid="UF_CRM_1720510082918"] .field-item');
        var weightEl     = document.querySelector('[data-cid="UF_CRM_1720510115556"] .field-item');
        var addressEl    = document.querySelector('[data-cid="UF_CRM_1714139787401"] .field-item');

        if (!dimensionsEl && !weightEl && !addressEl) return null;

        var dimensions = dimensionsEl ? dimensionsEl.textContent.trim().replace(/шт\s+/gi, 'шт\n') : '';
        var weight     = weightEl     ? weightEl.textContent.trim() : '';
        var goodsRaw   = (dimensions + '\n' + weight)
            .replace(/[xх]/gi, '*')
            .trim();

        // --- Адрес куда ---
        var toRaw = addressEl ? addressEl.textContent.trim() : '';
        var to = { street: '', city: '', zipcode: '', country: '' };

        var parts = toRaw.split(',').map(function(p) { return p.trim(); }).filter(Boolean);
        if (parts.length >= 2) {
            to.country   = parts.pop();
            var zipCity  = parts.pop();
            to.street    = parts.join(', ');
            var m = zipCity.match(/^(\d{3}\s\d{2}|\d{4,6})\s+(.+)$/);
            if (m) { to.zipcode = m[1]; to.city = m[2]; }
            else   { to.city = zipCity; }
        } else {
            to.city = toRaw;
        }

        // --- Паллеты ---
        var units = [];
        var lines = goodsRaw.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);

        var weightLine  = lines.find(function(l) { return /вес/i.test(l); });
        var weightMatch = weightLine ? weightLine.match(/вес\s*-\s*([\d,.]+)/i) : null;
        var totalWeight = weightMatch ? parseFloat(weightMatch[1].replace(',', '.')) : null;

        var palletLines = lines.filter(function(l) {
            return /\d+\s*шт/i.test(l) || /(\d+\*){1}\d+/i.test(l);
        });

        palletLines.forEach(function(line) {
            var qtyMatch = line.match(/-*\s*(\d+)\s*шт/i);
            var quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

            var sizeMatch = line.match(/(\d{2,5})\s*\*\s*(\d{1,5})\s*[HНhн]?\s*(\d{2,4})?/i);
            var length = sizeMatch ? parseInt(sizeMatch[1], 10) : null;
            var width  = sizeMatch ? parseInt(sizeMatch[2], 10) : null;
            var height = sizeMatch ? parseInt(sizeMatch[3], 10) : null;

            if ((length && length > 300) || (width && width > 300) || (height && height > 300)) {
                if (length) length = Math.round(length / 10);
                if (width)  width  = Math.round(width  / 10);
                if (height) height = Math.round(height / 10);
            }

            units.push({ quantity: quantity, length: length, width: width, height: height, weight: null });
        });

        var totalPallets = units.reduce(function(s, u) { return s + (u.quantity || 0); }, 0);
        if (totalWeight && totalPallets > 0) {
            units.forEach(function(u) {
                u.weight = Math.round((totalWeight / totalPallets) * u.quantity * 10) / 10;
            });
        }

        return { to: to, units: units, totalWeight: totalWeight };
    }

    // ===== ФИДБЕК =====

    function updateFeedback() {
        var feedback = document.getElementById(FEEDBACK_ID);
        if (!feedback) return;

        var data = parseDeliveryData();
        if (!data) {
            if (feedback.innerHTML !== '') feedback.innerHTML = '';
            return;
        }

        var lines = [];
        lines.push('<div style="font-size:12px; color:#535c69; line-height:1.6; margin-top:8px; padding:8px 10px; background:#f5f7fa; border-radius:6px;">');

        // Адрес
        lines.push('<b>Адрес:</b>');
        if (data.to.street)  lines.push('&nbsp; Улица: ' + data.to.street);
        if (data.to.zipcode) lines.push('&nbsp; Индекс: ' + data.to.zipcode);
        if (data.to.city)    lines.push('&nbsp; Город: ' + data.to.city);
        if (data.to.country) lines.push('&nbsp; Страна: ' + data.to.country);

        // Юниты
        if (data.units.length > 0) {
            lines.push('<b>Груз:</b>');
            data.units.forEach(function(u, i) {
                var desc = 'Юнит ' + (i + 1) + ': ' + u.quantity + ' шт';
                if (u.length && u.width) desc += ', ' + u.length + 'x' + u.width + (u.height ? 'x' + u.height : '') + ' см';
                if (u.weight) desc += ', ' + u.weight + ' кг';
                lines.push('&nbsp; ' + desc);
            });
        }

        if (data.totalWeight) {
            lines.push('<b>Общий вес:</b> ' + data.totalWeight + ' кг');
        }

        lines.push('</div>');

        var newHTML = lines.join('<br>');
        if (feedback.innerHTML !== newHTML) {
            feedback.innerHTML = newHTML;
        }
    }

    // ===== ВСТАВКА =====

    function insertButton() {
        if (document.getElementById(BUTTON_ID)) {
            updateFeedback();
            return;
        }

        var sidebar = document.querySelector('.ui-entity-editor-column-content');
        if (!sidebar) return;

        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'padding: 10px 15px 5px;';

        var btn = document.createElement('a');
        btn.id = BUTTON_ID;
        btn.href = '#';
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.className = 'ui-btn ui-btn-primary ui-btn-md';
        btn.style.cssText = 'display:block; text-align:center; width:100%; box-sizing:border-box;';
        btn.textContent = 'Crystal';

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var dimensionsEl = document.querySelector('[data-cid="UF_CRM_1720510082918"] .field-item');
            var weightEl     = document.querySelector('[data-cid="UF_CRM_1720510115556"] .field-item');
            var addressEl    = document.querySelector('[data-cid="UF_CRM_1714139787401"] .field-item');

            var row = [];
            row[3] = 'Dubska 769, 27203 Kladno';
            row[4] = addressEl ? addressEl.textContent.trim() : '';
            var dimensions = dimensionsEl ? dimensionsEl.textContent.trim().replace(/шт\s+/gi, 'шт\n') : '';
            var weight = weightEl ? weightEl.textContent.trim() : '';
            row[5] = dimensions + '\n' + weight;

            var data = btoa(unescape(encodeURIComponent(JSON.stringify(row))));
            window.open('https://alvla.services/calculator.html?data=' + data, '_blank');
        });

        var feedback = document.createElement('div');
        feedback.id = FEEDBACK_ID;

        var rhenusBtn = document.createElement('button');
        rhenusBtn.id = 'crystal-rhenus-btn';
        rhenusBtn.className = 'ui-btn ui-btn-success ui-btn-sm';
        rhenusBtn.style.cssText = 'margin-top:6px; width:100%;';
        rhenusBtn.textContent = 'Рассчитать Rhenus';
        rhenusBtn.addEventListener('click', function () {
            var dealMatch = window.location.href.match(/crm\/deal\/details\/(\d+)/);
            var dealId = dealMatch ? dealMatch[1] : null;
            if (!dealId) return alert('Не удалось определить ID сделки');

            rhenusBtn.disabled = true;
            rhenusBtn.textContent = '⌛ Запускаю...';

            var parsed = parseDeliveryData();
            var deliveryData = {
                from: { company: 'ALVLA', street: 'Dubska 769', city: 'Kladno', zipcode: '27203', country: 'CZ - Czech Republic' },
                to: Object.assign({ company: '' }, parsed.to),
                units: parsed.units.map(function(u) {
                    return { type: 'EP - DB Europallet', quantity: u.quantity, length: u.length, width: u.width, height: u.height, weight: u.weight };
                })
            };

            fetch('https://alvla.services/api/rhenusquat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deliveryData: deliveryData, dealId: dealId })
            })
            .then(function(res) { return res.json(); })
            .then(function() {
                rhenusBtn.textContent = '✅ Запущено — результат придёт в сделку';
            })
            .catch(function(err) {
                rhenusBtn.textContent = '❌ Ошибка запроса';
                rhenusBtn.disabled = false;
                console.error('Rhenus request error:', err);
            });
        });

        var schenkerBtn = document.createElement('button');
        schenkerBtn.id = 'crystal-schenker-btn';
        schenkerBtn.className = 'ui-btn ui-btn-warning ui-btn-sm';
        schenkerBtn.style.cssText = 'margin-top:4px; width:100%;';
        schenkerBtn.textContent = 'Рассчитать Schenker';
        schenkerBtn.addEventListener('click', function () {
            var dealMatch = window.location.href.match(/crm\/deal\/details\/(\d+)/);
            var dealId = dealMatch ? dealMatch[1] : null;
            if (!dealId) return alert('Не удалось определить ID сделки');

            schenkerBtn.disabled = true;
            schenkerBtn.textContent = '⌛ Запускаю...';

            var parsed = parseDeliveryData();
            var deliveryData = {
                from: { company: 'ALVLA', street: 'Dubska 769', city: 'Kladno', zipcode: '27203', country: 'CZ - Czech Republic' },
                to: Object.assign({ company: '' }, parsed.to),
                units: parsed.units.map(function(u) {
                    return { type: 'EP - DB Europallet', quantity: u.quantity, length: u.length, width: u.width, height: u.height, weight: u.weight };
                })
            };

            fetch('https://alvla.services/api/schenkerquat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deliveryData: deliveryData, dealId: dealId })
            })
            .then(function(res) { return res.json(); })
            .then(function() {
                schenkerBtn.textContent = '✅ Запущено — результат придёт в сделку';
            })
            .catch(function(err) {
                schenkerBtn.textContent = '❌ Ошибка запроса';
                schenkerBtn.disabled = false;
                console.error('Schenker request error:', err);
            });
        });

        wrapper.appendChild(btn);
        wrapper.appendChild(feedback);
        wrapper.appendChild(rhenusBtn);
        wrapper.appendChild(schenkerBtn);
        sidebar.insertBefore(wrapper, sidebar.firstChild);

        updateFeedback();
    }

    var observer = new MutationObserver(function () {
        insertButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    insertButton();

});
