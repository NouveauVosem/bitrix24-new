(function () {
    'use strict';

    var PANEL_ID  = 'cdh-panel';
    var AJAX_URL  = '/local/ajax/hierarchy.php';
    var CATALOG   = '/crm/catalog/14/product/';

    var _dealId     = null;
    var _items      = null; // null = not loaded yet
    var _articleMap = {};   // article → bitrix product ID

    function getDealId() {
        if (_dealId) return _dealId;
        var m = window.location.href.match(/crm\/deal\/details\/(\d+)/);
        _dealId = m ? m[1] : null;
        return _dealId;
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // ===== DATA =====

    function loadItems(callback) {
        var dealId = getDealId();
        if (!dealId) return;
        fetch(AJAX_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=get&dealId=' + encodeURIComponent(dealId)
        })
        .then(function (r) { return r.json(); })
        .then(function (resp) {
            _items = (resp.status === 'success') ? (resp.items || []) : [];
            if (callback) callback(_items);
        })
        .catch(function () {
            _items = [];
            if (callback) callback(_items);
        });
    }

    function saveItems(items, callback) {
        var dealId = getDealId();
        if (!dealId) return;
        fetch(AJAX_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=save&dealId=' + encodeURIComponent(dealId)
                + '&items=' + encodeURIComponent(JSON.stringify(items))
        })
        .then(function (r) { return r.json(); })
        .then(function (resp) { if (callback) callback(resp); })
        .catch(function () { if (callback) callback({ status: 'error' }); });
    }

    function resolveArticles(articles, callback) {
        var unknown = articles.filter(function (a) { return a && !_articleMap.hasOwnProperty(a); });
        if (unknown.length === 0) { callback(); return; }

        var dealId = getDealId();
        fetch(AJAX_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=resolve_articles&dealId=' + encodeURIComponent(dealId)
                + '&articles=' + encodeURIComponent(JSON.stringify(unknown))
        })
        .then(function (r) { return r.json(); })
        .then(function (resp) {
            if (resp.status === 'success') {
                Object.keys(resp.map || {}).forEach(function (a) {
                    _articleMap[a] = resp.map[a];
                });
            }
            // mark unknowns as resolved (even if not found) to avoid re-querying
            unknown.forEach(function (a) {
                if (!_articleMap.hasOwnProperty(a)) _articleMap[a] = null;
            });
            callback();
        })
        .catch(function () { callback(); });
    }

    // ===== RENDER =====

    function articleEl(article, extraStyle) {
        var el = document.createElement('span');
        el.style.cssText = extraStyle || '';
        var id = _articleMap[article];
        if (id) {
            var a = document.createElement('a');
            a.href = CATALOG + id + '/';
            a.target = '_blank';
            a.title = 'Открыть карточку товара';
            a.style.cssText = 'color:#1d4ed8;text-decoration:none;font-weight:600;';
            a.textContent = article;
            el.appendChild(a);
        } else {
            var s = document.createElement('span');
            s.style.fontWeight = '600';
            s.textContent = article || '—';
            el.appendChild(s);
        }
        return el;
    }

    function renderBody() {
        var body = document.getElementById('cdh-body');
        if (!body || !_items) return;

        if (_items.length === 0) {
            body.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:16px 8px;text-align:center;line-height:1.6;">'
                + 'Нет позиций.<br>Нажмите <b>+</b> чтобы добавить.</div>';
            return;
        }

        var allArticles = [];
        _items.forEach(function (item) {
            if (item.article) allArticles.push(item.article);
            (item.components || []).forEach(function (c) { if (c.article) allArticles.push(c.article); });
        });

        resolveArticles(allArticles, function () {
            body.innerHTML = '';

            _items.forEach(function (item, idx) {
                var card = document.createElement('div');
                card.style.cssText = 'margin-bottom:6px;border:1px solid #e5e7eb;border-radius:5px;overflow:hidden;';

                // --- header ---
                var hdr = document.createElement('div');
                hdr.style.cssText = 'display:flex;align-items:center;padding:7px 8px;background:#f8fafc;cursor:pointer;gap:5px;';

                var arrow = document.createElement('span');
                arrow.style.cssText = 'font-size:9px;color:#9ca3af;flex-shrink:0;transition:transform 0.15s;';
                arrow.textContent = '▼';

                var info = document.createElement('div');
                info.style.cssText = 'flex:1;min-width:0;';

                var artLine = document.createElement('div');
                artLine.style.cssText = 'display:flex;align-items:center;gap:5px;';
                artLine.appendChild(articleEl(item.article, 'font-size:12px;'));

                var qtyBadge = document.createElement('span');
                qtyBadge.style.cssText = 'font-size:10px;background:#dbeafe;color:#1d4ed8;padding:1px 5px;border-radius:8px;flex-shrink:0;';
                qtyBadge.textContent = '× ' + item.qty;
                artLine.appendChild(qtyBadge);

                var nameLine = document.createElement('div');
                nameLine.style.cssText = 'font-size:11px;color:#6b7280;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                nameLine.title = item.name;
                nameLine.textContent = item.name;

                info.appendChild(artLine);
                info.appendChild(nameLine);

                var delBtn = document.createElement('button');
                delBtn.title = 'Удалить';
                delBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#ef4444;font-size:13px;padding:2px 4px;flex-shrink:0;line-height:1;opacity:0.5;';
                delBtn.textContent = '✕';
                delBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    _items.splice(idx, 1);
                    saveItems(_items, function () { renderBody(); });
                });

                hdr.appendChild(arrow);
                hdr.appendChild(info);
                hdr.appendChild(delBtn);

                // --- components ---
                var comps = item.components || [];
                var compWrap = document.createElement('div');
                compWrap.style.cssText = 'padding:5px 8px 7px 20px;';

                comps.forEach(function (c, ci) {
                    var row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:5px;padding:3px 0;font-size:11px;'
                        + (ci < comps.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : '');

                    var connector = document.createElement('span');
                    connector.style.cssText = 'color:#d1d5db;flex-shrink:0;font-size:10px;';
                    connector.textContent = ci === comps.length - 1 ? '└' : '├';

                    var cInfo = document.createElement('div');
                    cInfo.style.cssText = 'flex:1;min-width:0;display:flex;align-items:center;gap:5px;';
                    cInfo.appendChild(articleEl(c.article, 'font-size:11px;'));

                    var cName = document.createElement('span');
                    cName.style.cssText = 'color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                    cName.title = c.name;
                    cName.textContent = c.name;
                    cInfo.appendChild(cName);

                    var cQty = document.createElement('span');
                    cQty.style.cssText = 'color:#9ca3af;flex-shrink:0;margin-left:auto;';
                    cQty.textContent = '× ' + c.qty;

                    row.appendChild(connector);
                    row.appendChild(cInfo);
                    row.appendChild(cQty);
                    compWrap.appendChild(row);
                });

                var collapsed = false;
                hdr.addEventListener('click', function () {
                    collapsed = !collapsed;
                    compWrap.style.display = collapsed ? 'none' : 'block';
                    arrow.style.transform = collapsed ? 'rotate(-90deg)' : '';
                });

                card.appendChild(hdr);
                if (comps.length > 0) card.appendChild(compWrap);
                body.appendChild(card);
            });
        });
    }

    // ===== PANEL INJECTION =====

    function insertPanel() {
        if (document.getElementById(PANEL_ID)) return;
        if (!getDealId()) return;

        var gridNode = document.body.querySelector('[id^="CCrmEntityProductListComponent"]');
        if (!gridNode) return;
        var gridParent = gridNode.parentElement;
        if (!gridParent) return;

        // flex wrapper
        var flex = document.createElement('div');
        flex.id = 'cdh-flex-wrapper';
        flex.style.cssText = 'display:flex;align-items:flex-start;';

        // panel
        var panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.cssText = 'width:270px;flex-shrink:0;border-right:2px solid #e5e7eb;background:#fff;';

        // panel header
        var panelHdr = document.createElement('div');
        panelHdr.style.cssText = [
            'display:flex;align-items:center;justify-content:space-between;',
            'padding:8px 10px;',
            'background:#1e40af;color:#fff;',
            'font-size:13px;font-weight:700;'
        ].join('');

        var title = document.createElement('span');
        title.textContent = 'Состав заказа';

        var btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:5px;';

        var addBtn = document.createElement('button');
        addBtn.title = 'Добавить товар';
        addBtn.style.cssText = 'background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.35);color:#fff;border-radius:3px;padding:1px 7px;cursor:pointer;font-size:14px;font-weight:700;line-height:1.4;';
        addBtn.textContent = '+';
        addBtn.addEventListener('click', function () {
            var dealId = getDealId();
            if (!dealId) return;
            var clientName = '';
            var titleEl = document.querySelector('#pagetitle');
            if (titleEl) {
                var t = (titleEl.textContent || '').trim();
                var idx = t.indexOf(' - ');
                clientName = idx !== -1 ? t.slice(idx + 3).trim() : t;
            }
            if (window.CrystalProductForms && window.CrystalProductForms.openFormsPicker) {
                window.CrystalProductForms.openFormsPicker(dealId, clientName);
            }
        });

        var refreshBtn = document.createElement('button');
        refreshBtn.title = 'Обновить';
        refreshBtn.style.cssText = 'background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.35);color:#fff;border-radius:3px;padding:1px 6px;cursor:pointer;font-size:12px;';
        refreshBtn.textContent = '↻';
        refreshBtn.addEventListener('click', function () {
            _items = null;
            loadItems(function () { renderBody(); });
        });

        btns.appendChild(addBtn);
        btns.appendChild(refreshBtn);
        panelHdr.appendChild(title);
        panelHdr.appendChild(btns);

        // panel body
        var panelBody = document.createElement('div');
        panelBody.id = 'cdh-body';
        panelBody.style.cssText = 'padding:6px;overflow-y:auto;max-height:70vh;';

        panel.appendChild(panelHdr);
        panel.appendChild(panelBody);

        // grid gets remaining space
        var gridWrap = document.createElement('div');
        gridWrap.style.cssText = 'flex:1;min-width:0;overflow-x:auto;';

        gridParent.insertBefore(flex, gridNode);
        flex.appendChild(panel);
        flex.appendChild(gridWrap);
        gridWrap.appendChild(gridNode);

        loadItems(function () { renderBody(); });
    }

    // ===== PUBLIC API =====

    function addItem(item, callback) {
        function doAdd(currentItems) {
            currentItems.push(item);
            saveItems(currentItems, function (resp) {
                renderBody();
                if (callback) callback(resp && resp.status === 'success');
            });
        }

        if (_items !== null) {
            doAdd(_items);
        } else {
            loadItems(function (items) { doAdd(items); });
        }
    }

    function refresh() {
        _items = null;
        loadItems(function () { renderBody(); });
    }

    window.CrystalHierarchyPanel = { addItem: addItem, refresh: refresh };

    // ===== INIT =====

    BX.ready(function () {
        if (!window.location.href.match(/crm\/deal\/details\/(\d+)/)) return;

        var observer = new MutationObserver(function () { insertPanel(); });
        observer.observe(document.body, { childList: true, subtree: true });
        insertPanel();
    });

})();
