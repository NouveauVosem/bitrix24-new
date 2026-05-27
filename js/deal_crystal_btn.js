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
        var countryEl  = document.querySelector('[data-cid="UF_CRM_67BF208ADD735"] .field-item');
        var cityEl     = document.querySelector('[data-cid="UF_CRM_1720604913416"] .field-item');
        var zipcodeEl  = document.querySelector('[data-cid="UF_CRM_1720604926030"] .field-item');
        var streetEl   = document.querySelector('[data-cid="UF_CRM_1720604937540"] .field-item');
        var houseEl    = document.querySelector('[data-cid="UF_CRM_1720604951910"] .field-item');

        if (!dimensionsEl && !weightEl && !addressEl && !cityEl) return null;

        var dimensions = dimensionsEl ? dimensionsEl.textContent.trim().replace(/шт\s+/gi, 'шт\n') : '';
        var weight     = weightEl     ? weightEl.textContent.trim() : '';
        var goodsRaw   = (dimensions + '\n' + weight)
            .replace(/[xх]/gi, '*')
            .trim();

        // --- Адрес куда ---
        var to = { street: '', city: '', zipcode: '', country: '' };

        var cityVal = cityEl ? cityEl.textContent.trim() : '';
        if (cityVal) {
            // новые раздельные поля
            var streetVal = streetEl ? streetEl.textContent.trim() : '';
            var houseVal  = houseEl  ? houseEl.textContent.trim()  : '';
            to.street  = streetVal + (houseVal ? ', ' + houseVal : '');
            to.city    = cityVal;
            to.zipcode = zipcodeEl ? zipcodeEl.textContent.trim() : '';
            to.country = countryEl ? countryEl.textContent.trim() : '';
        } else {
            // fallback — старое поле одной строкой
            var toRaw = addressEl ? addressEl.textContent.trim() : '';
            var parts = toRaw.split(',').map(function(p) { return p.trim(); }).filter(Boolean);
            if (parts.length >= 2) {
                to.country  = parts.pop();
                var zipCity = parts.pop();
                to.street   = parts.join(', ');
                var m = zipCity.match(/^(\d{3}\s\d{2}|\d{2}-\d{3}|\d{4,6})\s+(.+)$/);
                if (m) { to.zipcode = m[1]; to.city = m[2]; }
                else   { to.city = zipCity; }
            } else {
                to.city = toRaw;
            }
        }

        // --- Паллеты ---
        var units = [];
        var lines = goodsRaw.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);

        var weightLine  = lines.find(function(l) { return /[\d,.]+\s*кг/i.test(l); });
        var weightMatch = weightLine ? weightLine.match(/([\d,.]+)\s*кг/i) : null;
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
        lines.push('<div class="crystal-feedback-body">');

        // Адрес
        lines.push('<b>Адрес:</b>');
        lines.push('&nbsp; Улица: '  + (data.to.street  || '-'));
        lines.push('&nbsp; Индекс: ' + (data.to.zipcode || '-'));
        lines.push('&nbsp; Город: '  + (data.to.city    || '-'));
        lines.push('&nbsp; Страна: ' + (data.to.country || '-'));

        // Юниты
        if (data.units.length > 0) {
            lines.push('<b>Груз:</b>');
            data.units.forEach(function(u, i) {
                var desc = 'Юнит ' + (i + 1) + ': ' + u.quantity + ' шт';
                desc += ', ' + (u.length && u.width ? u.length + 'x' + u.width + (u.height ? 'x' + u.height : '') + ' см' : '-');
                desc += ', ' + (u.weight ? u.weight + ' кг' : '-');
                lines.push('&nbsp; ' + desc);
            });
        }

        if (data.totalWeight) {
            lines.push('<b>Общий вес:</b> ' + data.totalWeight + ' кг');
        }

        var prices = [
            { label: 'Rhenus',   cid: 'UF_CRM_1774000644830' },
            { label: 'Schenker', cid: 'UF_CRM_1774000685589' },
            { label: 'Raben',    cid: 'UF_CRM_1774000702384' },
        ];
        var priceLines = [];
        prices.forEach(function(p) {
            var el = document.querySelector('[data-cid="' + p.cid + '"] .field-item');
            var val = el ? el.textContent.trim() : '';
            if (val && val.length <= 10) priceLines.push('&nbsp; ' + p.label + ': <b>' + val + '</b>');
        });
        if (priceLines.length > 0) {
            lines.push('<b>Цены доставки:</b>');
            priceLines.forEach(function(l) { lines.push(l); });
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
        wrapper.id = BUTTON_ID;

        var STORAGE_KEY = 'crystal-panel-collapsed';
        var isCollapsed = localStorage.getItem(STORAGE_KEY) !== 'false'; // по умолчанию свёрнуто

        var toggleBtn = document.createElement('div');
        toggleBtn.id = 'crystal-toggle-header';
        toggleBtn.style.cssText = 'cursor:pointer;padding:6px 10px;background:#2d6cdf;color:#fff;border-radius:4px;font-size:13px;font-weight:bold;user-select:none;display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';
        toggleBtn.innerHTML = '<span>Crystal Доставка</span><span id="crystal-toggle-arrow">' + (isCollapsed ? '▶' : '▼') + '</span>';

        var content = document.createElement('div');
        content.id = 'crystal-panel-content';
        content.style.display = isCollapsed ? 'none' : 'block';

        toggleBtn.addEventListener('click', function () {
            isCollapsed = !isCollapsed;
            content.style.display = isCollapsed ? 'none' : 'block';
            document.getElementById('crystal-toggle-arrow').textContent = isCollapsed ? '▶' : '▼';
            localStorage.setItem(STORAGE_KEY, isCollapsed ? 'true' : 'false');
        });

        wrapper.appendChild(toggleBtn);

        /* Crystal — калькулятор (отключено, можно вернуть)
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
        */

        var hint = document.createElement('details');
        hint.id = 'crystal-delivery-hint';
        hint.innerHTML = '<summary>Формат адреса доставки</summary>'
            + '<div class="crystal-hint-body">'
            + '<b>Формат:</b> Улица, Индекс Город, Страна<br>'
            + '<b>Примеры:</b><br>'
            + '&nbsp;Průmyslová 12, 271 01 Nové Strašecí, CZ<br>'
            + '&nbsp;Karla Marxe 5, 10115 Berlin, DE<br>'
            + '<b>Правила:</b><br>'
            + '&nbsp;• Части разделяются <b>запятой</b><br>'
            + '&nbsp;• Индекс пишется <b>перед городом</b> через пробел<br>'
            + '&nbsp;• Форматы индекса: <code>271 01</code> или <code>10115</code><br>'
            + '&nbsp;• Последняя часть — страна<br>'
            + '&nbsp;• Минимум: Город, Страна'
            + '</div>';

        var feedback = document.createElement('div');
        feedback.id = FEEDBACK_ID;

        var rhenusBtn = document.createElement('button');
        rhenusBtn.id = 'crystal-rhenus-btn';
        rhenusBtn.className = 'ui-btn ui-btn-primary ui-btn-sm';
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
        schenkerBtn.className = 'ui-btn ui-btn-success ui-btn-sm';
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

        var rabenBtn = document.createElement('button');
        rabenBtn.id = 'crystal-raben-btn';
        rabenBtn.className = 'ui-btn ui-btn-danger ui-btn-sm';
        rabenBtn.textContent = 'Рассчитать Raben';
        rabenBtn.addEventListener('click', function () {
            var dealMatch = window.location.href.match(/crm\/deal\/details\/(\d+)/);
            var dealId = dealMatch ? dealMatch[1] : null;
            if (!dealId) return alert('Не удалось определить ID сделки');

            rabenBtn.disabled = true;
            rabenBtn.textContent = '⌛ Запускаю...';

            var parsed = parseDeliveryData();
            var deliveryData = {
                from: { company: 'ALVLA', street: 'Dubska 769', city: 'Kladno', zipcode: '27203', country: 'CZ - Czech Republic' },
                to: Object.assign({ company: '' }, parsed.to),
                units: parsed.units.map(function(u) {
                    return { type: 'EP - DB Europallet', quantity: u.quantity, length: u.length, width: u.width, height: u.height, weight: u.weight };
                })
            };

            fetch('https://alvla.services/api/rabenquat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deliveryData: deliveryData, dealId: dealId })
            })
            .then(function(res) { return res.json(); })
            .then(function() {
                rabenBtn.textContent = '✅ Запущено — результат придёт в сделку';
            })
            .catch(function(err) {
                rabenBtn.textContent = '❌ Ошибка запроса';
                rabenBtn.disabled = false;
                console.error('Raben request error:', err);
            });
        });

        var pythonBtn = document.createElement('button');
        pythonBtn.id = 'crystal-python-btn';
        pythonBtn.className = 'ui-btn ui-btn-sm';
        pythonBtn.style.cssText = 'background:#7c3aed;color:#fff;border-color:#7c3aed;';
        pythonBtn.textContent = 'Загрузить в Python';
        pythonBtn.addEventListener('click', function () {
            var parsed = parseDeliveryData();
            if (!parsed) return alert('Не удалось распарсить данные сделки');

            var dealMatch = window.location.href.match(/crm\/deal\/details\/(\d+)/);
            var dealId = dealMatch ? dealMatch[1] : null;

            var clientName = '';
            var titleEl = document.querySelector('#pagetitle');
            if (titleEl) {
                var titleText = titleEl.textContent.trim();
                var dashIdx = titleText.indexOf(' - ');
                clientName = dashIdx !== -1 ? titleText.slice(dashIdx + 3).trim() : titleText;
            }

            var deliveryData = {
                from: { company: 'ALVLA', street: 'Dubska 769', city: 'Kladno', zipcode: '27203', country: 'CZ - Czech Republic' },
                to: Object.assign({ company: clientName }, parsed.to),
                units: parsed.units.map(function(u) {
                    return { type: 'EP - DB Europallet', quantity: u.quantity, length: u.length, width: u.width, height: u.height, weight: u.weight };
                })
            };

            pythonBtn.disabled = true;
            pythonBtn.textContent = '⌛ Отправляю...';

            fetch('https://alvla.services/api/pending', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deliveryData: deliveryData, dealId: dealId })
            })
            .then(function(res) { return res.json(); })
            .then(function() {
                pythonBtn.textContent = '✅ Данные отправлены в Python';
                setTimeout(function() {
                    pythonBtn.disabled = false;
                    pythonBtn.textContent = 'Загрузить в Python';
                }, 4000);
            })
            .catch(function(err) {
                pythonBtn.textContent = '❌ Ошибка';
                pythonBtn.disabled = false;
                console.error('Python pending error:', err);
            });
        });

        content.appendChild(hint);
        content.appendChild(feedback);
        content.appendChild(rhenusBtn);
        content.appendChild(schenkerBtn);
        content.appendChild(rabenBtn);
        content.appendChild(pythonBtn);
        wrapper.appendChild(content);
        sidebar.insertBefore(wrapper, sidebar.firstChild);

        updateFeedback();
    }

    var sidebarObserver = new MutationObserver(function () {
        insertButton();
    });

    sidebarObserver.observe(document.body, { childList: true, subtree: true });

    insertButton();

    // ===== КНОПКИ РАСЧЁТА ЦЕНЫ В СТРОКАХ ТОВАРОВ =====

    function getClientName() {
        var titleEl = document.querySelector('#pagetitle');
        if (!titleEl) return '';
        var titleText = titleEl.textContent.trim();
        var dashIdx = titleText.indexOf(' - ');
        return dashIdx !== -1 ? titleText.slice(dashIdx + 3).trim() : titleText;
    }

    function injectProductButtons() {
        var gridNode = document.body.querySelector('[id^="CCrmEntityProductListComponent"]');
        if (!gridNode) return;

        var gridManager = BX.Main.gridManager.getById('CCrmEntityProductListComponent');
        var grid = gridManager && gridManager.instance;
        if (!grid) return;

        var rows = grid.getRows();
        var children = rows.getBodyChild();

        var nameKey = null, qtyKey = null;
        var firstRow = rows.rows[0];
        if (firstRow && firstRow.node) {
            Array.from(firstRow.node.children).forEach(function(td, key) {
                var colName = td.getAttribute('data-name');
                if (colName === 'MAIN_INFO') nameKey = key;
                if (colName === 'QUANTITY') qtyKey = key;
            });
        }

        children.forEach(function(row) {
            if (row.node.querySelector('.crystal-product-calc-btn')) return;

            var lastCell = row.node.cells[row.node.cells.length - 1];
            if (!lastCell) return;

            var btn = document.createElement('button');
            btn.className = 'ui-btn ui-btn-primary ui-btn-xs crystal-product-calc-btn';
            btn.textContent = 'Рассчитать';

            var statusDiv = document.createElement('div');
            statusDiv.style.cssText = 'font-size:11px;color:#555;margin-top:3px;max-width:200px;word-break:break-word;';

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                var productName = '';
                if (nameKey !== null && row.node.children[nameKey]) {
                    var nameInput = row.node.children[nameKey].querySelector('input[data-name="NAME"]');
                    productName = nameInput ? nameInput.value.trim() : '';
                }

                var quantity = '';
                if (qtyKey !== null && row.node.children[qtyKey]) {
                    var qtyText = row.node.children[qtyKey].textContent.trim();
                    var qtyMatch = qtyText.match(/[\d.,]+/);
                    quantity = qtyMatch ? qtyMatch[0] : qtyText;
                }

                var dm = window.location.href.match(/crm\/deal\/details\/(\d+)/);
                var dealId = dm ? dm[1] : null;

                btn.disabled = true;
                btn.textContent = '⌛ Создаю...';
                statusDiv.textContent = '';

                fetch('https://crystal.alvla.tools/api/price-calculations/crm/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Api-Key': 'legenda'
                    },
                    body: JSON.stringify({
                        dealId: dealId,
                        productName: productName,
                        quantity: quantity,
                        clientName: getClientName()
                    })
                })
                .then(function(res) {
                    return res.json().then(function(data) { return { ok: res.ok, data: data }; });
                })
                .then(function(result) {
                    if (result.data.status === 'error') {
                        btn.textContent = '❌ Ошибка';
                        btn.disabled = false;
                    } else {
                        btn.textContent = '✅ Готово';
                    }
                    statusDiv.textContent = result.data.message || '';
                })
                .catch(function(err) {
                    btn.textContent = '❌ Ошибка';
                    btn.disabled = false;
                    statusDiv.textContent = 'Ошибка запроса';
                    console.error('[Crystal] price calc error:', err);
                });
            });

            lastCell.appendChild(btn);
            lastCell.appendChild(statusDiv);
        });
    }

    var productGridObserver = new MutationObserver(function() {
        injectProductButtons();
    });

    productGridObserver.observe(document.body, { childList: true, subtree: true });

    injectProductButtons();

});
