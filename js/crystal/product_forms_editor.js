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
            if (r.status === 204) return null;
            return r.json();
        });
    }

    function saveForm(isNew, existingForm, formData, onSuccess, onError) {
        var slots = formData.slots.map(function (s, i) {
            return {
                name: s.name,
                required: s.required,
                quantityPerUnit: s.quantityPerUnit,
                order: i,
                options: s.options
            };
        });

        if (isNew) {
            crystalFetch('POST', '/api/product-forms', { name: formData.name, article: formData.article, bitrixId: formData.bitrixId })
                .then(function (created) {
                    return crystalFetch('PUT', '/api/product-forms/' + created.id + '/full', {
                        name: formData.name,
                        article: formData.article,
                        bitrixId: formData.bitrixId,
                        slots: slots
                    });
                })
                .then(onSuccess)
                .catch(onError);
        } else {
            crystalFetch('PUT', '/api/product-forms/' + existingForm.id + '/full', {
                name: formData.name,
                article: formData.article,
                bitrixId: formData.bitrixId,
                slots: slots
            })
                .then(onSuccess)
                .catch(onError);
        }
    }

    function getSections(cb) {
        if (_sectionsCache) { cb(_sectionsCache); return; }
        fetch('/local/ajax/crystal/get_catalog_sections.php')
            .then(function (r) { return r.json(); })
            .then(function (data) { _sectionsCache = data; cb(data); })
            .catch(function () { cb([]); });
    }

    function getProductsBySection(sectionId, cb) {
        fetch('/local/ajax/crystal/get_catalog_products.php?sectionId=' + sectionId)
            .then(function (r) { return r.json(); })
            .then(cb)
            .catch(function () { cb([]); });
    }

    // ===== DOM HELPERS =====

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function nbsp(n) {
        var s = '';
        for (var i = 0; i < n; i++) s += ' ';
        return s;
    }

    // ===== OPEN MANAGER =====

    function openFormsManager(onBack) {
        var existing = document.getElementById('cfe-overlay');
        if (existing) existing.remove();

        var overlay = el('div', 'cfe-overlay');
        overlay.id = 'cfe-overlay';

        var modal = el('div', 'cfe-modal');

        var header = el('div', 'cfe-modal-header');
        var headerLeft = el('div', 'cfe-modal-header-left');

        if (onBack) {
            var backBtn = el('button', 'cfe-back-btn', '← Назад');
            backBtn.addEventListener('click', function () { overlay.remove(); onBack(); });
            headerLeft.appendChild(backBtn);
        }

        var headerTitle = el('div', 'cfe-modal-title', 'Управление формами');
        headerLeft.appendChild(headerTitle);

        var closeBtn = el('button', 'cfe-close-btn', '✕');
        closeBtn.addEventListener('click', function () { overlay.remove(); });

        header.appendChild(headerLeft);
        header.appendChild(closeBtn);

        var body = el('div', 'cfe-modal-body');

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

        var toolbar = el('div', 'cfe-toolbar');
        var createBtn = el('button', 'cfe-create-btn', '+ Создать форму');
        createBtn.addEventListener('click', function () {
            showEditorView(headerTitle, body, null, function () {
                showListView(headerTitle, body, overlay);
            });
        });
        toolbar.appendChild(createBtn);
        body.appendChild(toolbar);

        var listArea = el('div', 'cfe-list-empty', 'Загрузка...');
        body.appendChild(listArea);

        crystalFetch('GET', '/api/product-forms')
            .then(function (forms) {
                listArea.innerHTML = '';
                listArea.className = '';

                if (!Array.isArray(forms) || forms.length === 0) {
                    listArea.className = 'cfe-list-empty--center';
                    listArea.textContent = 'Форм пока нет. Создайте первую!';
                    return;
                }

                forms.forEach(function (form) {
                    var row = el('div', 'cfe-form-row');
                    var info = el('div', 'cfe-form-info');
                    var name = el('div', 'cfe-form-name', form.name);
                    var meta = el('div', 'cfe-form-meta');
                    var slotCount = form.slots ? form.slots.length : (form.slotsCount || 0);
                    meta.textContent = (form.article || '—') + ' · ' + slotCount + ' слотов';
                    info.appendChild(name);
                    info.appendChild(meta);

                    var editBtn = el('button', 'cfe-edit-btn', 'Редактировать');
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

                    var delBtn = el('button', 'cfe-del-btn', 'Удалить');
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
                listArea.className = 'cfe-list-error';
                listArea.textContent = 'Ошибка загрузки форм';
            });
    }

    // ===== EDITOR VIEW =====

    function showEditorView(headerTitle, body, existingForm, onBack) {
        var isNew = !existingForm;
        headerTitle.textContent = isNew ? 'Создать форму' : 'Редактировать форму';
        body.innerHTML = '';

        var backBtn = el('button', 'cfe-editor-back', '← Назад');
        backBtn.addEventListener('click', onBack);
        body.appendChild(backBtn);

        var nameGroup = buildField('Название формы', existingForm ? existingForm.name : '', 'Например: Тележка ML-T');
        body.appendChild(nameGroup.wrap);
        attachNormSearch(nameGroup.input, function (norm) {
            nameGroup.input.value     = norm.name    || '';
            articleGroup.input.value  = norm.article || '';
            bitrixIdGroup.input.value = norm.id      || '';
        });

        var articleGroup = buildField('Артикул главного товара', existingForm ? (existingForm.article || '') : '', 'Например: 11.1565.5');
        body.appendChild(articleGroup.wrap);
        attachNormSearch(articleGroup.input, function (norm) {
            articleGroup.input.value  = norm.article || '';
            nameGroup.input.value     = norm.name    || '';
            bitrixIdGroup.input.value = norm.id      || '';
        });

        var bitrixIdGroup = buildField('ID товара в Битрикс', existingForm ? (existingForm.bitrixId || '') : '', 'Заполняется автоматически при выборе из поиска');
        bitrixIdGroup.input.type = 'number';
        body.appendChild(bitrixIdGroup.wrap);

        var slotsWrap = el('div', 'cfe-slots-wrap');
        slotsWrap.appendChild(el('div', 'cfe-slots-label', 'Слоты'));

        var slotsContainer = document.createElement('div');
        slotsWrap.appendChild(slotsContainer);

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

        var addSlotBtn = el('button', 'cfe-add-slot-btn', '+ Добавить слот');
        addSlotBtn.addEventListener('click', function () {
            slots.push({ name: '', required: true, quantityPerUnit: 1, options: [] });
            rebuildSlotsUI();
        });
        slotsWrap.appendChild(addSlotBtn);
        body.appendChild(slotsWrap);

        var footer = el('div', 'cfe-footer');
        var saveStatus = el('div', 'cfe-save-status');
        var saveBtn = el('button', 'cfe-save-btn', isNew ? 'Создать форму' : 'Сохранить изменения');

        saveBtn.addEventListener('click', function () {
            var formData = {
                name: nameGroup.input.value.trim(),
                article: articleGroup.input.value.trim(),
                bitrixId: parseInt(bitrixIdGroup.input.value) || null,
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
                saveStatus.className = 'cfe-save-status cfe-save-status--err';
                saveStatus.textContent = 'Введите название формы';
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Сохранение...';
            saveStatus.textContent = '';

            saveForm(isNew, existingForm, formData,
                function () {
                    saveBtn.textContent = '✓ Сохранено';
                    saveStatus.className = 'cfe-save-status cfe-save-status--ok';
                    setTimeout(onBack, 900);
                },
                function () {
                    saveBtn.disabled = false;
                    saveBtn.textContent = isNew ? 'Создать форму' : 'Сохранить изменения';
                    saveStatus.className = 'cfe-save-status cfe-save-status--err';
                    saveStatus.textContent = 'Ошибка сохранения';
                }
            );
        });

        footer.appendChild(saveBtn);
        footer.appendChild(saveStatus);
        body.appendChild(footer);
    }

    // ===== SLOT CARD =====

    function buildSlotCard(slot, idx, allSlots, rebuildSlotsUI) {
        var card = el('div', 'cfe-slot-card');

        var cardHeader = el('div', 'cfe-slot-card-header');
        cardHeader.appendChild(el('div', 'cfe-slot-card-title', 'Слот ' + (idx + 1)));
        var delSlotBtn = el('button', 'cfe-del-slot-btn', 'Удалить слот');
        delSlotBtn.addEventListener('click', function () {
            allSlots.splice(idx, 1);
            rebuildSlotsUI();
        });
        cardHeader.appendChild(delSlotBtn);
        card.appendChild(cardHeader);

        var nameGroup = buildField('Название слота', slot.name, 'Например: Пружина');
        nameGroup.input.addEventListener('input', function () { slot.name = nameGroup.input.value; });
        card.appendChild(nameGroup.wrap);

        var row2 = el('div', 'cfe-slot-row2');

        // Required toggle
        var reqWrap = document.createElement('div');
        reqWrap.appendChild(el('div', 'cfe-field-label-sm', 'Обязательный'));
        var reqToggleWrap = el('div', 'cfe-req-toggle-wrap');
        var reqBtns = [];
        ['Да', 'Нет'].forEach(function (label, i) {
            var active = (i === 0) ? slot.required : !slot.required;
            var b = el('button', 'cfe-req-btn' + (active ? ' cfe-req-btn--active' : ''), label);
            reqBtns.push(b);
            b.addEventListener('click', function () {
                slot.required = (i === 0);
                reqBtns.forEach(function (rb, j) {
                    rb.classList.toggle('cfe-req-btn--active', (j === 0) ? slot.required : !slot.required);
                });
            });
            reqToggleWrap.appendChild(b);
        });
        reqWrap.appendChild(reqToggleWrap);

        // Qty per unit
        var qtyWrap = document.createElement('div');
        qtyWrap.appendChild(el('div', 'cfe-field-label-sm', 'Кол-во на единицу'));
        var qtyInput = el('input', 'cfe-qty-input');
        qtyInput.type = 'number';
        qtyInput.min = '1';
        qtyInput.value = slot.quantityPerUnit || 1;
        qtyInput.addEventListener('input', function () {
            slot.quantityPerUnit = Math.max(1, parseInt(qtyInput.value) || 1);
        });
        qtyWrap.appendChild(qtyInput);

        row2.appendChild(reqWrap);
        row2.appendChild(qtyWrap);
        card.appendChild(row2);
        card.appendChild(buildOptionsSection(slot));

        return card;
    }

    // ===== OPTIONS SECTION =====

    function buildOptionsSection(slot) {
        var wrap = el('div', 'cfe-options-wrap');
        wrap.appendChild(el('div', 'cfe-options-label', 'Опции'));

        var chipsWrap = el('div', 'cfe-chips-wrap');
        var productsListEl = null;

        function renderChips() {
            chipsWrap.innerHTML = '';
            if (slot.options.length === 0) {
                chipsWrap.appendChild(el('span', 'cfe-chips-empty', 'Нет выбранных опций'));
                return;
            }
            slot.options.forEach(function (opt, oi) {
                var chip = el('div', 'cfe-chip', opt.article + ' — ' + opt.name);
                var rmBtn = el('button', 'cfe-chip-rm', '✕');
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

        var browserShown = false;
        var browserArea = el('div', 'cfe-browser-area');
        browserArea.style.display = 'none';

        var toggleBrowserBtn = el('button', 'cfe-toggle-browser-btn', 'Добавить из каталога ▾');
        toggleBrowserBtn.addEventListener('click', function () {
            browserShown = !browserShown;
            browserArea.style.display = browserShown ? 'block' : 'none';
            toggleBrowserBtn.textContent = browserShown ? 'Свернуть ▴' : 'Добавить из каталога ▾';
            if (browserShown && !sectionsLoaded) loadSectionsIntoSelect();
        });
        wrap.appendChild(toggleBrowserBtn);

        var sectionsLoaded = false;
        var sectionSelect = el('select', 'cfe-section-select');
        var defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '— Выберите раздел каталога —';
        sectionSelect.appendChild(defaultOpt);

        var searchInput = el('input', 'cfe-search-input');
        searchInput.placeholder = 'Поиск по артикулу или названию...';
        searchInput.style.display = 'none';

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
            updateSelectAllState();

            if (filtered.length === 0) {
                productsListEl.className = 'cfe-products-empty';
                productsListEl.textContent = 'Нет товаров';
                return;
            }

            productsListEl.className = 'cfe-products-list';

            filtered.forEach(function (p) {
                var isSelected = slot.options.some(function (o) { return o.article === p.article; });
                var pRow = document.createElement('label');
                pRow.className = 'cfe-product-row' + (isSelected ? ' cfe-product-row--selected' : '');

                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = isSelected;
                cb.className = 'cfe-product-cb';

                var pInfo = el('div', 'cfe-product-info');
                pInfo.appendChild(el('div', 'cfe-product-article', p.article));
                pInfo.appendChild(el('div', 'cfe-product-name', p.name));

                cb.addEventListener('change', function () {
                    if (cb.checked) {
                        if (!slot.options.some(function (o) { return o.article === p.article; })) {
                            slot.options.push({ article: p.article, name: p.name, bitrixId: p.id });
                        }
                    } else {
                        slot.options = slot.options.filter(function (o) { return o.article !== p.article; });
                    }
                    pRow.classList.toggle('cfe-product-row--selected', cb.checked);
                    renderChips();
                    updateSelectAllState();
                });

                pRow.appendChild(cb);
                pRow.appendChild(pInfo);
                productsListEl.appendChild(pRow);
            });
        }

        var selectAllRow = el('div', 'cfe-select-all-row');
        selectAllRow.style.display = 'none';
        var selectAllCb = document.createElement('input');
        selectAllCb.type = 'checkbox';
        selectAllCb.className = 'cfe-select-all-cb';
        var selectAllLbl = el('span', 'cfe-select-all-lbl', 'Выбрать все');
        selectAllLbl.addEventListener('click', function () { selectAllCb.click(); });
        selectAllRow.appendChild(selectAllCb);
        selectAllRow.appendChild(selectAllLbl);

        selectAllCb.addEventListener('change', function () {
            var filtered = currentProducts.filter(function (p) {
                var q = searchInput.value.toLowerCase();
                if (!q) return true;
                return p.article.toLowerCase().indexOf(q) !== -1 || p.name.toLowerCase().indexOf(q) !== -1;
            });
            if (selectAllCb.checked) {
                filtered.forEach(function (p) {
                    if (!slot.options.some(function (o) { return o.article === p.article; })) {
                        slot.options.push({ article: p.article, name: p.name, bitrixId: p.id });
                    }
                });
            } else {
                var filteredArticles = filtered.map(function (p) { return p.article; });
                slot.options = slot.options.filter(function (o) {
                    return filteredArticles.indexOf(o.article) === -1;
                });
            }
            renderChips();
            renderProductsList();
        });

        function updateSelectAllState() {
            var filtered = currentProducts.filter(function (p) {
                var q = searchInput.value.toLowerCase();
                if (!q) return true;
                return p.article.toLowerCase().indexOf(q) !== -1 || p.name.toLowerCase().indexOf(q) !== -1;
            });
            if (filtered.length === 0) { selectAllCb.checked = false; selectAllCb.indeterminate = false; return; }
            var selectedCount = filtered.filter(function (p) {
                return slot.options.some(function (o) { return o.article === p.article; });
            }).length;
            selectAllCb.indeterminate = selectedCount > 0 && selectedCount < filtered.length;
            selectAllCb.checked = selectedCount === filtered.length;
        }

        sectionSelect.addEventListener('change', function () {
            var sid = sectionSelect.value;
            if (!sid) {
                searchInput.style.display = 'none';
                selectAllRow.style.display = 'none';
                if (productsListEl) { productsListEl.innerHTML = ''; productsListEl.className = ''; }
                return;
            }
            if (!productsListEl) {
                productsListEl = document.createElement('div');
                browserArea.appendChild(productsListEl);
            }
            productsListEl.className = 'cfe-products-empty';
            productsListEl.textContent = 'Загрузка...';
            searchInput.style.display = 'block';
            searchInput.value = '';
            selectAllRow.style.display = 'none';
            currentProducts = [];

            getProductsBySection(sid, function (products) {
                currentProducts = products;
                selectAllRow.style.display = products.length > 0 ? 'block' : 'none';
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
        browserArea.appendChild(selectAllRow);
        wrap.appendChild(browserArea);

        return wrap;
    }

    // ===== NORM AUTOCOMPLETE =====

    function attachNormSearch(input, onSelect) {
        var timer = null;
        var dropdown = null;

        function removeDropdown() {
            if (dropdown) { dropdown.remove(); dropdown = null; }
        }

        function showDropdown(results) {
            removeDropdown();
            if (!results.length) return;

            dropdown = el('div', 'cfe-dropdown');
            var rect = input.getBoundingClientRect();
            dropdown.style.width = input.offsetWidth + 'px';
            dropdown.style.top   = rect.bottom + 'px';
            dropdown.style.left  = rect.left + 'px';

            results.forEach(function (norm) {
                var item = el('div', 'cfe-dropdown-item');
                item.appendChild(el('span', 'cfe-dropdown-art', norm.article || '—'));
                item.appendChild(el('span', 'cfe-dropdown-name', norm.name || ''));
                item.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    onSelect(norm);
                    removeDropdown();
                });
                dropdown.appendChild(item);
            });

            document.body.appendChild(dropdown);
        }

        input.addEventListener('input', function () {
            var q = input.value.trim();
            clearTimeout(timer);
            if (q.length < 2) { removeDropdown(); return; }
            timer = setTimeout(function () {
                fetch('/local/ajax/crystal/search_catalog_products.php?q=' + encodeURIComponent(q) + '&limit=8')
                    .then(function (r) { return r.json(); })
                    .then(function (results) { showDropdown(results || []); })
                    .catch(function () { removeDropdown(); });
            }, 300);
        });

        input.addEventListener('blur', function () {
            setTimeout(removeDropdown, 150);
        });
    }

    // ===== FIELD BUILDER =====

    function buildField(label, value, placeholder) {
        var wrap = el('div', 'cfe-field');
        wrap.appendChild(el('label', 'cfe-field-label', label));
        var input = el('input', 'cfe-field-input');
        input.type = 'text';
        input.value = value || '';
        if (placeholder) input.placeholder = placeholder;
        wrap.appendChild(input);
        return { wrap: wrap, input: input };
    }

    // ===== EXPORT =====

    window.CrystalFormsEditor = { open: openFormsManager };
})();
