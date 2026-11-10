BX.ready(function () {

    var dealMatch = window.location.href.match(/crm\/deal\/details\/(\d+)/);
    if (!dealMatch) {
        return;
    }

    var DEAL_ID  = dealMatch[1];
    var PANEL_ID = 'crystal-kit-sheet-panel';
    var API_URL  = '/local/ajax/crystal/kits/kit_sheet.php?dealId=' + DEAL_ID;
    var PDF_URL  = API_URL + '&format=pdf';

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function rowLabel(r) {
        return (r.article ? '<b>' + escapeHtml(r.article) + '</b> ' : '')
            + escapeHtml(r.name)
            + ' <span style="color:#888;">× ' + escapeHtml(r.quantity) + '</span>';
    }

    // ===== РЕНДЕР =====

    function renderResult(result, data) {
        var html = '';

        if (data.kitsCount > 0) {
            html += '<div style="margin-bottom:6px;color:#2c9e4b;">✓ Комплектов в листе: ' + data.kitsCount + '</div>'
                + '<a href="' + PDF_URL + '" target="_blank" style="font-size:12px;">📄 Открыть PDF</a>';

            // Чертежей в PDF нет — даём прямые ссылки (открываются без авторизации).
            var withDrawings = (data.kits || []).filter(function (k) { return k.drawings && k.drawings.length; });
            if (withDrawings.length > 0) {
                html += '<div style="margin-top:8px;font-weight:600;">Чертежи:</div>'
                    + withDrawings.map(function (k) {
                        return '<div style="margin-top:3px;">' + rowLabel(k) + '</div>'
                            + k.drawings.map(function (d) {
                                return '<div style="padding-left:10px;">📐 <a href="' + escapeHtml(d.url) + '" target="_blank">'
                                    + escapeHtml(d.name) + '</a></div>';
                            }).join('');
                    }).join('');
            }
        }

        if (data.missing && data.missing.length > 0) {
            var title = data.kitsCount > 0
                ? 'Нет сборочного комплекта (' + data.missing.length + '):'
                : 'Ни для одного товара нет сборочного комплекта:';
            html += '<div style="margin-top:8px;padding:6px 8px;background:#fff5f5;border-left:3px solid #e53e3e;border-radius:4px;">'
                + '<div style="font-weight:600;color:#e53e3e;margin-bottom:3px;">' + title + '</div>'
                + data.missing.map(function (r) { return '<div>' + rowLabel(r) + '</div>'; }).join('')
                + '</div>';
        }

        result.innerHTML = html;
    }

    // ===== ЗАГРУЗКА =====

    function buildSheet(btn, result) {
        btn.disabled = true;
        btn.textContent = '⌛ Формирую…';
        result.innerHTML = '';

        fetch(API_URL, { credentials: 'same-origin' })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.status !== 'success') {
                    throw new Error(data.message || 'Ошибка');
                }
                renderResult(result, data);
                // Сразу открываем PDF; если браузер заблокирует попап — остаётся ссылка в панели.
                if (data.kitsCount > 0) {
                    window.open(PDF_URL, '_blank');
                }
            })
            .catch(function (err) {
                result.innerHTML = '<div style="color:#e53e3e;">❌ ' + escapeHtml(err.message) + '</div>';
                console.error('[KitSheet]', err);
            })
            .then(function () {
                btn.disabled = false;
                btn.textContent = 'Сборочный лист';
            });
    }

    // ===== ВСТАВКА ПАНЕЛИ =====

    function insertPanel() {
        if (document.getElementById(PANEL_ID)) return;

        var sidebar = document.querySelector('.ui-entity-editor-column-content');
        if (!sidebar) return;

        var wrapper = document.createElement('div');
        wrapper.id = PANEL_ID;
        wrapper.style.cssText = 'padding:10px 15px 5px;font-size:12px;line-height:1.6;';

        var btn = document.createElement('button');
        btn.className = 'ui-btn ui-btn-primary ui-btn-xs';
        btn.textContent = 'Сборочный лист';

        var result = document.createElement('div');
        result.style.cssText = 'margin-top:6px;';

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            buildSheet(btn, result);
        });

        wrapper.appendChild(btn);
        wrapper.appendChild(result);
        sidebar.insertBefore(wrapper, sidebar.firstChild);
    }

    var observer = new MutationObserver(function () {
        insertPanel();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    insertPanel();

});
