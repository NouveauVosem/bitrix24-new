(function () {
    'use strict';

    var CRYSTAL_BASE = 'https://crystal.alvla.tools';
    var API_KEY = 'legenda';
    var PANEL_ID = 'cpf-forms-panel';

    // ===== ARTICLE EXTRACTION =====

    function extractArticleFromRow(rowNode, productName) {
        var cells = rowNode.cells || rowNode.children;
        for (var i = 0; i < cells.length; i++) {
            var dn = (cells[i].getAttribute('data-name') || '').toUpperCase();
            if (dn === 'ARTNUMBER' || dn === 'PROPERTY_ARTNUMBER' || dn === 'SKU') {
                var cellText = (cells[i].textContent || '').trim();
                if (cellText) return cellText;
            }
        }
        var match = productName.match(/\d+\.\d+\.\d+/);
        if (match) return match[0];
        return productName;
    }

    // ===== CONFIGURATOR MODAL =====

    function openConfigurator(form, productName, initialQty, dealId, clientName, presetNorm) {
        var existing = document.getElementById('cpf-modal-overlay');
        if (existing) existing.remove();

        var qty = Math.max(1, parseInt(initialQty) || 1);
        var selectedOptions = {};

        var slots = (form.slots || []).slice().sort(function (a, b) {
            return (a.order || 0) - (b.order || 0);
        });

        slots.forEach(function (slot) {
            selectedOptions[slot.id] = (slot.options && slot.options.length > 0)
                ? slot.options[0]
                : null;
        });

        if (presetNorm && presetNorm.slotSelections) {
            slots.forEach(function (slot) {
                var selId = String(presetNorm.slotSelections[String(slot.id)] || '');
                if (!selId) return;
                var found = null;
                (slot.options || []).forEach(function (o) {
                    if (String(o.id) === selId) found = o;
                });
                selectedOptions[slot.id] = found;
            });
        }

        // overlay
        var overlay = document.createElement('div');
        overlay.id = 'cpf-modal-overlay';
        overlay.style.cssText = [
            'position:fixed;top:0;left:0;right:0;bottom:0;',
            'background:rgba(0,0,0,0.45);z-index:99999;',
            'display:flex;align-items:center;justify-content:center;'
        ].join('');

        // modal box
        var modal = document.createElement('div');
        modal.style.cssText = [
            'background:#fff;border-radius:8px;padding:24px;',
            'max-width:560px;width:90vw;',
            'max-height:85vh;overflow-y:auto;',
            'position:relative;box-shadow:0 8px 40px rgba(0,0,0,0.2);'
        ].join('');

        var closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'position:absolute;top:14px;right:14px;background:none;border:none;font-size:18px;cursor:pointer;color:#999;padding:4px 8px;line-height:1;';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', function () { overlay.remove(); });

        var title = document.createElement('div');
        title.style.cssText = 'font-size:15px;font-weight:700;color:#222;margin-bottom:16px;padding-right:30px;';
        title.textContent = 'Конфигуратор: ' + form.name;

        // quantity row
        var qtyRow = document.createElement('div');
        qtyRow.style.cssText = [
            'display:flex;align-items:center;gap:10px;margin-bottom:20px;',
            'padding:12px 14px;background:#f5f7fa;border-radius:6px;border-left:3px solid #3b82f6;'
        ].join('');

        var qtyLabel = document.createElement('span');
        qtyLabel.style.cssText = 'font-size:13px;font-weight:600;color:#333;flex:1;min-width:0;word-break:break-word;';
        qtyLabel.textContent = productName;

        var qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.min = '1';
        qtyInput.value = qty;
        qtyInput.style.cssText = 'width:64px;padding:5px 8px;border:1px solid #ccc;border-radius:4px;text-align:center;font-size:14px;font-weight:600;flex-shrink:0;';

        var qtyUnit = document.createElement('span');
        qtyUnit.style.cssText = 'color:#666;font-size:13px;flex-shrink:0;';
        qtyUnit.textContent = 'шт';

        qtyRow.appendChild(qtyLabel);
        qtyRow.appendChild(qtyInput);
        qtyRow.appendChild(qtyUnit);

        // slots
        var slotsContainer = document.createElement('div');
        slotsContainer.style.marginBottom = '10px';

        var currentNorm = null;
        var normCheckTimer = null;

        var normStatus = document.createElement('div');
        normStatus.style.cssText = 'margin-bottom:10px;padding:7px 10px;border-radius:5px;font-size:11px;display:none;';

        function getCurrentQty() {
            return Math.max(1, parseInt(qtyInput.value) || 1);
        }

        function getSlotSelections() {
            var sel = {};
            slots.forEach(function (slot) {
                var opt = selectedOptions[slot.id];
                if (opt && opt.id !== '__none__') sel[slot.id] = opt.id;
            });
            return sel;
        }

        function checkNorm() {
            if (!form.id || !form.article) { normStatus.style.display = 'none'; return; }
            clearTimeout(normCheckTimer);
            normStatus.style.display = 'block';
            normStatus.style.cssText += 'background:#f9fafb;border:1px solid #e5e7eb;color:#9ca3af;';
            normStatus.textContent = 'Проверка нормы...';
            normCheckTimer = setTimeout(function () {
                fetch(CRYSTAL_BASE + '/api/product-form-norms/find', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
                    body: JSON.stringify({ templateId: form.id, slotSelections: getSlotSelections() })
                })
                .then(function (r) { return r.json(); })
                .then(function (resp) {
                    currentNorm = resp.norm || null;
                    if (resp.found) {
                        var priceText = resp.norm.draftPrice
                            ? ' · ' + parseFloat(resp.norm.draftPrice).toFixed(2) + ' EUR (черн.)'
                            : ' · цена не задана';
                        normStatus.style.cssText = 'margin-bottom:10px;padding:7px 10px;border-radius:5px;font-size:11px;display:block;background:#f0fdf4;border:1px solid #86efac;color:#166534;font-weight:600;';
                        normStatus.textContent = '✓ Норма: ' + resp.norm.article + priceText;
                        if (resp.norm.draftPrice && !priceInput.value) {
                            priceInput.value = parseFloat(resp.norm.draftPrice).toFixed(2);
                        }
                    } else {
                        normStatus.style.cssText = 'margin-bottom:10px;padding:7px 10px;border-radius:5px;font-size:11px;display:block;background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280;';
                        normStatus.textContent = 'Будет создана новая норма: ' + form.article + '.XXXX';
                    }
                })
                .catch(function () { normStatus.style.display = 'none'; });
            }, 500);
        }

        function buildSlots() {
            slotsContainer.innerHTML = '';

            if (slots.length === 0) {
                var noSlots = document.createElement('div');
                noSlots.style.cssText = 'color:#888;font-size:12px;text-align:center;padding:12px;';
                noSlots.textContent = 'У этой формы нет слотов';
                slotsContainer.appendChild(noSlots);
                return;
            }

            slots.forEach(function (slot) {
                var card = document.createElement('div');
                card.style.cssText = 'margin-bottom:10px;padding:12px;border:1px solid #e5e7eb;border-radius:6px;';

                var header = document.createElement('div');
                header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;';

                var slotName = document.createElement('span');
                slotName.style.cssText = 'font-size:13px;font-weight:600;color:#111;';
                slotName.textContent = slot.name;

                var badge = document.createElement('span');
                badge.style.cssText = 'font-size:10px;padding:2px 7px;border-radius:10px;font-weight:600;flex-shrink:0;' +
                    (slot.required
                        ? 'background:#fef3c7;color:#92400e;'
                        : 'background:#dcfce7;color:#166534;');
                badge.textContent = slot.required ? 'Обязательный' : 'Опциональный';

                header.appendChild(slotName);
                header.appendChild(badge);

                var optsDiv = document.createElement('div');
                optsDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;';

                var opts = (slot.options || []).slice();
                if (!slot.required) {
                    opts.push({ id: '__none__', article: null, name: 'Не включать' });
                }

                opts.forEach(function (opt) {
                    var isSelected = selectedOptions[slot.id]
                        ? selectedOptions[slot.id].id === opt.id
                        : opt.id === '__none__';

                    var label = document.createElement('label');
                    label.style.cssText = [
                        'display:inline-flex;align-items:center;gap:5px;cursor:pointer;',
                        'padding:5px 10px;border-radius:4px;font-size:12px;user-select:none;',
                        'border:1px solid ' + (isSelected ? '#3b82f6' : '#d1d5db') + ';',
                        'background:' + (isSelected ? '#eff6ff' : '#fff') + ';',
                        'color:' + (isSelected ? '#1d4ed8' : '#374151') + ';'
                    ].join('');

                    var radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = 'cpf-slot-' + slot.id;
                    radio.value = opt.id;
                    radio.style.cssText = 'margin:0;accent-color:#3b82f6;';
                    if (isSelected) radio.checked = true;

                    radio.addEventListener('change', function () {
                        selectedOptions[slot.id] = (opt.id === '__none__') ? null : opt;
                        buildSlots();
                    });

                    var optText = document.createElement('span');
                    optText.textContent = opt.name;

                    label.appendChild(radio);
                    label.appendChild(optText);
                    optsDiv.appendChild(label);
                });

                var qtyInfo = document.createElement('div');
                qtyInfo.style.cssText = 'font-size:11px;margin-top:2px;';

                var sel = selectedOptions[slot.id];
                if (sel) {
                    var total = getCurrentQty() * slot.quantityPerUnit;
                    qtyInfo.style.color = '#6b7280';
                    qtyInfo.textContent = 'Количество: ' + total + ' шт (' + getCurrentQty() + ' \xd7 ' + slot.quantityPerUnit + ')';
                } else {
                    qtyInfo.style.color = '#9ca3af';
                    qtyInfo.textContent = 'Не включается в расчёт';
                }

                card.appendChild(header);
                card.appendChild(optsDiv);
                card.appendChild(qtyInfo);
                slotsContainer.appendChild(card);
            });
            checkNorm();
        }

        qtyInput.addEventListener('input', buildSlots);
        buildSlots();

        // price row
        var priceRow = document.createElement('div');
        priceRow.style.cssText = [
            'display:flex;align-items:center;gap:10px;',
            'padding:12px 14px;background:#f0fdf4;',
            'border-radius:6px;border-left:3px solid #16a34a;margin-top:10px;'
        ].join('');

        var priceLabel = document.createElement('span');
        priceLabel.style.cssText = 'font-size:13px;font-weight:600;color:#333;flex:1;';
        priceLabel.textContent = 'Цена за весь комплект';

        var priceInput = document.createElement('input');
        priceInput.type = 'number';
        priceInput.min = '0';
        priceInput.step = '0.01';
        priceInput.placeholder = '0.00';
        priceInput.style.cssText = 'width:100px;padding:5px 8px;border:1px solid #ccc;border-radius:4px;text-align:right;font-size:14px;font-weight:600;flex-shrink:0;';
        if (presetNorm && presetNorm.draftPrice) {
            priceInput.value = parseFloat(presetNorm.draftPrice).toFixed(2);
        }

        var priceCurrency = document.createElement('span');
        priceCurrency.style.cssText = 'color:#666;font-size:13px;flex-shrink:0;';
        priceCurrency.textContent = 'EUR';

        priceRow.appendChild(priceLabel);
        priceRow.appendChild(priceInput);
        priceRow.appendChild(priceCurrency);

        // footer
        var footer = document.createElement('div');
        footer.style.cssText = 'border-top:1px solid #e5e7eb;padding-top:16px;margin-top:4px;';

        var submitBtn = document.createElement('button');
        submitBtn.className = 'ui-btn ui-btn-success ui-btn-sm';
        submitBtn.style.cssText = 'width:100%;';
        submitBtn.textContent = 'Добавить в заказ';

        var submitStatus = document.createElement('div');
        submitStatus.style.cssText = 'font-size:12px;text-align:center;margin-top:8px;min-height:16px;';

        submitBtn.addEventListener('click', function () {
            var currentQty = getCurrentQty();
            var currentPrice = parseFloat(priceInput.value) || 0;
            var components = [];

            slots.forEach(function (slot) {
                var opt = selectedOptions[slot.id];
                if (opt && opt.id !== '__none__') {
                    components.push({
                        article: opt.article || '',
                        name: opt.name,
                        qty: currentQty * slot.quantityPerUnit,
                        baseQty: slot.quantityPerUnit,
                        bitrixId: opt.bitrixId || null
                    });
                }
            });

            var normSlotSnapshot = slots
                .filter(function (slot) {
                    var opt = selectedOptions[slot.id];
                    return opt && opt.id !== '__none__';
                })
                .map(function (slot) {
                    var opt = selectedOptions[slot.id];
                    return { slotId: String(slot.id), slotName: slot.name, optionId: String(opt.id), optionName: opt.name };
                });

            submitBtn.disabled = true;
            submitBtn.textContent = '⧗ Добавляю...';
            submitStatus.style.color = '#6b7280';
            submitStatus.textContent = '';

            function saveToHierarchy(normId, normArticle) {
                var newItem = {
                    id: 'item_' + Date.now(),
                    article: normArticle || form.article || '',
                    name: productName,
                    qty: currentQty,
                    price: currentPrice,
                    normId: normId || null,
                    slotSnapshot: normSlotSnapshot,
                    components: components
                };

                function onHierarchyDone(ok) {
                if (!ok) {
                    submitBtn.textContent = '❌ Ошибка сохранения';
                    submitBtn.disabled = false;
                    submitStatus.style.color = '#dc2626';
                    submitStatus.textContent = 'Попробуйте ещё раз';
                    return;
                }

                // Если цена указана — пишем в строки товаров сделки
                if (currentPrice > 0 && dealId) {
                    var body = 'dealId=' + encodeURIComponent(dealId)
                        + '&productName=' + encodeURIComponent(productName)
                        + '&article=' + encodeURIComponent(form.article || '')
                        + '&bitrixProductId=' + encodeURIComponent(form.bitrixId || 0)
                        + '&quantity=' + encodeURIComponent(currentQty)
                        + '&price=' + encodeURIComponent(currentPrice);

                    fetch('/local/ajax/add_deal_product.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: body
                    })
                    .then(function (r) { return r.json(); })
                    .then(function (resp) {
                        // Сохраняем rowId строки сделки в иерархии
                        if (resp.status === 'success' && resp.rowId) {
                            newItem.rowId = resp.rowId;
                            if (window.CrystalHierarchyPanel) {
                                window.CrystalHierarchyPanel.updateItemRowId(newItem.id, resp.rowId);
                            }
                        }
                        submitBtn.textContent = '✅ Добавлено';
                        submitStatus.style.color = '#16a34a';
                        submitStatus.textContent = '';
                        setTimeout(function () { overlay.remove(); }, 1500);
                    })
                    .catch(function () {
                        submitBtn.textContent = '✅ В иерархии';
                        submitStatus.style.color = '#f59e0b';
                        submitStatus.textContent = 'Ошибка записи в товары сделки';
                        setTimeout(function () { overlay.remove(); }, 2000);
                    });
                } else {
                    submitBtn.textContent = '✅ Добавлено';
                    submitStatus.style.color = '#16a34a';
                    submitStatus.textContent = '';
                    setTimeout(function () { overlay.remove(); }, 1500);
                }
            }

                if (window.CrystalHierarchyPanel) {
                    window.CrystalHierarchyPanel.addItem(newItem, onHierarchyDone);
                } else {
                    onHierarchyDone(true);
                }
            }

            // findOrCreate norm, then save
            if (form.id && form.article) {
                var normComponents = components.map(function (c) {
                    return { article: c.article, name: c.name, baseQty: c.baseQty, bitrixId: c.bitrixId };
                });
                fetch(CRYSTAL_BASE + '/api/product-form-norms/findOrCreate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
                    body: JSON.stringify({
                        baseNormArticle: form.article,
                        templateId: form.id,
                        name: productName,
                        slotSelections: getSlotSelections(),
                        components: normComponents,
                        slotSnapshot: normSlotSnapshot,
                        draftPrice: currentPrice || null
                    })
                })
                .then(function (r) { return r.json(); })
                .then(function (resp) {
                    var n = resp.norm;
                    saveToHierarchy(n ? n.id : null, n ? n.article : null);
                })
                .catch(function () { saveToHierarchy(null, null); });
            } else {
                saveToHierarchy(null, null);
            }
        });

        footer.appendChild(submitBtn);
        footer.appendChild(submitStatus);

        modal.appendChild(closeBtn);
        modal.appendChild(title);
        modal.appendChild(qtyRow);
        modal.appendChild(slotsContainer);
        modal.appendChild(normStatus);
        modal.appendChild(priceRow);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });

        document.body.appendChild(overlay);
    }

    // ===== FORMS LIST PANEL =====

    function getClientNameForPanel() {
        var el = document.querySelector('#pagetitle');
        if (!el) return '';
        var text = (el.textContent || '').trim();
        var idx = text.indexOf(' - ');
        return idx !== -1 ? text.slice(idx + 3).trim() : text;
    }

    function openFormFromPanel(form, dealId, clientName, presetNorm) {
        var cn = clientName || getClientNameForPanel();
        var hasFullData = form.slots && Array.isArray(form.slots) &&
            form.slots.length > 0 && form.slots[0].options !== undefined;

        if (hasFullData) {
            openConfigurator(form, form.name, 1, dealId, cn, presetNorm);
            return;
        }

        if (!form.article) {
            openConfigurator(form, form.name, 1, dealId, cn, presetNorm);
            return;
        }

        fetch(CRYSTAL_BASE + '/api/product-forms/byArticle/' + encodeURIComponent(form.article), {
            headers: { 'X-Api-Key': API_KEY }
        })
        .then(function (res) { return res.json(); })
        .then(function (fullForm) {
            openConfigurator(fullForm, fullForm.name, 1, dealId, cn, presetNorm);
        })
        .catch(function () {
            openConfigurator(form, form.name, 1, dealId, cn, presetNorm);
        });
    }

    function insertFormsPanel() {
        if (document.getElementById(PANEL_ID)) return;

        var url = window.location.href;
        var dealMatch = url.match(/crm\/deal\/details\/(\d+)/);
        if (!dealMatch) return;
        var dealId = dealMatch[1];

        var sidebar = document.querySelector('.ui-entity-editor-column-content');
        if (!sidebar) return;

        var STORAGE_KEY = 'cpf-panel-collapsed';
        var isCollapsed = localStorage.getItem(STORAGE_KEY) !== 'false';
        var formsLoaded = false;

        var wrapper = document.createElement('div');
        wrapper.id = PANEL_ID;
        wrapper.style.cssText = 'padding:10px 15px 5px;';

        var toggleBar = document.createElement('div');
        toggleBar.style.cssText = [
            'cursor:pointer;padding:6px 10px;',
            'background:#0d6efd;color:#fff;',
            'border-radius:4px;font-size:13px;font-weight:700;',
            'user-select:none;display:flex;',
            'justify-content:space-between;align-items:center;margin-bottom:4px;'
        ].join('');

        var toggleLabel = document.createElement('span');
        toggleLabel.textContent = 'Формы товаров';

        var toggleArrow = document.createElement('span');
        toggleArrow.textContent = isCollapsed ? '▶' : '▼';

        toggleBar.appendChild(toggleLabel);
        toggleBar.appendChild(toggleArrow);

        var content = document.createElement('div');
        content.style.display = isCollapsed ? 'none' : 'block';

        var listDiv = document.createElement('div');
        listDiv.style.cssText = 'min-height:20px;';
        content.appendChild(listDiv);

        function loadForms() {
            if (formsLoaded) return;
            listDiv.style.cssText = 'font-size:12px;color:#888;padding:6px 0;';
            listDiv.textContent = 'Загрузка...';

            fetch(CRYSTAL_BASE + '/api/product-forms', {
                headers: { 'X-Api-Key': API_KEY }
            })
            .then(function (res) { return res.json(); })
            .then(function (forms) {
                formsLoaded = true;
                listDiv.style.cssText = 'min-height:20px;';
                listDiv.innerHTML = '';

                if (!Array.isArray(forms) || forms.length === 0) {
                    listDiv.style.cssText = 'font-size:12px;color:#888;padding:6px 0;';
                    listDiv.textContent = 'Нет доступных форм';
                    return;
                }

                forms.forEach(function (form) {
                    var item = document.createElement('div');
                    item.style.cssText = [
                        'padding:7px 10px;margin-bottom:4px;',
                        'background:#f5f7fa;border-radius:4px;cursor:pointer;',
                        'border:1px solid #e5e7eb;transition:border-color 0.1s,background 0.1s;'
                    ].join('');

                    var row1 = document.createElement('div');
                    row1.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px;';

                    var formName = document.createElement('span');
                    formName.style.cssText = 'font-weight:600;color:#222;font-size:12px;';
                    formName.textContent = form.name;

                    var slotBadge = document.createElement('span');
                    slotBadge.style.cssText = 'font-size:10px;color:#888;background:#e5e7eb;padding:1px 6px;border-radius:8px;flex-shrink:0;';
                    var slotCount = form.slots ? form.slots.length : (form.slotsCount || 0);
                    slotBadge.textContent = slotCount + ' слотов';

                    row1.appendChild(formName);
                    row1.appendChild(slotBadge);
                    item.appendChild(row1);

                    if (form.article) {
                        var row2 = document.createElement('div');
                        row2.style.cssText = 'font-size:11px;color:#888;margin-top:2px;';
                        row2.textContent = form.article;
                        item.appendChild(row2);
                    }

                    item.addEventListener('mouseenter', function () {
                        item.style.borderColor = '#3b82f6';
                        item.style.background = '#eff6ff';
                    });
                    item.addEventListener('mouseleave', function () {
                        item.style.borderColor = '#e5e7eb';
                        item.style.background = '#f5f7fa';
                    });

                    item.addEventListener('click', function () {
                        item.style.opacity = '0.7';
                        setTimeout(function () { item.style.opacity = '1'; }, 300);
                        openFormFromPanel(form, dealId);
                    });

                    listDiv.appendChild(item);
                });
            })
            .catch(function (err) {
                formsLoaded = false;
                listDiv.style.cssText = 'font-size:12px;color:#e53e3e;padding:6px 0;';
                listDiv.textContent = 'Ошибка загрузки';
                console.error('[CrystalForms] load forms error:', err);
            });
        }

        toggleBar.addEventListener('click', function () {
            isCollapsed = !isCollapsed;
            content.style.display = isCollapsed ? 'none' : 'block';
            toggleArrow.textContent = isCollapsed ? '▶' : '▼';
            localStorage.setItem(STORAGE_KEY, String(isCollapsed));
            if (!isCollapsed) loadForms();
        });

        wrapper.appendChild(toggleBar);
        wrapper.appendChild(content);
        sidebar.insertBefore(wrapper, sidebar.firstChild);

        if (!isCollapsed) loadForms();
    }

    // ===== FORMS PICKER MODAL (вызывается из панели иерархии) =====

    function openFormsPicker(dealId, clientName) {
        var existing = document.getElementById('cpf-picker-overlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'cpf-picker-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:99999;display:flex;align-items:center;justify-content:center;';

        var modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:8px;padding:20px;max-width:420px;width:90vw;max-height:75vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,0.2);position:relative;';

        var closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'position:absolute;top:12px;right:12px;background:none;border:none;font-size:18px;cursor:pointer;color:#999;padding:2px 6px;line-height:1;';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', function () { overlay.remove(); });

        var titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-size:15px;font-weight:700;color:#222;margin-bottom:14px;padding-right:24px;';
        titleEl.textContent = 'Выберите форму товара';

        var manageBtn = document.createElement('button');
        manageBtn.textContent = '⚙ Управление формами';
        manageBtn.style.cssText = [
            'display:block;width:100%;margin-bottom:12px;',
            'background:#fff;border:1px solid #d1d5db;color:#374151;',
            'padding:7px 12px;border-radius:5px;',
            'font-size:12px;cursor:pointer;text-align:left;'
        ].join('');
        manageBtn.addEventListener('click', function () {
            overlay.remove();
            if (window.CrystalFormsEditor) window.CrystalFormsEditor.open(function () {
                openFormsPicker(dealId, clientName);
            });
        });

        var listDiv = document.createElement('div');
        listDiv.style.cssText = 'font-size:12px;color:#888;';
        listDiv.textContent = 'Загрузка...';

        modal.appendChild(closeBtn);
        modal.appendChild(titleEl);
        modal.appendChild(manageBtn);
        modal.appendChild(listDiv);
        overlay.appendChild(modal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);

        var savedForms = null;

        function renderFormsList(forms) {
            titleEl.textContent = 'Выберите форму товара';
            manageBtn.style.display = 'block';
            listDiv.innerHTML = '';
            listDiv.style.cssText = '';

            if (!Array.isArray(forms) || forms.length === 0) {
                listDiv.style.cssText = 'font-size:12px;color:#888;';
                listDiv.textContent = 'Нет доступных форм';
                return;
            }

            forms.forEach(function (form) {
                var item = document.createElement('div');
                item.style.cssText = 'padding:9px 11px;margin-bottom:5px;background:#f5f7fa;border-radius:5px;cursor:pointer;border:1px solid #e5e7eb;';

                var r1 = document.createElement('div');
                r1.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';

                var nameEl = document.createElement('span');
                nameEl.style.cssText = 'font-weight:600;color:#222;font-size:13px;';
                nameEl.textContent = form.name;

                var cnt = document.createElement('span');
                cnt.style.cssText = 'font-size:10px;color:#888;background:#e5e7eb;padding:1px 6px;border-radius:8px;flex-shrink:0;';
                cnt.textContent = (form.slots ? form.slots.length : 0) + ' слотов';

                r1.appendChild(nameEl);
                r1.appendChild(cnt);
                item.appendChild(r1);

                if (form.article) {
                    var r2 = document.createElement('div');
                    r2.style.cssText = 'font-size:11px;color:#9ca3af;margin-top:2px;';
                    r2.textContent = form.article;
                    item.appendChild(r2);
                }

                item.addEventListener('mouseenter', function () { item.style.borderColor = '#3b82f6'; item.style.background = '#eff6ff'; });
                item.addEventListener('mouseleave', function () { item.style.borderColor = '#e5e7eb'; item.style.background = '#f5f7fa'; });
                item.addEventListener('click', function () { showNormsView(form); });

                listDiv.appendChild(item);
            });
        }

        function showNormsView(form) {
            titleEl.textContent = form.name;
            manageBtn.style.display = 'none';
            listDiv.innerHTML = '';
            listDiv.style.cssText = '';

            var backBtn = document.createElement('button');
            backBtn.textContent = '← Назад к формам';
            backBtn.style.cssText = 'background:none;border:none;color:#3b82f6;font-size:12px;cursor:pointer;padding:0 0 10px 0;display:block;';
            backBtn.addEventListener('click', function () { renderFormsList(savedForms); });
            listDiv.appendChild(backBtn);

            var newConfigItem = document.createElement('div');
            newConfigItem.style.cssText = 'padding:9px 11px;margin-bottom:8px;background:#f0fdf4;border-radius:5px;cursor:pointer;border:1px solid #86efac;';
            var newConfigSpan = document.createElement('span');
            newConfigSpan.style.cssText = 'font-weight:600;color:#166534;font-size:13px;';
            newConfigSpan.textContent = '+ Новая конфигурация';
            newConfigItem.appendChild(newConfigSpan);
            newConfigItem.addEventListener('mouseenter', function () { newConfigItem.style.background = '#dcfce7'; });
            newConfigItem.addEventListener('mouseleave', function () { newConfigItem.style.background = '#f0fdf4'; });
            newConfigItem.addEventListener('click', function () {
                overlay.remove();
                openFormFromPanel(form, dealId, clientName);
            });
            listDiv.appendChild(newConfigItem);

            var loadingEl = document.createElement('div');
            loadingEl.style.cssText = 'font-size:12px;color:#888;padding:4px 0;';
            loadingEl.textContent = 'Загрузка норм...';
            listDiv.appendChild(loadingEl);

            fetch(CRYSTAL_BASE + '/api/product-form-norms?baseNormArticle=' + encodeURIComponent(form.article || ''), {
                headers: { 'X-Api-Key': API_KEY }
            })
            .then(function (r) { return r.json(); })
            .then(function (norms) {
                if (listDiv.contains(loadingEl)) listDiv.removeChild(loadingEl);

                if (!Array.isArray(norms) || norms.length === 0) {
                    var emptyEl = document.createElement('div');
                    emptyEl.style.cssText = 'font-size:12px;color:#9ca3af;padding:4px 0;';
                    emptyEl.textContent = 'Сохранённых норм нет';
                    listDiv.appendChild(emptyEl);
                    return;
                }

                norms.forEach(function (norm) {
                    var normItem = document.createElement('div');
                    normItem.style.cssText = 'padding:9px 11px;margin-bottom:5px;background:#f5f7fa;border-radius:5px;cursor:pointer;border:1px solid #e5e7eb;';

                    var nr1 = document.createElement('div');
                    nr1.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';

                    var normArticleEl = document.createElement('span');
                    normArticleEl.style.cssText = 'font-weight:600;color:#1d4ed8;font-size:12px;font-family:monospace;';
                    normArticleEl.textContent = norm.article;

                    var priceTag = document.createElement('span');
                    if (norm.draftPrice) {
                        priceTag.style.cssText = 'font-size:11px;color:#166534;background:#dcfce7;padding:2px 7px;border-radius:8px;flex-shrink:0;font-weight:600;';
                        priceTag.textContent = parseFloat(norm.draftPrice).toFixed(2) + ' EUR';
                    } else {
                        priceTag.style.cssText = 'font-size:11px;color:#9ca3af;background:#f3f4f6;padding:2px 7px;border-radius:8px;flex-shrink:0;';
                        priceTag.textContent = 'цена не задана';
                    }

                    nr1.appendChild(normArticleEl);
                    nr1.appendChild(priceTag);
                    normItem.appendChild(nr1);

                    var normNameEl = document.createElement('div');
                    normNameEl.style.cssText = 'font-size:11px;color:#6b7280;margin-top:2px;';
                    normNameEl.textContent = norm.name;
                    normItem.appendChild(normNameEl);

                    var snapshot = norm.slotSnapshot;
                    if (Array.isArray(snapshot) && snapshot.length > 0) {
                        var slotsDiv = document.createElement('div');
                        slotsDiv.style.cssText = 'margin-top:6px;';
                        snapshot.forEach(function (entry) {
                            var line = document.createElement('div');
                            line.style.cssText = 'font-size:12px;color:#374151;margin-top:3px;';
                            var slotSpan = document.createElement('span');
                            slotSpan.style.cssText = 'color:#9ca3af;';
                            slotSpan.textContent = entry.slotName + ' — ';
                            var optSpan = document.createElement('span');
                            optSpan.textContent = entry.optionName;
                            line.appendChild(slotSpan);
                            line.appendChild(optSpan);
                            slotsDiv.appendChild(line);
                        });
                        normItem.appendChild(slotsDiv);
                    }

                    var delNormBtn = document.createElement('button');
                    delNormBtn.textContent = '✕';
                    delNormBtn.title = 'Удалить норму';
                    delNormBtn.style.cssText = 'position:absolute;top:6px;right:8px;background:none;border:none;color:#d1d5db;font-size:13px;cursor:pointer;padding:0;line-height:1;';
                    delNormBtn.addEventListener('mouseenter', function () { delNormBtn.style.color = '#dc2626'; });
                    delNormBtn.addEventListener('mouseleave', function () { delNormBtn.style.color = '#d1d5db'; });
                    delNormBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        if (!confirm('Удалить норму ' + norm.article + '?')) return;
                        delNormBtn.disabled = true;
                        fetch(CRYSTAL_BASE + '/api/product-form-norms/' + norm.id, {
                            method: 'DELETE',
                            headers: { 'X-Api-Key': API_KEY }
                        })
                        .then(function () { normItem.remove(); })
                        .catch(function () { delNormBtn.disabled = false; alert('Ошибка удаления'); });
                    });
                    normItem.style.position = 'relative';
                    normItem.appendChild(delNormBtn);

                    normItem.addEventListener('mouseenter', function () { normItem.style.borderColor = '#3b82f6'; normItem.style.background = '#eff6ff'; });
                    normItem.addEventListener('mouseleave', function () { normItem.style.borderColor = '#e5e7eb'; normItem.style.background = '#f5f7fa'; });
                    normItem.addEventListener('click', function () {
                        overlay.remove();
                        openFormFromPanel(form, dealId, clientName, norm);
                    });

                    listDiv.appendChild(normItem);
                });
            })
            .catch(function () {
                if (listDiv.contains(loadingEl)) listDiv.removeChild(loadingEl);
                var errEl = document.createElement('div');
                errEl.style.cssText = 'font-size:12px;color:#dc2626;padding:4px 0;';
                errEl.textContent = 'Ошибка загрузки норм';
                listDiv.appendChild(errEl);
            });
        }

        fetch(CRYSTAL_BASE + '/api/product-forms', {
            headers: { 'X-Api-Key': API_KEY }
        })
        .then(function (res) { return res.json(); })
        .then(function (forms) {
            savedForms = forms;
            renderFormsList(forms);
        })
        .catch(function () {
            listDiv.style.color = '#dc2626';
            listDiv.textContent = 'Ошибка загрузки форм';
        });
    }

    // ===== GLOBAL EXPORT =====

    window.CrystalProductForms = {
        openConfigurator: openConfigurator,
        openFormsPicker: openFormsPicker,
        extractArticleFromRow: extractArticleFromRow
    };

    // ===== INIT =====

    BX.ready(function () {
        var url = window.location.href;
        if (!url.match(/crm\/deal\/details\/(\d+)/)) return;

        var observer = new MutationObserver(function () {
            insertFormsPanel();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        insertFormsPanel();
    });
})();
