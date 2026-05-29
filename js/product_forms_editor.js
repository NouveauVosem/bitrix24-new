(function () {
    'use strict';

    var CRYSTAL_BASE = 'https://crystal.alvla.tools';
    var API_KEY = 'legenda';

    var _sectionsCache = null;

    // ===== API =====

    function crystalFetch(method, path, body) {
        var opts = {
            method: method,
            headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' }
        };
        if (body !== undefined) opts.body = JSON.stringify(body);
        return fetch(CRYSTAL_BASE + path, opts).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function getSections(cb) {
        if (_sectionsCache) { cb(_sectionsCache); return; }
        fetch('/local/ajax/get_catalog_sections.php')
            .then(function (r) { return r.json(); })
            .then(function (data) { _sectionsCache = data; cb(data); })
            .catch(function () { cb([]); });
    }

    function getProductsBySection(sectionId, cb) {
        fetch('/local/ajax/get_catalog_products.php?sectionId=' + sectionId)
            .then(function (r) { return r.json(); })
            .then(cb)
            .catch(function () { cb([]); });
    }

    // ===== DOM HELPERS =====

    function el(tag, css, text) {
        var e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function nbsp(n) {
        var s = '';
        for (var i = 0; i < n; i++) s += ' ';
        return s;
    }

    // ===== OPEN MANAGER =====

    function openFormsManager() {
        var existing = document.getElementById('cfe-overlay');
        if (existing) existing.remove();

        var overlay = el('div', [
            'position:fixed;top:0;left:0;right:0;bottom:0;',
            'background:rgba(0,0,0,0.5);z-index:999999;',
            'display:flex;align-items:center;justify-content:center;'
        ].join(''));
        overlay.id = 'cfe-overlay';

        var modal = el('div', [
            'background:#fff;border-radius:8px;',
            'width:700px;max-width:95vw;max-height:88vh;',
            'display:flex;flex-direction:column;',
            'box-shadow:0 12px 50px rgba(0,0,0,0.25);',
            'overflow:hidden;'
        ].join(''));

        var header = el('div', [
            'padding:16px 20px;border-bottom:1px solid #e5e7eb;',
            'display:flex;align-items:center;justify-content:space-between;flex-shrink:0;'
        ].join(''));

        var headerTitle = el('div', 'font-size:16px;font-weight:700;color:#111;', 'Управление формами');

        var closeBtn = el('button', [
            'background:none;border:none;font-size:20px;',
            'cursor:pointer;color:#9ca3af;padding:2px 8px;line-height:1;'
        ].join(''), '✕');
        closeBtn.addEventListener('click', function () { overlay.remove(); });

        header.appendChild(headerTitle);
        header.appendChild(closeBtn);

        var body = el('div', 'flex:1;overflow-y:auto;padding:16px 20px;');

        modal.appendChild(header);
        modal.appendChild(body);
        overlay.appendChild(modal);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });

        document.body.appendChild(overlay);
        showListView(headerTitle, body, overlay);
    }

    // ===== LIST VIEW =====

    function showListView(headerTitle, body, overlay) {
        headerTitle.textContent = 'Управление формами';
        body.innerHTML = '';

        var toolbar = el('div', 'margin-bottom:14px;');
        var createBtn = el('button', [
            'background:#16a34a;color:#fff;border:none;',
            'padding:8px 18px;border-radius:5px;',
            'font-size:13px;font-weight:600;cursor:pointer;'
        ].join(''), '+ Создать форму');
        createBtn.addEventListener('click', function () {
            showEditorView(headerTitle, body, null, function () {
                showListView(headerTitle, body, overlay);
            });
        });
        toolbar.appendChild(createBtn);
        body.appendChild(toolbar);

        var listArea = el('div', 'color:#9ca3af;font-size:13px;', 'Загрузка...');
        body.appendChild(listArea);

        crystalFetch('GET', '/api/product-forms')
            .then(function (forms) {
                listArea.innerHTML = '';
                listArea.style.cssText = '';

                if (!Array.isArray(forms) || forms.length === 0) {
                    listArea.style.cssText = 'color:#9ca3af;font-size:13px;text-align:center;padding:40px 0;';
                    listArea.textContent = 'Форм пока нет. Создайте первую!';
                    return;
                }

                forms.forEach(function (form) {
                    var row = el('div', [
                        'display:flex;align-items:center;gap:10px;',
                        'padding:10px 12px;margin-bottom:6px;',
                        'border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;'
                    ].join(''));

                    var info = el('div', 'flex:1;min-width:0;');
                    var name = el('div', 'font-size:13px;font-weight:600;color:#111;', form.name);
                    var meta = el('div', 'font-size:11px;color:#9ca3af;margin-top:2px;');
                    var slotCount = form.slots ? form.slots.length : (form.slotsCount || 0);
                    meta.textContent = (form.article || '—') + ' · ' + slotCount + ' слотов';
                    info.appendChild(name);
                    info.appendChild(meta);

                    var editBtn = el('button', [
                        'background:#3b82f6;color:#fff;border:none;',
                        'padding:5px 12px;border-radius:4px;',
                        'font-size:12px;cursor:pointer;flex-shrink:0;'
                    ].join(''), 'Редактировать');
                    editBtn.addEventListener('click', function () {
                        editBtn.textContent = '...';
                        editBtn.disabled = true;
                        crystalFetch('GET', '/api/product-forms/' + form.id)
                            .then(function (fullForm) {
                                showEditorView(headerTitle, body, fullForm, function () {
                                    showListView(headerTitle, body, overlay);
                                });
                            })
                            .catch(function () {
                                showEditorView(headerTitle, body, form, function () {
                                    showListView(headerTitle, body, overlay);
                                });
                            });
                    });

                    var delBtn = el('button', [
                        'background:#fff;color:#dc2626;border:1px solid #fca5a5;',
                        'padding:5px 12px;border-radius:4px;',
                        'font-size:12px;cursor:pointer;flex-shrink:0;'
                    ].join(''), 'Удалить');
                    delBtn.addEventListener('click', function () {
                        if (!confirm('Удалить форму "' + form.name + '"?')) return;
                        delBtn.disabled = true;
                        crystalFetch('DELETE', '/api/product-forms/' + form.id)
                            .then(function () { showListView(headerTitle, body, overlay); })
                            .catch(function () {
                                alert('Ошибка при удалении');
                                delBtn.disabled = false;
                            });
                    });

                    row.appendChild(info);
                    row.appendChild(editBtn);
                    row.appendChild(delBtn);
                    listArea.appendChild(row);
                });
            })
            .catch(function () {
                listArea.style.cssText = 'color:#dc2626;font-size:13px;';
                listArea.textContent = 'Ошибка загрузки форм';
            });
    }

    // ===== EDITOR VIEW =====

    function showEditorView(headerTitle, body, existingForm, onBack) {
        var isNew = !existingForm;
        headerTitle.textContent = isNew ? 'Создать форму' : 'Редактировать форму';
        body.innerHTML = '';

        // Back
        var backBtn = el('button', [
            'background:none;border:none;color:#3b82f6;',
            'font-size:13px;cursor:pointer;padding:0;margin-bottom:16px;display:block;'
        ].join(''), '← Назад');
        backBtn.addEventListener('click', onBack);
        body.appendChild(backBtn);

        // Name
        var nameGroup = buildField('Название формы', existingForm ? existingForm.name : '', 'Например: Тележка ML-T');
        body.appendChild(nameGroup.wrap);

        // Article
        var articleGroup = buildField('Артикул главного товара', existingForm ? (existingForm.article || '') : '', 'Например: 11.1565.5');
        body.appendChild(articleGroup.wrap);

        // Slots
        var slotsWrap = el('div', 'margin-top:20px;');
        var slotsLabel = el('div', 'font-size:13px;font-weight:600;color:#374151;margin-bottom:10px;', 'Слоты');
        slotsWrap.appendChild(slotsLabel);

        var slotsContainer = el('div', '');
        slotsWrap.appendChild(slotsContainer);

        // Deep-copy slots from existing form
        var slots = [];
        if (existingForm && Array.isArray(existingForm.slots)) {
            existingForm.slots.slice().sort(function (a, b) {
                return (a.order || 0) - (b.order || 0);
            }).forEach(function (s) {
                slots.push({
                    name: s.name || '',
                    required: s.required !== false,
                    quantityPerUnit: parseInt(s.quantityPerUnit) || 1,
                    options: (s.options || []).map(function (o) {
                        return { article: o.article, name: o.name };
                    })
                });
            });
        }

        function rebuildSlotsUI() {
            slotsContainer.innerHTML = '';
            slots.forEach(function (slot, idx) {
                slotsContainer.appendChild(buildSlotCard(slot, idx, slots, rebuildSlotsUI));
            });
        }
        rebuildSlotsUI();

        var addSlotBtn = el('button', [
            'margin-top:8px;width:100%;',
            'background:#fff;border:1px dashed #9ca3af;',
            'color:#374151;padding:9px;border-radius:5px;',
            'font-size:12px;cursor:pointer;'
        ].join(''), '+ Добавить слот');
        addSlotBtn.addEventListener('click', function () {
            slots.push({ name: '', required: true, quantityPerUnit: 1, options: [] });
            rebuildSlotsUI();
        });
        slotsWrap.appendChild(addSlotBtn);
        body.appendChild(slotsWrap);

        // Footer
        var footer = el('div', 'margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;');
        var saveStatus = el('div', 'font-size:12px;margin-top:8px;min-height:16px;');
        var saveBtn = el('button', [
            'background:#16a34a;color:#fff;border:none;',
            'padding:10px 28px;border-radius:5px;',
            'font-size:14px;font-weight:600;cursor:pointer;'
        ].join(''), isNew ? 'Создать форму' : 'Сохранить изменения');
        saveBtn.addEventListener('click', function () {
            var formData = {
                name: nameGroup.input.value.trim(),
                article: articleGroup.input.value.trim(),
                slots: slots.map(function (s, i) {
                    return {
                        name: s.name,
                        required: s.required,
                        quantityPerUnit: s.quantityPerUnit,
                        order: i + 1,
                        options: s.options
                    };
                })
            };

            if (!formData.name) {
                saveStatus.style.color = '#dc2626';
                saveStatus.textContent = 'Введите название формы';
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Сохранение...';
            saveStatus.textContent = '';

            var method = isNew ? 'POST' : 'PUT';
            var path = isNew ? '/api/product-forms' : '/api/product-forms/' + existingForm.id;

            crystalFetch(method, path, formData)
                .then(function () {
                    saveBtn.textContent = '✓ Сохранено';
                    saveStatus.style.color = '#16a34a';
                    setTimeout(onBack, 900);
                })
                .catch(function () {
                    saveBtn.disabled = false;
                    saveBtn.textContent = isNew ? 'Создать форму' : 'Сохранить изменения';
                    saveStatus.style.color = '#dc2626';
                    saveStatus.textContent = 'Ошибка сохранения';
                });
        });

        footer.appendChild(saveBtn);
        footer.appendChild(saveStatus);
        body.appendChild(footer);
    }

    // ===== SLOT CARD =====

    function buildSlotCard(slot, idx, allSlots, rebuildSlotsUI) {
        var card = el('div', [
            'border:1px solid #e5e7eb;border-radius:6px;',
            'padding:14px;margin-bottom:10px;background:#fafafa;'
        ].join(''));

        // Card header
        var cardHeader = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;');
        var cardTitle = el('div', 'font-size:12px;font-weight:600;color:#6b7280;', 'Слот ' + (idx + 1));
        var delSlotBtn = el('button', [
            'background:none;border:none;',
            'color:#dc2626;font-size:11px;cursor:pointer;padding:0;'
        ].join(''), 'Удалить слот');
        delSlotBtn.addEventListener('click', function () {
            allSlots.splice(idx, 1);
            rebuildSlotsUI();
        });
        cardHeader.appendChild(cardTitle);
        cardHeader.appendChild(delSlotBtn);
        card.appendChild(cardHeader);

        // Slot name
        var nameGroup = buildField('Название слота', slot.name, 'Например: Пружина');
        nameGroup.input.addEventListener('input', function () { slot.name = nameGroup.input.value; });
        card.appendChild(nameGroup.wrap);

        // Required + qty row
        var row2 = el('div', 'display:flex;gap:20px;align-items:flex-start;margin-top:10px;');

        // Required toggle (no rebuild on click)
        var reqWrap = el('div', '');
        var reqLbl = el('div', 'font-size:11px;color:#6b7280;margin-bottom:5px;font-weight:600;', 'Обязательный');
        var reqToggleWrap = el('div', 'display:flex;gap:4px;');

        var reqBtns = [];
        ['Да', 'Нет'].forEach(function (label, i) {
            var active = (i === 0) ? slot.required : !slot.required;
            var b = el('button', [
                'padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer;',
                'border:1px solid ' + (active ? '#3b82f6' : '#d1d5db') + ';',
                'background:' + (active ? '#eff6ff' : '#fff') + ';',
                'color:' + (active ? '#1d4ed8' : '#374151') + ';'
            ].join(''), label);
            reqBtns.push(b);
            b.addEventListener('click', function () {
                slot.required = (i === 0);
                reqBtns.forEach(function (rb, j) {
                    var a = (j === 0) ? slot.required : !slot.required;
                    rb.style.borderColor = a ? '#3b82f6' : '#d1d5db';
                    rb.style.background  = a ? '#eff6ff' : '#fff';
                    rb.style.color       = a ? '#1d4ed8' : '#374151';
                });
            });
            reqToggleWrap.appendChild(b);
        });

        reqWrap.appendChild(reqLbl);
        reqWrap.appendChild(reqToggleWrap);

        // Qty per unit
        var qtyWrap = el('div', '');
        var qtyLbl = el('div', 'font-size:11px;color:#6b7280;margin-bottom:5px;font-weight:600;', 'Кол-во на единицу');
        var qtyInput = el('input', 'width:72px;padding:5px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;text-align:center;');
        qtyInput.type = 'number';
        qtyInput.min = '1';
        qtyInput.value = slot.quantityPerUnit || 1;
        qtyInput.addEventListener('input', function () {
            slot.quantityPerUnit = Math.max(1, parseInt(qtyInput.value) || 1);
        });
        qtyWrap.appendChild(qtyLbl);
        qtyWrap.appendChild(qtyInput);

        row2.appendChild(reqWrap);
        row2.appendChild(qtyWrap);
        card.appendChild(row2);

        // Options section
        card.appendChild(buildOptionsSection(slot));

        return card;
    }

    // ===== OPTIONS SECTION =====

    function buildOptionsSection(slot) {
        var wrap = el('div', 'margin-top:14px;');
        var optLbl = el('div', 'font-size:11px;color:#6b7280;font-weight:600;margin-bottom:6px;', 'Опции');
        wrap.appendChild(optLbl);

        // Chips
        var chipsWrap = el('div', 'display:flex;flex-wrap:wrap;gap:5px;min-height:24px;margin-bottom:8px;');
        var productsListEl = null;

        function renderChips() {
            chipsWrap.innerHTML = '';
            if (slot.options.length === 0) {
                chipsWrap.appendChild(el('span', 'font-size:11px;color:#9ca3af;', 'Нет выбранных опций'));
                return;
            }
            slot.options.forEach(function (opt, oi) {
                var chip = el('div', [
                    'display:inline-flex;align-items:center;gap:4px;',
                    'padding:3px 8px;background:#eff6ff;',
                    'border:1px solid #bfdbfe;border-radius:12px;',
                    'font-size:11px;color:#1d4ed8;'
                ].join(''), opt.article + ' — ' + opt.name);
                var rmBtn = el('button', [
                    'background:none;border:none;',
                    'color:#93c5fd;cursor:pointer;font-size:12px;',
                    'padding:0 0 0 3px;line-height:1;'
                ].join(''), '✕');
                rmBtn.addEventListener('click', function () {
                    slot.options.splice(oi, 1);
                    renderChips();
                    if (productsListEl) renderProductsList();
                });
                chip.appendChild(rmBtn);
                chipsWrap.appendChild(chip);
            });
        }
        renderChips();
        wrap.appendChild(chipsWrap);

        // Browser toggle
        var browserShown = false;
        var browserArea = el('div', 'display:none;margin-top:6px;');
        var toggleBrowserBtn = el('button', [
            'background:#fff;border:1px solid #d1d5db;color:#374151;',
            'padding:5px 10px;border-radius:4px;font-size:11px;cursor:pointer;'
        ].join(''), 'Добавить из каталога ▾');
        toggleBrowserBtn.addEventListener('click', function () {
            browserShown = !browserShown;
            browserArea.style.display = browserShown ? 'block' : 'none';
            toggleBrowserBtn.textContent = browserShown
                ? 'Свернуть ▴'
                : 'Добавить из каталога ▾';
            if (browserShown && !sectionsLoaded) loadSectionsIntoSelect();
        });
        wrap.appendChild(toggleBrowserBtn);

        // Section select
        var sectionsLoaded = false;
        var sectionSelect = el('select', [
            'width:100%;padding:6px 8px;',
            'border:1px solid #d1d5db;border-radius:4px;',
            'font-size:12px;margin-bottom:8px;'
        ].join(''));
        var defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '— Выберите раздел каталога —';
        sectionSelect.appendChild(defaultOpt);

        // Search
        var searchInput = el('input', [
            'width:100%;padding:5px 8px;box-sizing:border-box;',
            'border:1px solid #d1d5db;border-radius:4px;',
            'font-size:12px;margin-bottom:8px;display:none;'
        ].join(''));
        searchInput.placeholder = 'Поиск по артикулу или названию...';

        var currentProducts = [];

        function renderProductsList() {
            if (!productsListEl) return;
            var q = searchInput.value.toLowerCase();
            var filtered = currentProducts.filter(function (p) {
                if (!q) return true;
                return p.article.toLowerCase().indexOf(q) !== -1
                    || p.name.toLowerCase().indexOf(q) !== -1;
            });

            productsListEl.innerHTML = '';
            if (filtered.length === 0) {
                productsListEl.style.cssText = 'font-size:11px;color:#9ca3af;padding:10px;';
                productsListEl.textContent = 'Нет товаров';
                return;
            }

            productsListEl.style.cssText = [
                'max-height:180px;overflow-y:auto;',
                'border:1px solid #e5e7eb;border-radius:4px;'
            ].join('');

            filtered.forEach(function (p) {
                var isSelected = slot.options.some(function (o) { return o.article === p.article; });
                var pRow = document.createElement('label');
                pRow.style.cssText = [
                    'display:flex;align-items:center;gap:8px;',
                    'padding:6px 10px;cursor:pointer;',
                    'border-bottom:1px solid #f3f4f6;',
                    'background:' + (isSelected ? '#f0fdf4' : '#fff') + ';'
                ].join('');

                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = isSelected;
                cb.style.cssText = 'flex-shrink:0;margin:0;accent-color:#16a34a;cursor:pointer;';

                var pInfo = el('div', 'flex:1;min-width:0;');
                pInfo.appendChild(el('div', 'font-size:11px;color:#6b7280;font-weight:600;', p.article));
                pInfo.appendChild(el('div', 'font-size:11px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', p.name));

                cb.addEventListener('change', function () {
                    if (cb.checked) {
                        if (!slot.options.some(function (o) { return o.article === p.article; })) {
                            slot.options.push({ article: p.article, name: p.name });
                        }
                    } else {
                        slot.options = slot.options.filter(function (o) { return o.article !== p.article; });
                    }
                    pRow.style.background = cb.checked ? '#f0fdf4' : '#fff';
                    renderChips();
                });

                pRow.appendChild(cb);
                pRow.appendChild(pInfo);
                productsListEl.appendChild(pRow);
            });
        }

        sectionSelect.addEventListener('change', function () {
            var sid = sectionSelect.value;
            if (!sid) {
                searchInput.style.display = 'none';
                if (productsListEl) { productsListEl.innerHTML = ''; productsListEl.style.cssText = ''; }
                return;
            }
            if (!productsListEl) {
                productsListEl = el('div', '');
                browserArea.appendChild(productsListEl);
            }
            productsListEl.style.cssText = 'font-size:11px;color:#9ca3af;padding:10px;';
            productsListEl.textContent = 'Загрузка...';
            searchInput.style.display = 'block';
            searchInput.value = '';
            currentProducts = [];

            getProductsBySection(sid, function (products) {
                currentProducts = products;
                renderProductsList();
            });
        });

        searchInput.addEventListener('input', renderProductsList);

        function loadSectionsIntoSelect() {
            getSections(function (sections) {
                sectionsLoaded = true;
                sections.forEach(function (s) {
                    var opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = nbsp((s.depth - 1) * 3) + s.name;
                    sectionSelect.appendChild(opt);
                });
            });
        }

        browserArea.appendChild(sectionSelect);
        browserArea.appendChild(searchInput);
        wrap.appendChild(browserArea);

        return wrap;
    }

    // ===== FIELD BUILDER =====

    function buildField(label, value, placeholder) {
        var wrap = el('div', 'margin-bottom:10px;');
        var lbl = el('label', 'display:block;font-size:11px;color:#6b7280;margin-bottom:4px;font-weight:600;', label);
        var input = el('input', [
            'width:100%;padding:7px 10px;box-sizing:border-box;',
            'border:1px solid #d1d5db;border-radius:4px;font-size:13px;'
        ].join(''));
        input.type = 'text';
        input.value = value || '';
        if (placeholder) input.placeholder = placeholder;
        wrap.appendChild(lbl);
        wrap.appendChild(input);
        return { wrap: wrap, input: input };
    }

    // ===== EXPORT =====

    window.CrystalFormsEditor = { open: openFormsManager };
})();
