(function () {
    'use strict';

    var PANEL_ID  = 'cdh-panel';
    var AJAX_URL  = '/local/ajax/crystal/hierarchy.php';
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
            var bitrixRows = (resp.bitrixRows || []).slice();

            // Авто-матчим rowId для элементов у которых его нет
            var usedRowIds = {};
            var changed = false;
            _items.forEach(function (item) {
                if (item.rowId) { usedRowIds[item.rowId] = true; }
            });
            _items.forEach(function (item) {
                if (item.rowId) return;
                var match = null;
                // Сначала по PRODUCT_ID (catalog ID)
                if (item.bitrixId) {
                    for (var i = 0; i < bitrixRows.length; i++) {
                        if (bitrixRows[i].productId === item.bitrixId && !usedRowIds[bitrixRows[i].rowId]) {
                            match = bitrixRows[i]; break;
                        }
                    }
                }
                // Fallback по имени (вхождение в любую сторону)
                if (!match && item.name) {
                    for (var i = 0; i < bitrixRows.length; i++) {
                        var bn = bitrixRows[i].productName || '';
                        var inn = item.name;
                        if (!usedRowIds[bitrixRows[i].rowId] &&
                            (bn === inn || bn.indexOf(inn) !== -1 || inn.indexOf(bn) !== -1)) {
                            match = bitrixRows[i]; break;
                        }
                    }
                }
                if (match) {
                    item.rowId = match.rowId;
                    usedRowIds[match.rowId] = true;
                    changed = true;
                }
            });
            if (changed) saveItems(_items, function () {});

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

    function reloadBitrixGrid() {
        var gridNode = document.querySelector('[id^="CCrmEntityProductListComponent"]');
        if (!gridNode) return;
        var grid = BX.Main.gridManager.getById(gridNode.id);
        if (!grid) return;
        if (typeof grid.reloadTable === 'function') grid.reloadTable();
        else if (typeof grid.reload === 'function') grid.reload();
        else if (typeof grid.refresh === 'function') grid.refresh();
        else console.log('[Hierarchy] grid methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(grid)));
    }

    function updateBitrixRow(rowId, productName, qty, price) {
        var dealId = getDealId();
        if (!dealId) return;
        if (!rowId && !productName) return;
        fetch('/local/ajax/crystal/update_deal_product_row.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'dealId=' + encodeURIComponent(dealId)
                + '&rowId=' + encodeURIComponent(rowId || 0)
                + '&productName=' + encodeURIComponent(productName || '')
                + '&price=' + encodeURIComponent(price || 0)
                + '&quantity=' + encodeURIComponent(qty || 1)
        })
        .then(function (r) { return r.json(); })
        .then(function (resp) {
            if (resp.status === 'success') {
                reloadBitrixGrid();
            } else {
                console.warn('[Hierarchy] Bitrix row update failed:', resp);
            }
        })
        .catch(function (e) { console.error('[Hierarchy] update_deal_product_row error:', e); });
    }

    // ===== RENDER =====

    function articleElDirect(article, bitrixId, extraStyle) {
        var el = document.createElement('span');
        el.style.cssText = extraStyle || '';
        if (bitrixId) {
            var a = document.createElement('a');
            a.href = CATALOG + bitrixId + '/';
            a.target = '_blank';
            a.title = 'Открыть карточку товара';
            a.style.cssText = 'color:#1d4ed8;text-decoration:none;font-weight:600;';
            a.textContent = article || String(bitrixId);
            el.appendChild(a);
        } else {
            var s = document.createElement('span');
            s.style.fontWeight = '600';
            s.textContent = article || '—';
            el.appendChild(s);
        }
        return el;
    }

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

        // resolveArticles нужен только для компонентов — у топ-айтемов теперь normArticle или bitrixId
        var allArticles = [];
        _items.forEach(function (item) {
            (item.components || []).forEach(function (c) {
                if (c.article) allArticles.push(c.article);
            });
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
                artLine.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;';
                artLine.appendChild(articleElDirect(item.article, item.bitrixId || null, 'font-size:12px;'));

                // editable qty input (styled as badge)
                var qtyInput = document.createElement('input');
                qtyInput.type = 'number';
                qtyInput.min = '1';
                qtyInput.value = item.qty || 1;
                qtyInput.title = 'Количество (редактировать)';
                qtyInput.style.cssText = [
                    'width:48px;font-size:10px;font-weight:700;',
                    'background:#dbeafe;color:#1d4ed8;',
                    'padding:1px 4px;border-radius:8px;',
                    'border:1px solid #93c5fd;text-align:center;',
                    'flex-shrink:0;'
                ].join('');

                var qtyTimer = null;
                qtyInput.addEventListener('click', function (e) { e.stopPropagation(); });
                qtyInput.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') qtyInput.blur();
                });
                qtyInput.addEventListener('input', function () {
                    var newQty = Math.max(1, parseInt(qtyInput.value) || 1);
                    _items[idx].qty = newQty;
                    (_items[idx].components || []).forEach(function (c, ci) {
                        if (c.baseQty !== undefined) {
                            c.qty = newQty * c.baseQty;
                            var cQtyEl = compWrap.querySelector('[data-comp-idx="' + ci + '"]');
                            if (cQtyEl) cQtyEl.textContent = '× ' + c.qty;
                        }
                    });
                    clearTimeout(qtyTimer);
                    qtyTimer = setTimeout(function () {
                        qtyInput.value = newQty;
                        saveItems(_items, function () {});
                        updateBitrixRow(item.rowId || 0, item.name, newQty, _items[idx].price || 0);
                    }, 600);
                });

                artLine.appendChild(qtyInput);

                // editable price input
                var priceWrap = document.createElement('span');
                priceWrap.style.cssText = 'display:inline-flex;align-items:center;gap:2px;flex-shrink:0;';

                var priceInput = document.createElement('input');
                priceInput.type = 'number';
                priceInput.min = '0';
                priceInput.step = '0.01';
                priceInput.value = item.price || '';
                priceInput.placeholder = '0';
                priceInput.title = 'Цена (редактировать)';
                priceInput.style.cssText = [
                    'width:64px;font-size:10px;',
                    'background:#f0fdf4;color:#166534;',
                    'padding:1px 4px;border-radius:8px;',
                    'border:1px solid #86efac;text-align:right;'
                ].join('');

                var priceTimer = null;
                priceInput.addEventListener('click', function (e) { e.stopPropagation(); });
                priceInput.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') priceInput.blur();
                });
                priceInput.addEventListener('input', function () {
                    var newPrice = Math.max(0, parseFloat(priceInput.value) || 0);
                    _items[idx].price = newPrice;
                    clearTimeout(priceTimer);
                    priceTimer = setTimeout(function () {
                        priceInput.value = newPrice || '';
                        saveItems(_items, function () {});
                        updateBitrixRow(item.rowId || 0, item.name, _items[idx].qty || 1, newPrice);
                    }, 600);
                });

                var priceUnit = document.createElement('span');
                priceUnit.style.cssText = 'font-size:10px;color:#166534;';
                priceUnit.textContent = 'EUR';

                priceWrap.appendChild(priceInput);
                priceWrap.appendChild(priceUnit);
                artLine.appendChild(priceWrap);

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
                    var dealId = getDealId();
                    var rowId  = item.rowId || 0;
                    var name   = item.name  || '';
                    _items.splice(idx, 1);
                    saveItems(_items, function () { renderBody(); });
                    if (dealId && rowId) {
                        fetch('/local/ajax/crystal/delete_deal_product_row.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: 'dealId=' + encodeURIComponent(dealId)
                                + '&rowId=' + encodeURIComponent(rowId)
                        })
                        .then(function (r) { return r.json(); })
                        .then(function (resp) {
                            if (resp.status === 'success') {
                                reloadBitrixGrid();
                            } else {
                                console.warn('[Hierarchy] delete row failed:', resp);
                            }
                        })
                        .catch(function (e) { console.error('[Hierarchy] delete_deal_product_row error:', e); });
                    }
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
                    cInfo.appendChild(articleElDirect(c.article, c.bitrixId, 'font-size:11px;'));

                    var cName = document.createElement('span');
                    cName.style.cssText = 'color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                    cName.title = c.name;
                    cName.textContent = c.name;
                    cInfo.appendChild(cName);

                    var cQty = document.createElement('span');
                    cQty.dataset.compIdx = ci;
                    cQty.style.cssText = 'color:#9ca3af;flex-shrink:0;margin-left:auto;';
                    cQty.textContent = '× ' + c.qty;

                    row.appendChild(connector);
                    row.appendChild(cInfo);
                    row.appendChild(cQty);
                    compWrap.appendChild(row);
                });

                var collapsed = false;
                hdr.addEventListener('click', function () {
                    if (comps.length === 0) return;
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

    function updateItemRowId(itemId, rowId) {
        if (!_items) return;
        for (var i = 0; i < _items.length; i++) {
            if (_items[i].id === itemId) {
                _items[i].rowId = rowId;
                saveItems(_items, function () {});
                renderBody();
                break;
            }
        }
    }

    function refresh() {
        _items = null;
        loadItems(function () { renderBody(); });
    }

    window.CrystalHierarchyPanel = { addItem: addItem, updateItemRowId: updateItemRowId, refresh: refresh };

    // ===== INIT =====

    BX.ready(function () {
        if (!window.location.href.match(/crm\/deal\/details\/(\d+)/)) return;

        var observer = new MutationObserver(function () { insertPanel(); });
        observer.observe(document.body, { childList: true, subtree: true });
        insertPanel();
    });

})();
