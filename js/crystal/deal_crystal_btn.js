BX.ready(function () {

    var url = window.location.href;
    if (!url.match(/crm\/deal\/details\/(\d+)/)) {
        return;
    }

    var BUTTON_ID = 'crystal-sidebar-btn';
    var FEEDBACK_ID = 'crystal-feedback';
    var CRYSTAL_API = 'https://crystal.alvla.tools';

    // ===== КОМПАНИЯ СДЕЛКИ =====
    // Реальное название компании, привязанной к сделке (COMPANY_ID). Используется как
    // получатель (to.company) при просчёте доставки — отдельного поля "компания-получатель"
    // на сделке нет, поэтому берём компанию-заказчика (не всегда совпадает с получателем груза).

    var dealCompanyName = '';
    var dealCompanyLoaded = false;

    (function loadDealCompanyName() {
        var dealMatch = window.location.href.match(/crm\/deal\/details\/(\d+)/);
        var dealId = dealMatch ? dealMatch[1] : null;
        if (!dealId) return;

        fetch('/local/ajax/crystal/get_deal_company.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'dealId=' + encodeURIComponent(dealId)
        })
        .then(function (r) { return r.json(); })
        .then(function (resp) {
            dealCompanyName = (resp && resp.company && resp.company.name) ? resp.company.name : '';
        })
        .catch(function () { dealCompanyName = ''; })
        .then(function () {
            dealCompanyLoaded = true;
            updateFeedback();
        });
    })();

    // ===== ПАРСЕР =====

    function parseDeliveryData() {
        var dimensionsEl = document.querySelector('[data-cid="UF_CRM_1720510082918"] .field-item');
        var weightEl     = document.querySelector('[data-cid="UF_CRM_1720510115556"] .field-item');
        var actualDimensionsEl = document.querySelector('[data-cid="UF_CRM_1727792811056"] .field-item');
        var actualWeightEl     = document.querySelector('[data-cid="UF_CRM_1754911404492"] .field-item');
        var addressEl    = document.querySelector('[data-cid="UF_CRM_1714139787401"] .field-item');
        var countryEl  = document.querySelector('[data-cid="UF_CRM_67BF208ADD735"] .field-item');
        var cityEl     = document.querySelector('[data-cid="UF_CRM_1720604913416"] .field-item');
        var zipcodeEl  = document.querySelector('[data-cid="UF_CRM_1720604926030"] .field-item');
        var streetEl   = document.querySelector('[data-cid="UF_CRM_1720604937540"] .field-item');
        var houseEl    = document.querySelector('[data-cid="UF_CRM_1720604951910"] .field-item');

        if (!dimensionsEl && !weightEl && !actualDimensionsEl && !actualWeightEl && !addressEl && !cityEl) return null;

        // Фактические поля (заполняются после сборки груза) имеют приоритет над расчётными
        var actualDimText    = actualDimensionsEl ? actualDimensionsEl.textContent.trim() : '';
        var actualWeightText = actualWeightEl     ? actualWeightEl.textContent.trim()     : '';

        var dimensionsSource = actualDimText    ? 'actual' : 'calculated';
        var weightSource     = actualWeightText ? 'actual' : 'calculated';

        var dimensionsRaw = actualDimText    || (dimensionsEl ? dimensionsEl.textContent.trim() : '');
        var weightRaw     = actualWeightText || (weightEl     ? weightEl.textContent.trim()     : '');

        var dimensions = dimensionsRaw.replace(/шт\s+/gi, 'шт\n');
        var weight     = weightRaw;
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
        var lines = goodsRaw.split(/[\r\n,]+/).map(function(l) { return l.trim(); }).filter(Boolean);

        var weightLine  = lines.find(function(l) { return /[\d,.]+\s*кг/i.test(l); })
                       || lines.find(function(l) { return /^\d[\d\s,.]*$/.test(l); });
        var weightMatch = weightLine ? (weightLine.match(/([\d,.]+)\s*кг/i) || weightLine.match(/([\d,.]+)/)) : null;
        var totalWeight = weightMatch ? parseFloat(weightMatch[1].replace(',', '.')) : null;

        var palletLines = lines.filter(function(l) {
            return /\d+\s*шт/i.test(l) || /(\d+\*){1}\d+/i.test(l);
        });

        palletLines.forEach(function(line) {
            var qtyMatch = line.match(/-*\s*(\d+)\s*шт/i);
            var qtyPrefixMatch = !qtyMatch ? line.match(/^(\d{1,2})\*\s*\d{2,}/) : null;
            var quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : (qtyPrefixMatch ? parseInt(qtyPrefixMatch[1], 10) : 1);

            var sizeMatch = line.match(/(\d{2,5})\s*\*\s*(\d{1,5})\s*[*HНhн]?\s*(\d{2,4})?/i);
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

        return { to: to, units: units, totalWeight: totalWeight, source: { dimensions: dimensionsSource, weight: weightSource } };
    }

    // ===== ФИДБЕК =====

    function sourceBadge(source) {
        if (!source) return '';
        var d = source.dimensions === 'actual';
        var w = source.weight === 'actual';

        if (d && w) return '<span style="color:#16a34a;font-weight:bold;">(факт)</span>';
        if (!d && !w) return '<span style="color:#888;font-weight:normal;">(расчёт)</span>';

        return '<span style="color:#d97706;font-weight:bold;">(габариты: '
            + (d ? 'факт' : 'расчёт') + ', вес: ' + (w ? 'факт' : 'расчёт') + ')</span>';
    }

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
        var companyLine;
        if (!dealCompanyLoaded) {
            companyLine = '<span style="color:#888;">⌛ загрузка...</span>';
        } else if (dealCompanyName) {
            companyLine = dealCompanyName;
        } else {
            companyLine = '<span style="color:#888;">не указана</span>';
        }
        lines.push('&nbsp; Компания <span title="Компания-заказчик по сделке; может отличаться от получателя груза">(заказчик)</span>: ' + companyLine);
        lines.push('&nbsp; Улица: '  + (data.to.street  || '-'));
        lines.push('&nbsp; Индекс: ' + (data.to.zipcode || '-'));
        lines.push('&nbsp; Город: '  + (data.to.city    || '-'));
        lines.push('&nbsp; Страна: ' + (data.to.country || '-'));

        // Юниты
        if (data.units.length > 0) {
            lines.push('<b>Груз:</b> ' + sourceBadge(data.source));
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
            { label: 'Rhenus', cid: 'UF_CRM_1774000644830' },
            { label: 'DSV',    cid: 'UF_CRM_1774000685589' },
            { label: 'Raben',  cid: 'UF_CRM_1774000702384' },
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

    // ===== ДАННЫЕ ДОСТАВКИ =====

    function loadShippingData() {
        var dealMatch = window.location.href.match(/crm\/deal\/details\/(\d+)/);
        var dealId = dealMatch ? dealMatch[1] : null;
        if (!dealId) return;

        var section = document.getElementById('crystal-shipping-data');
        if (!section) return;

        section.innerHTML = '<div style="color:#888;font-size:12px;padding:4px 0;">⌛ Загружаю...</div>';

        var headers = { 'Content-Type': 'application/json', 'X-Api-Key': 'legenda' };

        Promise.all([
            fetch(CRYSTAL_API + '/api/shipping/quotes?dealId=' + dealId, { headers: headers }).then(function(r) { return r.json(); }),
            fetch(CRYSTAL_API + '/api/shipping/orders?dealId=' + dealId, { headers: headers }).then(function(r) { return r.json(); })
        ]).then(function(results) {
            var quotes = Array.isArray(results[0]) ? results[0] : [];
            var orders = Array.isArray(results[1]) ? results[1] : [];

            var html = '';

            // --- Просчёты ---
            html += '<div style="margin-top:8px;">';
            html += '<b style="font-size:12px;">Просчёты доставки</b>';
            if (quotes.length === 0) {
                html += '<div style="color:#888;font-size:11px;padding:2px 0;">Нет данных</div>';
            } else {
                html += '<table style="width:100%;font-size:11px;border-collapse:collapse;margin-top:4px;">';
                html += '<tr style="color:#666;border-bottom:1px solid #eee;"><th style="text-align:left;padding:2px 4px;">Перевозчик</th><th style="text-align:left;padding:2px 4px;">Цена</th><th style="text-align:left;padding:2px 4px;">Куда</th><th style="text-align:left;padding:2px 4px;">Дата</th></tr>';
                quotes.forEach(function(q) {
                    var priceCell = q.price
                        ? '<b>' + parseFloat(q.price).toFixed(2) + '</b>'
                        : (q.error ? '<span style="color:#c00;" title="' + q.error.replace(/"/g, '&quot;') + '">Ошибка</span>' : '—');
                    var dest = [q.toCity, q.toCountry].filter(Boolean).join(', ');
                    var date = q.createdAt ? new Date(q.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                    html += '<tr style="border-bottom:1px solid #f5f5f5;">';
                    html += '<td style="padding:2px 4px;">' + (q.carrier || '—') + '</td>';
                    html += '<td style="padding:2px 4px;">' + priceCell + '</td>';
                    html += '<td style="padding:2px 4px;">' + dest + '</td>';
                    html += '<td style="padding:2px 4px;color:#888;">' + date + '</td>';
                    html += '</tr>';
                });
                html += '</table>';
            }
            html += '</div>';

            // --- Заказы ---
            var statusLabels = { booked: 'Забронирован', picked_up: 'Забран', in_transit: 'В пути', delivered: 'Доставлен', cancelled: 'Отменён' };
            var statusColors = { booked: '#2563eb', picked_up: '#d97706', in_transit: '#7c3aed', delivered: '#16a34a', cancelled: '#dc2626' };

            html += '<div style="margin-top:8px;">';
            html += '<b style="font-size:12px;">Заказы доставки</b>';
            if (orders.length === 0) {
                html += '<div style="color:#888;font-size:11px;padding:2px 0;">Нет данных</div>';
            } else {
                html += '<table style="width:100%;font-size:11px;border-collapse:collapse;margin-top:4px;">';
                html += '<tr style="color:#666;border-bottom:1px solid #eee;"><th style="text-align:left;padding:2px 4px;">Перевозчик</th><th style="text-align:left;padding:2px 4px;">Статус</th><th style="text-align:left;padding:2px 4px;">Цена</th><th style="text-align:left;padding:2px 4px;">Дата</th></tr>';
                orders.forEach(function(o) {
                    var statusLabel = statusLabels[o.status] || o.status;
                    var statusColor = statusColors[o.status] || '#555';
                    var priceCell = o.price ? parseFloat(o.price).toFixed(2) : '—';
                    var date = o.createdAt ? new Date(o.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
                    html += '<tr style="border-bottom:1px solid #f5f5f5;">';
                    html += '<td style="padding:2px 4px;">' + (o.carrier || '—') + '</td>';
                    html += '<td style="padding:2px 4px;"><span style="color:' + statusColor + ';font-weight:bold;">' + statusLabel + '</span></td>';
                    html += '<td style="padding:2px 4px;">' + priceCell + '</td>';
                    html += '<td style="padding:2px 4px;color:#888;">' + date + '</td>';
                    html += '</tr>';
                });
                html += '</table>';
            }
            html += '</div>';

            section.innerHTML = html;
        }).catch(function(err) {
            section.innerHTML = '<div style="color:#c00;font-size:11px;">Ошибка загрузки данных доставки</div>';
            console.error('[Crystal] shipping data error:', err);
        });
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
            if (!isCollapsed) loadShippingData();
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

        var BTN_STYLE = 'box-sizing:border-box;width:100%;height:30px;padding:0 4px;border:none;border-radius:4px;font-size:12px;font-weight:600;color:#fff;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;transition:opacity .15s;';

        function createCarrierButton(key, label, color, endpoint) {
            var btn = document.createElement('button');
            btn.id = 'crystal-' + key + '-btn';
            btn.style.cssText = BTN_STYLE + 'background:' + color + ';';
            btn.textContent = label;

            btn.addEventListener('click', function () {
                var dealMatch = window.location.href.match(/crm\/deal\/details\/(\d+)/);
                var dealId = dealMatch ? dealMatch[1] : null;
                if (!dealId) return alert('Не удалось определить ID сделки');

                var parsed = parseDeliveryData();
                var deliveryData = {
                    from: { company: 'ALVLA', street: 'Dubska 769', city: 'Kladno', zipcode: '27203', country: 'CZ - Czech Republic' },
                    to: Object.assign({ company: dealCompanyName }, parsed.to),
                    units: parsed.units.map(function(u) {
                        return { type: 'EP - DB Europallet', quantity: u.quantity, length: u.length, width: u.width, height: u.height, weight: u.weight };
                    })
                };

                var AUTOCLOSE_KEY = 'crystal-sse-autoclose';

                var popup = new BX.PopupWindow('crystal-' + key + '-log-popup', null, {
                    titleBar: 'Расчёт ' + label,
                    content: '<div id="crystal-' + key + '-log" style="font-family:monospace;font-size:12px;min-width:420px;min-height:80px;max-height:320px;overflow-y:auto;line-height:1.6;">Запрос отправлен...</div>'
                        + '<div style="margin-top:8px;font-size:12px;color:#666;">'
                        + '<label style="cursor:pointer;user-select:none;">'
                        + '<input type="checkbox" id="crystal-sse-autoclose-chk-' + key + '" style="margin-right:5px;cursor:pointer;">'
                        + 'Закрыть после просчёта'
                        + '</label></div>',
                    closeByEsc: true,
                    autoHide: false,
                    overlay: false,
                    closeIcon: { show: true },
                    buttons: []
                });
                popup.show();

                var logDiv = document.getElementById('crystal-' + key + '-log');
                var autocloseChk = document.getElementById('crystal-sse-autoclose-chk-' + key);
                autocloseChk.checked = localStorage.getItem(AUTOCLOSE_KEY) === 'true';
                autocloseChk.addEventListener('change', function() {
                    localStorage.setItem(AUTOCLOSE_KEY, autocloseChk.checked ? 'true' : 'false');
                });

                btn.disabled = true;

                fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deliveryData: deliveryData, dealId: dealId })
                })
                .then(function(res) {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    var reader = res.body.getReader();
                    var decoder = new TextDecoder();
                    var buffer = '';

                    function read() {
                        reader.read().then(function(chunk) {
                            if (chunk.done) {
                                btn.disabled = false;
                                return;
                            }
                            buffer += decoder.decode(chunk.value, { stream: true });
                            var parts = buffer.split('\n\n');
                            buffer = parts.pop();

                            parts.forEach(function(part) {
                                var eventMatch = part.match(/^event:\s*(\w+)/m);
                                var dataMatch  = part.match(/^data:\s*(.+)/m);
                                if (!eventMatch || !dataMatch) return;
                                var type = eventMatch[1];
                                var data;
                                try { data = JSON.parse(dataMatch[1]); } catch(e) { return; }

                                if (type === 'status') {
                                    logDiv.innerHTML += '<br>' + data.message;
                                } else if (type === 'result') {
                                    logDiv.innerHTML += '<br><b style="color:#16a34a">✅ ' + data.result + '</b>';
                                    btn.disabled = false;
                                    if (localStorage.getItem(AUTOCLOSE_KEY) === 'true') popup.close();
                                } else if (type === 'error') {
                                    logDiv.innerHTML += '<br><b style="color:#dc2626">❌ ' + data.error + '</b>';
                                    btn.disabled = false;
                                }
                                logDiv.scrollTop = logDiv.scrollHeight;
                            });

                            read();
                        });
                    }
                    read();
                })
                .catch(function(err) {
                    if (logDiv) logDiv.innerHTML += '<br><b style="color:#dc2626">❌ Ошибка запроса</b>';
                    btn.disabled = false;
                    console.error(label + ' SSE error:', err);
                });
            });

            return btn;
        }

        var rhenusBtn = createCarrierButton('rhenus', 'Rhenus', '#2563eb', 'https://alvla.services/api/rhenusquat');
        var dsvBtn    = createCarrierButton('dsv', 'DSV', '#16a34a', 'https://alvla.services/api/dsvquat');
        var rabenBtn  = createCarrierButton('raben', 'Raben', '#dc2626', 'https://alvla.services/api/rabenquat');

        var pythonBtn = document.createElement('button');
        pythonBtn.id = 'crystal-python-btn';
        pythonBtn.style.cssText = BTN_STYLE + 'background:#7c3aed;';
        pythonBtn.textContent = 'Python';
        pythonBtn.addEventListener('click', function () {
            var parsed = parseDeliveryData();
            if (!parsed) return alert('Не удалось распарсить данные сделки');

            var dealMatch = window.location.href.match(/crm\/deal\/details\/(\d+)/);
            var dealId = dealMatch ? dealMatch[1] : null;

            var deliveryData = {
                from: { company: 'ALVLA', street: 'Dubska 769', city: 'Kladno', zipcode: '27203', country: 'CZ - Czech Republic' },
                to: Object.assign({ company: dealCompanyName }, parsed.to),
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

        var shippingSection = document.createElement('div');
        shippingSection.id = 'crystal-shipping-data';
        shippingSection.style.cssText = 'margin-top:8px;border-top:1px solid #e0e0e0;padding-top:6px;';

        var btnGrid = document.createElement('div');
        btnGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;';
        btnGrid.appendChild(rhenusBtn);
        btnGrid.appendChild(dsvBtn);
        btnGrid.appendChild(rabenBtn);
        btnGrid.appendChild(pythonBtn);

        content.appendChild(hint);
        content.appendChild(feedback);
        content.appendChild(btnGrid);
        content.appendChild(shippingSection);
        wrapper.appendChild(content);
        sidebar.insertBefore(wrapper, sidebar.firstChild);

        updateFeedback();
        if (!isCollapsed) loadShippingData();
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

                function doCreate() {
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
                }

                if (!productName || !window.CrystalProductForms) {
                    doCreate();
                    return;
                }

                var article = window.CrystalProductForms.extractArticleFromRow(row.node, productName);
                btn.disabled = true;
                btn.textContent = '⌛ Ищу форму...';
                statusDiv.textContent = '';

                fetch('https://crystal.alvla.tools/api/product-forms/byArticle/' + encodeURIComponent(article), {
                    headers: { 'X-Api-Key': 'legenda' }
                })
                .then(function(res) {
                    if (res.status === 404) return null;
                    return res.ok ? res.json() : null;
                })
                .then(function(form) {
                    if (form && form.id) {
                        btn.disabled = false;
                        btn.textContent = 'Рассчитать';
                        window.CrystalProductForms.openConfigurator(form, productName, quantity, dealId, getClientName());
                    } else {
                        doCreate();
                    }
                })
                .catch(function() {
                    doCreate();
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
