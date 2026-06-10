(function () {
    'use strict';

    var PANEL_ID  = 'cdh-panel';
    var AJAX_URL  = '/local/ajax/crystal/hierarchy.php';
    var CATALOG   = '/crm/catalog/14/product/';

    var _dealId     = null;
    var _items      = null; // null = not loaded yet
    var _currency   = 'EUR';
    var _articleMap = {};   // article → bitrix product ID

    function getDealId() {
        if (_dealId) return _dealId;
        var m = window.location.href.match(/crm\/deal\/details\/(\d+)/);
        _dealId = m ? m[1] : null;
        return _dealId;
    }

    function getClientName() {
        var titleEl = document.querySelector('#pagetitle');
        if (!titleEl) return '';
        var t = (titleEl.textContent || '').trim();
        var idx = t.indexOf(' - ');
        return idx !== -1 ? t.slice(idx + 3).trim() : t;
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
            _items    = (resp.status === 'success') ? (resp.items || []) : [];
            _currency = resp.currency || 'EUR';
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
            body.innerHTML = '<div style="color:#9ca3af;font-size:14px;padding:12px 16px;line-height:1.6;">'
                + 'Нет позиций. Нажмите <b>+</b> чтобы добавить.</div>';
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
                card.style.cssText = 'width:240px;flex-shrink:0;border:1px solid #e5e7eb;border-radius:5px;overflow:hidden;';

                // --- header ---
                var hdr = document.createElement('div');
                hdr.style.cssText = 'display:flex;align-items:center;padding:7px 8px;background:#f8fafc;cursor:pointer;gap:5px;';

                var arrow = document.createElement('span');
                arrow.style.cssText = 'font-size:14px;color:#9ca3af;flex-shrink:0;transition:transform 0.15s;';
                arrow.textContent = '▼';

                var info = document.createElement('div');
                info.style.cssText = 'flex:1;min-width:0;';

                var artLine = document.createElement('div');
                artLine.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;';
                artLine.appendChild(articleElDirect(item.article, item.bitrixId || null, 'font-size:14px;'));

                // editable qty input (styled as badge)
                var qtyInput = document.createElement('input');
                qtyInput.type = 'number';
                qtyInput.min = '1';
                qtyInput.value = item.qty || 1;
                qtyInput.title = 'Количество (редактировать)';
                qtyInput.style.cssText = [
                    'width:48px;font-size:14px;font-weight:700;',
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
                    'width:64px;font-size:14px;',
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
                priceUnit.style.cssText = 'font-size:14px;color:#166534;';
                priceUnit.textContent = _currency;

                priceWrap.appendChild(priceInput);
                priceWrap.appendChild(priceUnit);
                artLine.appendChild(priceWrap);

                var nameLine = item.bitrixId ? document.createElement('a') : document.createElement('div');
                if (item.bitrixId) {
                    nameLine.href   = CATALOG + item.bitrixId + '/';
                    nameLine.target = '_blank';
                    nameLine.addEventListener('click', function (e) { e.stopPropagation(); });
                }
                nameLine.style.cssText = 'font-size:14px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none;'
                    + (item.bitrixId ? 'color:#1d4ed8;' : 'color:#6b7280;');
                nameLine.title = item.name;
                nameLine.textContent = item.name;

                info.appendChild(artLine);
                info.appendChild(nameLine);

                var delBtn = document.createElement('button');
                delBtn.title = 'Удалить';
                delBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#ef4444;font-size:15px;padding:2px 4px;flex-shrink:0;line-height:1;opacity:0.5;';
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

                var crystalBtn = document.createElement('button');
                crystalBtn.title = 'Crystal параметры';
                crystalBtn.style.cssText = [
                    'background:none;border:1px solid #bfdbfe;',
                    'color:#1d4ed8;border-radius:4px;',
                    'font-size:11px;font-weight:700;padding:2px 6px;',
                    'cursor:pointer;flex-shrink:0;line-height:1.4;'
                ].join('');
                crystalBtn.textContent = '⚙';
                crystalBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (window.CrystalProductParams) {
                        window.CrystalProductParams.open(item.baseArticle || item.article || '', item.name || '', item.bitrixId || 0);
                    }
                });

                if (item.normId) {
                    var calcItemBtn = document.createElement('button');
                    calcItemBtn.title = 'Отправить на просчёт';
                    calcItemBtn.style.cssText = [
                        'background:none;border:1px solid #86efac;',
                        'color:#16a34a;border-radius:4px;',
                        'font-size:11px;font-weight:700;padding:2px 6px;',
                        'cursor:pointer;flex-shrink:0;line-height:1.4;'
                    ].join('');
                    calcItemBtn.textContent = '↗';
                    calcItemBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        calcItemBtn.disabled = true;
                        calcItemBtn.textContent = '⧗';
                        fetch('https://crystal.alvla.tools/api/price-calculations/from-form-norm', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'legenda' },
                            body: JSON.stringify({
                                formNormId: item.normId,
                                dealId: getDealId(),
                                clientName: getClientName(),
                                quantity: item.qty || 1
                            })
                        })
                        .then(function (r) { return r.json(); })
                        .then(function (resp) {
                            if (resp.status === 'created' || resp.id) {
                                calcItemBtn.textContent = '✓';
                                calcItemBtn.style.color = '#16a34a';
                                setTimeout(function () {
                                    calcItemBtn.textContent = '↗';
                                    calcItemBtn.disabled = false;
                                }, 2500);
                            } else {
                                calcItemBtn.textContent = '✕';
                                calcItemBtn.style.color = '#dc2626';
                                calcItemBtn.title = resp.message || 'Ошибка';
                                setTimeout(function () {
                                    calcItemBtn.textContent = '↗';
                                    calcItemBtn.style.color = '#16a34a';
                                    calcItemBtn.disabled = false;
                                }, 3000);
                            }
                        })
                        .catch(function () {
                            calcItemBtn.textContent = '✕';
                            calcItemBtn.style.color = '#dc2626';
                            setTimeout(function () {
                                calcItemBtn.textContent = '↗';
                                calcItemBtn.style.color = '#16a34a';
                                calcItemBtn.disabled = false;
                            }, 3000);
                        });
                    });
                    hdr.appendChild(arrow);
                    hdr.appendChild(info);
                    hdr.appendChild(calcItemBtn);
                    hdr.appendChild(crystalBtn);
                    hdr.appendChild(delBtn);
                } else {
                    hdr.appendChild(arrow);
                    hdr.appendChild(info);
                    hdr.appendChild(crystalBtn);
                    hdr.appendChild(delBtn);
                }

                // --- components ---
                var comps = item.components || [];
                var compWrap = document.createElement('div');
                compWrap.style.cssText = 'padding:5px 8px 7px 20px;';

                comps.forEach(function (c, ci) {
                    var row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:flex-start;gap:5px;padding:4px 0;'
                        + (ci < comps.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : '');

                    var connector = document.createElement('span');
                    connector.style.cssText = 'color:#d1d5db;flex-shrink:0;font-size:14px;padding-top:2px;';
                    connector.textContent = ci === comps.length - 1 ? '└' : '├';

                    var inner = document.createElement('div');
                    inner.style.cssText = 'flex:1;min-width:0;';

                    if (c.slotName) {
                        var slotLabel = document.createElement('div');
                        slotLabel.style.cssText = 'font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;line-height:1.4;';
                        slotLabel.textContent = c.slotName;
                        inner.appendChild(slotLabel);
                    }

                    var dataRow = document.createElement('div');
                    dataRow.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:14px;';
                    dataRow.appendChild(articleElDirect(c.article, c.bitrixId, 'font-size:14px;'));

                    var cName = document.createElement('span');
                    cName.style.cssText = 'color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                    cName.title = c.name;
                    cName.textContent = c.name;
                    dataRow.appendChild(cName);

                    var cQty = document.createElement('span');
                    cQty.dataset.compIdx = ci;
                    cQty.style.cssText = 'color:#9ca3af;flex-shrink:0;margin-left:auto;';
                    cQty.textContent = '× ' + c.qty;
                    dataRow.appendChild(cQty);

                    inner.appendChild(dataRow);
                    row.appendChild(connector);
                    row.appendChild(inner);
                    compWrap.appendChild(row);
                });

                var collapsed = false;
                hdr.addEventListener('click', function (e) {
                    if (e.target.tagName === 'A' || e.target.closest('a')) return;
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

        // panel
        var panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.cssText = 'border-top:2px solid #e5e7eb;background:#fff;';

        // panel header
        var panelHdr = document.createElement('div');
        panelHdr.style.cssText = [
            'display:flex;align-items:center;justify-content:space-between;',
            'padding:8px 10px;',
            'background:#1e40af;color:#fff;',
            'font-size:15px;font-weight:700;'
        ].join('');

        var title = document.createElement('span');
        title.textContent = 'Состав заказа';

        var btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:5px;';

        var calcBtn = document.createElement('button');
        calcBtn.title = 'Отправить на просчёт в Crystal';
        calcBtn.style.cssText = 'background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.35);color:#fff;border-radius:3px;padding:1px 8px;cursor:pointer;font-size:13px;font-weight:600;line-height:1.4;white-space:nowrap;';
        calcBtn.textContent = 'Просчёт';
        calcBtn.addEventListener('click', function () {
            var items = _items ? _items.filter(function (i) { return i.normId; }) : [];
            if (items.length === 0) {
                showCalcStatus('Нет позиций с нормой для просчёта', '#dc2626');
                return;
            }
            calcBtn.disabled = true;
            calcBtn.textContent = '⧗ Отправка...';

            var dealId = getDealId();
            var clientName = getClientName();
            var promises = items.map(function (item) {
                return fetch('https://crystal.alvla.tools/api/price-calculations/from-form-norm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'legenda' },
                    body: JSON.stringify({
                        formNormId: item.normId,
                        dealId: dealId,
                        clientName: clientName,
                        quantity: item.qty || 1
                    })
                })
                .then(function (r) { return r.json(); })
                .then(function (resp) { return { item: item, resp: resp }; })
                .catch(function (e) { return { item: item, error: e.message || 'Ошибка сети' }; });
            });

            Promise.all(promises).then(function (results) {
                calcBtn.disabled = false;
                calcBtn.textContent = 'Просчёт';
                var errors = results.filter(function (r) { return r.error || (r.resp && r.resp.status === 'error'); });
                if (errors.length === 0) {
                    showCalcStatus('✓ ' + results.length + ' просчёт(ов) создано', '#16a34a');
                } else {
                    var msg = errors.map(function (r) {
                        return (r.item.article || r.item.name || '?') + ': ' + (r.error || (r.resp && r.resp.message) || 'ошибка');
                    }).join('; ');
                    showCalcStatus('Ошибка: ' + msg, '#dc2626');
                }
            });
        });

        function showCalcStatus(text, color) {
            var existing = document.getElementById('cdh-calc-status');
            if (existing) existing.remove();
            var s = document.createElement('div');
            s.id = 'cdh-calc-status';
            s.style.cssText = 'padding:4px 10px;font-size:13px;background:#1e3a8a;color:' + color + ';border-top:1px solid rgba(255,255,255,0.1);';
            s.textContent = text;
            panelHdr.parentNode.insertBefore(s, panelHdr.nextSibling);
            setTimeout(function () { if (s.parentNode) s.remove(); }, 4000);
        }

        var addBtn = document.createElement('button');
        addBtn.title = 'Добавить товар';
        addBtn.style.cssText = 'background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.35);color:#fff;border-radius:3px;padding:1px 7px;cursor:pointer;font-size:16px;font-weight:700;line-height:1.4;';
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
        refreshBtn.style.cssText = 'background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.35);color:#fff;border-radius:3px;padding:1px 6px;cursor:pointer;font-size:14px;';
        refreshBtn.textContent = '↻';
        refreshBtn.addEventListener('click', function () {
            _items = null;
            loadItems(function () { renderBody(); });
        });

        btns.id = 'cdh-header-btns';
        btns.appendChild(calcBtn);
        btns.appendChild(addBtn);
        btns.appendChild(refreshBtn);
        panelHdr.appendChild(title);
        panelHdr.appendChild(btns);

        // panel body
        var panelBody = document.createElement('div');
        panelBody.id = 'cdh-body';
        panelBody.style.cssText = 'padding:8px;display:flex;flex-wrap:wrap;gap:8px;overflow-x:auto;';

        panel.appendChild(panelHdr);
        panel.appendChild(panelBody);

        gridNode.parentNode.insertBefore(panel, gridNode.nextSibling);

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

    window.CrystalHierarchyPanel = { addItem: addItem, updateItemRowId: updateItemRowId, refresh: refresh, getItems: function () { return _items ? _items.slice() : []; } };

    // ===== INIT =====

    BX.ready(function () {
        if (!window.location.href.match(/crm\/deal\/details\/(\d+)/)) return;

        var observer = new MutationObserver(function () { insertPanel(); });
        observer.observe(document.body, { childList: true, subtree: true });
        insertPanel();
    });

})();
