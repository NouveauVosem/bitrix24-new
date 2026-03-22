BX.ready(function () {

    var url = window.location.href;
    if (!url.match(/crm\/deal\/details\/(\d+)/)) {
        return;
    }

    var PANEL_ID  = 'crystal-reservation-panel';
    var API_URL   = 'https://crystal.alvla.tools/api/units/getRootProductsSummaryByArticles';
    var FIELD_CID = 'UF_CRM_1728470026470';

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

    function renderPanel(items, quantities) {
        var panel = document.getElementById(PANEL_ID);
        if (!panel) return;

        if (!items || items.length === 0) {
            panel.innerHTML = '<div style="color:#888;font-size:12px;">Нет данных от API</div>';
            return;
        }

        var html = '<div style="font-size:12px;line-height:1.6;">';

        items.forEach(function (item) {
            var norm    = item.parentNorm || {};
            var article = norm.article || '';
            var name    = (norm.name && norm.name.ru) ? norm.name.ru : article;

            var inStockFree = 0;
            if (Array.isArray(item.statusBreakdown)) {
                item.statusBreakdown.forEach(function (s) {
                    if (s.status && s.status.code === 'inStock') {
                        inStockFree = s.free != null ? s.free : 0;
                    }
                });
            }

            var needed  = quantities[article] || null;
            var enough  = needed === null || inStockFree >= needed;
            var accent  = enough ? '#2c9e4b' : '#e53e3e';

            html += '<div style="margin-bottom:6px;padding:6px 8px;background:#f5f7fa;border-radius:4px;border-left:3px solid ' + accent + ';">';
            html += '<div style="font-weight:600;color:#333;">' + escapeHtml(article) + '</div>';
            html += '<div style="color:#555;margin-top:1px;">' + escapeHtml(name) + '</div>';
            html += '<div style="margin-top:3px;">На складе: <b style="color:' + accent + ';">' + inStockFree + '</b>';
            if (needed !== null) {
                html += ' <span style="color:#888;">(нужно: ' + needed + ')</span>';
            }
            html += '</div>';
            html += '</div>';
        });

        html += '</div>';
        panel.innerHTML = html;
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

        fetch(API_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ articles: articles })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            var quantities = parseQuantities(text);
            renderPanel(Array.isArray(data) ? data : [], quantities);
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
