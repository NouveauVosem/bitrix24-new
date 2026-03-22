BX.ready(function () {

    var url = window.location.href;
    if (!url.match(/crm\/deal\/details\/(\d+)/)) {
        return;
    }

    var PANEL_ID    = 'crystal-reservation-panel';
    var API_URL     = 'https://crystal.alvla.tools/api/units/getRootProductsSummaryByArticles';
    var RESERVE_URL = 'https://crystal.alvla.tools/api/reservation/createReservation/';
    var SUMMARY_URL = 'https://crystal.alvla.tools/api/reservation/getReservationSummaryByDeal/';
    var FIELD_CID   = 'UF_CRM_1728470026470';

    var dealMatch = url.match(/crm\/deal\/details\/(\d+)/);
    var DEAL_ID   = dealMatch ? dealMatch[1] : null;

    // ===== ПАРСИНГ ПОЛЯ =====

    function getFieldText() {
        var el = document.querySelector('[data-cid="' + FIELD_CID + '"] .field-item');
        return el ? (el.textContent || el.innerText || '') : '';
    }

    // Извлекаем уникальные артикулы вида NN.NNNN.N
    function parseArticles(text) {
        var seen = {};
        var articles = [];
        var matches = text.match(/\d+\.\d+\.\d+/g) || [];
        matches.forEach(function (a) {
            if (!seen[a]) { seen[a] = true; articles.push(a); }
        });
        return articles;
    }

    // К-во на каждый артикул из блоков "Норма товара: ARTICLE ... К-во: N"
    function parseQuantities(text) {
        var result = {};
        var blocks = text.split(/Норма товара:/);
        blocks.forEach(function (block) {
            var art = block.match(/(\d+\.\d+\.\d+)/);
            var qty = block.match(/К-во:\s*(\d+)/);
            if (art && qty) {
                result[art[1]] = parseInt(qty[1], 10);
            }
        });
        return result;
    }

    // ===== РЕНДЕР =====

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function createReservation(parentNormId, reserveQty, btn) {
        if (!DEAL_ID) {
            btn.textContent = '❌ Нет ID сделки';
            return;
        }
        btn.disabled = true;
        btn.textContent = '⌛ Резервирую…';

        fetch(RESERVE_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                parentNormId:    parentNormId,
                dealId:          DEAL_ID,
                reservationList: [{ reserveQty: reserveQty, statusCode: 'inStock' }]
            })
        })
        .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function () {
            btn.textContent = '✅ Зарезервировано';
        })
        .catch(function (err) {
            btn.textContent = '❌ Ошибка';
            btn.disabled = false;
            console.error('[ReservationStatus] reserve error:', err);
        });
    }

    function renderPanel(items, quantities, reservedMap) {
        var panel = document.getElementById(PANEL_ID);
        if (!panel) return;

        panel.innerHTML = '';

        if (!items || items.length === 0) {
            panel.innerHTML = '<div style="color:#888;font-size:12px;">Нет данных от API</div>';
            return;
        }

        var wrap = document.createElement('div');
        wrap.style.cssText = 'font-size:12px;line-height:1.6;';

        items.forEach(function (item) {
            var norm    = item.parentNorm || {};
            var article = norm.article || '';
            var normId  = norm.id || '';
            var name    = (norm.name && norm.name.ru) ? norm.name.ru : article;

            var inStockFree = 0;
            if (Array.isArray(item.statusBreakdown)) {
                item.statusBreakdown.forEach(function (s) {
                    if (s.status && s.status.code === 'inStock') {
                        inStockFree = s.free != null ? s.free : 0;
                    }
                });
            }

            var needed = quantities[article] || null;
            var enough = needed === null || inStockFree >= needed;
            var accent = enough ? '#2c9e4b' : '#e53e3e';

            var card = document.createElement('div');
            card.style.cssText = 'margin-bottom:6px;padding:6px 8px;background:#f5f7fa;border-radius:4px;border-left:3px solid ' + accent + ';';

            var artDiv = document.createElement('div');
            artDiv.style.cssText = 'font-weight:600;color:#333;';
            artDiv.textContent = article;

            var nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'color:#555;margin-top:1px;';
            nameDiv.textContent = name;

            var stockDiv = document.createElement('div');
            stockDiv.style.cssText = 'margin-top:3px;';
            stockDiv.innerHTML = 'На складе: <b style="color:' + accent + ';">' + inStockFree + '</b>'
                + (needed !== null ? ' <span style="color:#888;">(нужно: ' + needed + ')</span>' : '');

            var footer = document.createElement('div');
            footer.style.cssText = 'margin-top:5px;';

            var alreadyReserved = reservedMap && reservedMap[normId] != null ? reservedMap[normId] : null;

            if (alreadyReserved !== null) {
                var badge = document.createElement('span');
                badge.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:3px;background:#e6f4ea;color:#2c9e4b;border:1px solid #2c9e4b;';
                badge.textContent = '✓ Зарезервировано: ' + alreadyReserved + ' шт';
                footer.appendChild(badge);
            } else {
                var reserveQty = needed !== null ? needed : inStockFree;

                var btn = document.createElement('button');
                btn.style.cssText = 'font-size:11px;padding:2px 8px;cursor:pointer;border:1px solid #3c8dbc;background:#3c8dbc;color:#fff;border-radius:3px;';
                btn.textContent = 'Зарезервировать' + (needed !== null ? ' (' + needed + ' шт)' : '');
                btn.addEventListener('click', function () {
                    createReservation(normId, reserveQty, btn);
                });
                footer.appendChild(btn);
            }
            card.appendChild(artDiv);
            card.appendChild(nameDiv);
            card.appendChild(stockDiv);
            card.appendChild(footer);
            wrap.appendChild(card);
        });

        panel.appendChild(wrap);
    }

    // ===== ЗАГРУЗКА =====

    function loadReservation() {
        var panel = document.getElementById(PANEL_ID);
        if (!panel) return;

        var text     = getFieldText();
        var articles = parseArticles(text);

        if (articles.length === 0) {
            panel.innerHTML = '<div style="color:#888;font-size:12px;">Поле резервации не заполнено</div>';
            return;
        }

        panel.innerHTML = '<div style="color:#888;font-size:12px;">Загрузка…</div>';

        var stockFetch = fetch(API_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ articles: articles })
        }).then(function (res) { return res.json(); });

        var summaryFetch = DEAL_ID
            ? fetch(SUMMARY_URL + DEAL_ID).then(function (res) { return res.json(); })
            : Promise.resolve(null);

        Promise.all([stockFetch, summaryFetch])
        .then(function (results) {
            var data    = results[0];
            var summary = results[1];

            // строим map: parentNormId -> totalReservedKits
            var reservedMap = {};
            if (summary && Array.isArray(summary.products)) {
                summary.products.forEach(function (p) {
                    if (p.parentNorm && p.parentNorm.id != null) {
                        reservedMap[p.parentNorm.id] = p.totalReservedKits;
                    }
                });
            }

            var quantities = parseQuantities(text);
            renderPanel(Array.isArray(data) ? data : [], quantities, reservedMap);
        })
        .catch(function (err) {
            var p = document.getElementById(PANEL_ID);
            if (p) p.innerHTML = '<div style="color:#e53e3e;font-size:12px;">Ошибка загрузки</div>';
            console.error('[ReservationStatus] fetch error:', err);
        });
    }

    // ===== ВСТАВКА ПАНЕЛИ =====

    function insertPanel() {
        if (document.getElementById(PANEL_ID)) return;

        var sidebar = document.querySelector('.ui-entity-editor-column-content');
        if (!sidebar) return;

        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'padding:10px 15px 5px;';

        // Заголовок + кнопка «Обновить»
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';

        var title = document.createElement('div');
        title.style.cssText = 'font-size:13px;font-weight:600;color:#333;';
        title.textContent = 'Статус резервации';

        var refreshBtn = document.createElement('button');
        refreshBtn.style.cssText = 'font-size:11px;padding:2px 8px;cursor:pointer;border:1px solid #ccc;background:#fff;border-radius:3px;color:#555;';
        refreshBtn.textContent = '↻ Обновить';
        refreshBtn.addEventListener('click', loadReservation);

        header.appendChild(title);
        header.appendChild(refreshBtn);

        var panel = document.createElement('div');
        panel.id = PANEL_ID;

        wrapper.appendChild(header);
        wrapper.appendChild(panel);
        sidebar.insertBefore(wrapper, sidebar.firstChild);

        loadReservation();
    }

    var observer = new MutationObserver(function () {
        insertPanel();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    insertPanel();

});
