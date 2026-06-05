(function () {
    'use strict';

    var CRYSTAL_BASE = 'https://crystal.alvla.tools';
    var API_KEY = 'legenda';
    var BTN_CLASS = 'ccp-crystal-params-btn';

    var typesCache = null;
    var specKeysCache = null;
    var specValuesCache = {}; // keyed by specKey code

    // ===== API HELPERS =====

    function apiGet(path) {
        return fetch(CRYSTAL_BASE + '/api' + path, {
            headers: { 'X-Api-Key': API_KEY }
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function apiPost(path, data) {
        return fetch(CRYSTAL_BASE + '/api' + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
            body: JSON.stringify(data)
        }).then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error(body.message || 'HTTP ' + r.status);
                return body;
            });
        });
    }

    function apiPatch(path, data) {
        return fetch(CRYSTAL_BASE + '/api' + path, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
            body: JSON.stringify(data)
        }).then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error(body.message || 'HTTP ' + r.status);
                return body;
            });
        });
    }

    function loadTypes() {
        if (typesCache) return Promise.resolve(typesCache);
        return apiGet('/products/types').then(function (d) { typesCache = d; return d; });
    }

    function loadSpecKeys() {
        if (specKeysCache) return Promise.resolve(specKeysCache);
        return apiGet('/spec-keys/').then(function (d) { specKeysCache = d; return d; });
    }

    function loadSpecValuesFor(specKeyCode) {
        if (specValuesCache[specKeyCode]) return Promise.resolve(specValuesCache[specKeyCode]);
        return apiGet('/products/spec-values?specKey=' + encodeURIComponent(specKeyCode))
            .then(function (d) { specValuesCache[specKeyCode] = d; return d; });
    }

    function findProductByArticle(article) {
        return apiGet('/products/getAll?search=' + encodeURIComponent(article) + '&limit=5')
            .then(function (resp) {
                var products = (resp && resp.data) ? resp.data : (Array.isArray(resp) ? resp : []);
                for (var i = 0; i < products.length; i++) {
                    var variants = products[i].variants || [];
                    for (var j = 0; j < variants.length; j++) {
                        if (variants[j].article === article) {
                            return { product: products[i], variant: variants[j] };
                        }
                    }
                }
                return null;
            });
    }

    // ===== POPUP =====

    function openPopup(baseArticle, productName, bitrixId) {
        var existing = document.getElementById('ccp-overlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'ccp-overlay';
        overlay.style.cssText = [
            'position:fixed;top:0;left:0;right:0;bottom:0;',
            'background:rgba(0,0,0,0.45);z-index:99999;',
            'display:flex;align-items:center;justify-content:center;'
        ].join('');
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

        var modal = document.createElement('div');
        modal.style.cssText = [
            'background:#fff;border-radius:8px;',
            'width:95vw;max-width:95vw;',
            'min-height:70vh;max-height:92vh;',
            'position:relative;box-shadow:0 8px 40px rgba(0,0,0,0.22);',
            'display:flex;flex-direction:column;'
        ].join('');

        // Header bar
        var header = document.createElement('div');
        header.style.cssText = [
            'padding:18px 24px 14px;border-bottom:1px solid #f3f4f6;',
            'flex-shrink:0;position:relative;'
        ].join('');

        var closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'position:absolute;top:14px;right:14px;background:none;border:none;font-size:20px;cursor:pointer;color:#999;padding:4px 8px;line-height:1;';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', function () { overlay.remove(); });

        var titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-size:17px;font-weight:700;color:#222;margin-bottom:2px;padding-right:36px;';
        titleEl.textContent = 'Crystal: ' + baseArticle;

        var subtitleEl = document.createElement('div');
        subtitleEl.style.cssText = 'font-size:14px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        subtitleEl.textContent = productName || '';

        header.appendChild(closeBtn);
        header.appendChild(titleEl);
        header.appendChild(subtitleEl);

        // Split body
        var body = document.createElement('div');
        body.style.cssText = 'display:flex;flex:1;min-height:0;';

        // Right: drawing panel
        var drawingPanel = document.createElement('div');
        drawingPanel.style.cssText = [
            'width:63%;flex-shrink:0;',
            'border-left:1px solid #f3f4f6;',
            'display:flex;flex-direction:column;',
            'background:#f9fafb;'
        ].join('');

        var drawingHeader = document.createElement('div');
        drawingHeader.style.cssText = 'padding:10px 14px;font-size:12px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #f3f4f6;flex-shrink:0;';
        drawingHeader.textContent = 'Чертёж';

        var drawingContent = document.createElement('div');
        drawingContent.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px;min-height:0;';
        drawingContent.innerHTML = '<span style="font-size:13px;color:#9ca3af;">Загрузка чертежа...</span>';

        drawingPanel.appendChild(drawingHeader);
        drawingPanel.appendChild(drawingContent);

        // Right: form panel
        var formPanel = document.createElement('div');
        formPanel.style.cssText = 'flex:1;overflow-y:auto;padding:18px 22px;';

        var statusEl = document.createElement('div');
        statusEl.style.cssText = 'font-size:14px;color:#6b7280;padding:30px;text-align:center;';
        statusEl.textContent = 'Загрузка...';
        formPanel.appendChild(statusEl);

        body.appendChild(formPanel);
        body.appendChild(drawingPanel);

        modal.appendChild(header);
        modal.appendChild(body);

        // Load drawing in parallel
        var drawingParam = bitrixId ? 'bitrixId=' + bitrixId : 'article=' + encodeURIComponent(baseArticle);
        fetch('/local/ajax/crystal/get_product_drawing.php?' + drawingParam)
            .then(function (r) { return r.json(); })
            .then(function (resp) { renderDrawing(drawingContent, resp); })
            .catch(function () { renderDrawing(drawingContent, null); });
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        Promise.all([findProductByArticle(baseArticle), loadTypes(), loadSpecKeys()])
            .then(function (results) {
                formPanel.removeChild(statusEl);
                renderForm(formPanel, baseArticle, productName, results[0], results[1], results[2]);
            })
            .catch(function (err) {
                statusEl.style.color = '#dc2626';
                statusEl.textContent = 'Ошибка загрузки: ' + (err.message || '');
            });
    }

    // ===== DRAWING PANEL =====

    function renderDrawing(container, resp) {
        container.innerHTML = '';

        var file = resp && resp.found && resp.file ? resp.file : null;

        if (!resp || !resp.found) {
            var msg = document.createElement('span');
            msg.style.cssText = 'font-size:13px;color:#9ca3af;text-align:center;';
            msg.textContent = (resp && resp.message) ? resp.message : 'Чертёж не прикреплён';
            container.appendChild(msg);
            return;
        }

        if (!file) {
            var msg2 = document.createElement('span');
            msg2.style.cssText = 'font-size:13px;color:#9ca3af;text-align:center;';
            msg2.textContent = 'Чертёж не прикреплён';
            container.appendChild(msg2);
            return;
        }

        if (file.ext === 'pdf') {
            var iframe = document.createElement('iframe');
            iframe.src = file.url;
            iframe.style.cssText = 'width:100%;flex:1;border:none;border-radius:4px;min-height:0;';
            iframe.setAttribute('title', file.name);
            container.style.alignItems = 'stretch';
            container.appendChild(iframe);
        } else {
            var icon = document.createElement('div');
            icon.style.cssText = 'font-size:40px;margin-bottom:10px;';
            icon.textContent = '📄';
            var fmt = document.createElement('div');
            fmt.style.cssText = 'font-size:13px;color:#6b7280;margin-bottom:6px;text-align:center;';
            fmt.textContent = file.name;
            var note = document.createElement('div');
            note.style.cssText = 'font-size:12px;color:#9ca3af;margin-bottom:16px;text-align:center;';
            note.textContent = 'Предпросмотр недоступен';
            container.appendChild(icon);
            container.appendChild(fmt);
            container.appendChild(note);
        }

        var dlBtn = document.createElement('a');
        dlBtn.href = file.url;
        dlBtn.download = file.name;
        dlBtn.target = '_blank';
        dlBtn.style.cssText = [
            'display:inline-flex;align-items:center;gap:5px;',
            'margin-top:10px;padding:6px 14px;flex-shrink:0;',
            'background:#f0f7ff;border:1px solid #bfdbfe;',
            'color:#1d4ed8;border-radius:5px;',
            'font-size:13px;font-weight:600;text-decoration:none;'
        ].join('');
        dlBtn.textContent = '⬇ Скачать ' + file.ext.toUpperCase();
        container.appendChild(dlBtn);
    }

    // ===== FORM RENDER =====

    function renderForm(modal, baseArticle, productName, found, types, specKeys) {
        var existingProduct = found ? found.product : null;
        var existingVariant = found ? found.variant : null;

        if (existingVariant) {
            var badge = document.createElement('div');
            badge.style.cssText = [
                'font-size:13px;padding:6px 10px;margin-bottom:14px;',
                'background:#f0fdf4;border:1px solid #86efac;',
                'color:#166534;border-radius:5px;font-weight:600;'
            ].join('');
            badge.textContent = '✓ Вариант найден в Crystal — редактирование';
            modal.appendChild(badge);
        }

        // Type selector
        function sectionHead(text) {
            var el = document.createElement('div');
            el.style.cssText = [
                'font-size:11px;font-weight:700;color:#9ca3af;',
                'text-transform:uppercase;letter-spacing:0.07em;',
                'margin:14px 0 10px;border-top:1px solid #f3f4f6;padding-top:12px;'
            ].join('');
            el.textContent = text;
            return el;
        }

        function fieldRow(labelText, content) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;';
            var lbl = document.createElement('span');
            lbl.style.cssText = 'font-size:14px;color:#374151;width:155px;flex-shrink:0;padding-top:8px;';
            lbl.textContent = labelText;
            row.appendChild(lbl);
            var wrap = document.createElement('div');
            wrap.style.cssText = 'flex:1;';
            wrap.appendChild(content);
            row.appendChild(wrap);
            return row;
        }

        // Type select
        var typeSelect = document.createElement('select');
        typeSelect.style.cssText = 'width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;background:#fff;';

        var emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '— выберите тип —';
        typeSelect.appendChild(emptyOpt);

        (types || []).filter(function (t) { return !t.isGroup; }).forEach(function (t) {
            var o = document.createElement('option');
            o.value = t.code;
            o.textContent = (t.name && (t.name.ru || t.name.en)) || t.code;
            typeSelect.appendChild(o);
        });

        if (existingProduct && existingProduct.productType) {
            typeSelect.value = existingProduct.productType.code || '';
        }

        modal.appendChild(fieldRow('Тип продукта', typeSelect));

        // Physical params
        modal.appendChild(sectionHead('Физические параметры'));

        var dimsData = (existingVariant && existingVariant.dimensions) || {};
        var extDims = dimsData.external || {};
        var intDims = dimsData.internal || {};
        var extInputs = [];
        var intInputs = [];

        function buildDimsBlock(vals, inputsArr) {
            var wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;gap:6px;';
            ['width', 'height', 'depth'].forEach(function (axis, idx) {
                var cell = document.createElement('div');
                cell.style.cssText = 'flex:1;position:relative;';
                var inp = document.createElement('input');
                inp.type = 'number';
                inp.min = '0';
                inp.step = '1';
                inp.placeholder = ['Ш', 'В', 'Г'][idx];
                inp.dataset.axis = axis;
                inp.value = vals[axis] != null ? vals[axis] : '';
                inp.style.cssText = 'width:100%;box-sizing:border-box;padding:7px 24px 7px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;';
                var unit = document.createElement('span');
                unit.style.cssText = 'position:absolute;right:5px;top:50%;transform:translateY(-50%);font-size:11px;color:#9ca3af;pointer-events:none;';
                unit.textContent = 'мм';
                cell.appendChild(inp);
                cell.appendChild(unit);
                wrap.appendChild(cell);
                inputsArr.push(inp);
            });
            return wrap;
        }

        modal.appendChild(fieldRow('Внешние габариты', buildDimsBlock(extDims, extInputs)));
        modal.appendChild(fieldRow('Внутренние габариты', buildDimsBlock(intDims, intInputs)));

        // Weight
        var weightWrap = document.createElement('div');
        weightWrap.style.cssText = 'position:relative;max-width:120px;';
        var weightInp = document.createElement('input');
        weightInp.type = 'number';
        weightInp.min = '0';
        weightInp.step = '0.001';
        weightInp.placeholder = '0.000';
        weightInp.value = (existingVariant && existingVariant.weight != null) ? existingVariant.weight : '';
        weightInp.style.cssText = 'width:100%;box-sizing:border-box;padding:7px 26px 7px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;';
        var weightUnit = document.createElement('span');
        weightUnit.style.cssText = 'position:absolute;right:5px;top:50%;transform:translateY(-50%);font-size:11px;color:#9ca3af;pointer-events:none;';
        weightUnit.textContent = 'кг';
        weightWrap.appendChild(weightInp);
        weightWrap.appendChild(weightUnit);
        modal.appendChild(fieldRow('Вес нетто', weightWrap));

        // Dynamic spec fields
        var specsContainer = document.createElement('div');
        modal.appendChild(specsContainer);

        function renderSpecFields(typeCode) {
            specsContainer.innerHTML = '';
            if (!typeCode) return;

            var filtered = (specKeys || []).filter(function (sk) {
                return !sk.productTypeCodes || sk.productTypeCodes.indexOf(typeCode) !== -1;
            });
            if (!filtered.length) return;

            specsContainer.appendChild(sectionHead('Атрибуты'));

            filtered.forEach(function (sk) {
                var currentVal = existingVariant && existingVariant.specs ? existingVariant.specs[sk.code] : undefined;
                var content;

                if (sk.valueType === 'enum' || sk.valueType === 'enum_rich') {
                    var sel = document.createElement('select');
                    sel.dataset.specKey = sk.code;
                    sel.dataset.vtype = 'enum';
                    sel.style.cssText = 'width:100%;padding:7px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;background:#fff;';
                    var loadingO = document.createElement('option');
                    loadingO.textContent = 'Загрузка...';
                    loadingO.disabled = true;
                    sel.appendChild(loadingO);
                    content = sel;

                    loadSpecValuesFor(sk.code).then(function (vals) {
                        sel.innerHTML = '';
                        var emptyO = document.createElement('option');
                        emptyO.value = '';
                        emptyO.textContent = '—';
                        sel.appendChild(emptyO);
                        (vals || []).forEach(function (sv) {
                            var o = document.createElement('option');
                            o.value = sv.code;
                            o.textContent = (sv.value && (sv.value.ru || sv.value.en)) || sv.code;
                            if (currentVal === sv.code) o.selected = true;
                            sel.appendChild(o);
                        });
                    }).catch(function () {
                        sel.innerHTML = '';
                        var errO = document.createElement('option');
                        errO.textContent = 'Ошибка загрузки';
                        sel.appendChild(errO);
                    });

                } else if (sk.valueType === 'float') {
                    if (sk.allowRange) {
                        var rw = document.createElement('div');
                        rw.style.cssText = 'display:flex;gap:6px;align-items:center;';
                        var minI = document.createElement('input');
                        minI.type = 'number';
                        minI.placeholder = 'от';
                        minI.dataset.specKey = sk.code;
                        minI.dataset.vtype = 'range_min';
                        minI.style.cssText = 'flex:1;padding:7px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;';
                        if (Array.isArray(currentVal) && currentVal[0] != null) minI.value = currentVal[0];
                        var sep = document.createElement('span');
                        sep.style.cssText = 'color:#9ca3af;font-size:14px;flex-shrink:0;';
                        sep.textContent = '—';
                        var maxI = document.createElement('input');
                        maxI.type = 'number';
                        maxI.placeholder = 'до';
                        maxI.dataset.specKey = sk.code;
                        maxI.dataset.vtype = 'range_max';
                        maxI.style.cssText = 'flex:1;padding:7px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;';
                        if (Array.isArray(currentVal) && currentVal[1] != null) maxI.value = currentVal[1];
                        rw.appendChild(minI);
                        rw.appendChild(sep);
                        rw.appendChild(maxI);
                        if (sk.unit) {
                            var ru = document.createElement('span');
                            ru.style.cssText = 'font-size:13px;color:#9ca3af;flex-shrink:0;';
                            ru.textContent = sk.unit;
                            rw.appendChild(ru);
                        }
                        content = rw;
                    } else {
                        var nw = document.createElement('div');
                        nw.style.cssText = 'position:relative;';
                        var nInp = document.createElement('input');
                        nInp.type = 'number';
                        nInp.step = 'any';
                        nInp.dataset.specKey = sk.code;
                        nInp.dataset.vtype = 'float';
                        nInp.style.cssText = 'width:100%;box-sizing:border-box;padding:7px ' + (sk.unit ? '36px' : '8px') + ' 7px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;';
                        if (currentVal != null) nInp.value = currentVal;
                        nw.appendChild(nInp);
                        if (sk.unit) {
                            var nUnit = document.createElement('span');
                            nUnit.style.cssText = 'position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:11px;color:#9ca3af;pointer-events:none;';
                            nUnit.textContent = sk.unit;
                            nw.appendChild(nUnit);
                        }
                        content = nw;
                    }
                } else {
                    var tInp = document.createElement('input');
                    tInp.type = 'text';
                    tInp.dataset.specKey = sk.code;
                    tInp.dataset.vtype = 'text';
                    tInp.style.cssText = 'width:100%;box-sizing:border-box;padding:7px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;';
                    if (currentVal != null) tInp.value = currentVal;
                    content = tInp;
                }

                var lbl = (sk.labels && (sk.labels.ru || sk.labels.en)) || sk.code;
                if (sk.unit && sk.valueType === 'float' && !sk.allowRange) lbl += ', ' + sk.unit;
                specsContainer.appendChild(fieldRow(lbl, content));
            });
        }

        if (typeSelect.value) renderSpecFields(typeSelect.value);
        typeSelect.addEventListener('change', function () { renderSpecFields(typeSelect.value); });

        // Footer
        var footer = document.createElement('div');
        footer.style.cssText = 'border-top:1px solid #e5e7eb;padding-top:16px;margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;';

        var saveBtn = document.createElement('button');
        saveBtn.className = 'ui-btn ui-btn-success ui-btn-sm';
        saveBtn.style.cssText = 'flex:1;min-width:160px;';
        saveBtn.textContent = existingVariant ? 'Обновить в Crystal' : 'Создать в Crystal';

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'ui-btn ui-btn-light ui-btn-sm';
        cancelBtn.textContent = 'Отмена';
        cancelBtn.addEventListener('click', function () {
            var ov = document.getElementById('ccp-overlay');
            if (ov) ov.remove();
        });

        var saveStatus = document.createElement('div');
        saveStatus.style.cssText = 'width:100%;font-size:13px;min-height:16px;text-align:center;';

        footer.appendChild(saveBtn);
        footer.appendChild(cancelBtn);
        footer.appendChild(saveStatus);
        modal.appendChild(footer);

        // ===== COLLECT DATA =====

        function collectData() {
            function dimVals(inputs) {
                var keys = ['width', 'height', 'depth'];
                var obj = {};
                inputs.forEach(function (inp, i) {
                    var v = parseFloat(inp.value);
                    if (!isNaN(v)) obj[keys[i]] = v;
                });
                return Object.keys(obj).length ? obj : null;
            }

            var dims = {};
            var ext = dimVals(extInputs);
            var int = dimVals(intInputs);
            if (ext) dims.external = ext;
            if (int) dims.internal = int;

            var w = parseFloat(weightInp.value);
            var specs = {};

            specsContainer.querySelectorAll('[data-spec-key]').forEach(function (el) {
                var key = el.dataset.specKey;
                var vtype = el.dataset.vtype;
                if (vtype === 'enum') {
                    if (el.value) specs[key] = el.value;
                } else if (vtype === 'float') {
                    var v = parseFloat(el.value);
                    if (!isNaN(v)) specs[key] = v;
                } else if (vtype === 'range_min' || vtype === 'range_max') {
                    if (!specs[key]) specs[key] = [null, null];
                    var rv = parseFloat(el.value);
                    if (!isNaN(rv)) specs[key][vtype === 'range_min' ? 0 : 1] = rv;
                } else if (vtype === 'text') {
                    var s = el.value.trim();
                    if (s) specs[key] = s;
                }
            });

            Object.keys(specs).forEach(function (k) {
                if (Array.isArray(specs[k]) && specs[k][0] === null && specs[k][1] === null) delete specs[k];
            });

            return {
                dims: dims,
                weight: isNaN(w) ? null : w,
                specs: specs
            };
        }

        // ===== SAVE =====

        saveBtn.addEventListener('click', function () {
            var typeCode = typeSelect.value;
            if (!typeCode) {
                saveStatus.style.color = '#dc2626';
                saveStatus.textContent = 'Выберите тип продукта';
                return;
            }

            var data = collectData();
            var variantDto = {
                article: baseArticle,
                name: { ru: productName || baseArticle, en: productName || baseArticle },
                weight: data.weight,
                dimensions: Object.keys(data.dims).length ? data.dims : undefined,
                specs: data.specs,
                isActive: true
            };

            saveBtn.disabled = true;
            saveBtn.textContent = '⧗ Сохранение...';
            saveStatus.style.color = '#6b7280';
            saveStatus.textContent = '';

            var promise;

            if (existingVariant && existingProduct) {
                var updatedVariants = (existingProduct.variants || []).map(function (v) {
                    if (v.id === existingVariant.id) return Object.assign({}, v, variantDto, { id: v.id });
                    return v;
                });
                promise = apiPatch('/products/update/' + existingProduct.id, {
                    productTypeCode: typeCode,
                    variants: updatedVariants
                });
            } else if (existingProduct) {
                promise = apiPost('/products/addVariant/' + existingProduct.id, variantDto);
            } else {
                promise = apiPost('/products/create', {
                    productTypeCode: typeCode,
                    name: { ru: productName || baseArticle, en: productName || baseArticle },
                    article: baseArticle,
                    variants: [variantDto]
                });
            }

            promise
                .then(function () {
                    saveBtn.textContent = '✅ Сохранено';
                    saveStatus.style.color = '#16a34a';
                    saveStatus.textContent = existingVariant ? 'Данные обновлены в Crystal' : 'Вариант создан в Crystal';
                    setTimeout(function () {
                        var ov = document.getElementById('ccp-overlay');
                        if (ov) ov.remove();
                    }, 1800);
                })
                .catch(function (err) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = existingVariant ? 'Обновить в Crystal' : 'Создать в Crystal';
                    saveStatus.style.color = '#dc2626';
                    saveStatus.textContent = 'Ошибка: ' + (err.message || 'попробуйте ещё раз');
                });
        });
    }

    // ===== PUBLIC API =====

    window.CrystalProductParams = { open: openPopup };

    // ===== BUTTON INJECTION (legacy — Bitrix native grid) =====

    function injectProductButtons() {
        var gridNode = document.body.querySelector('[id^="CCrmEntityProductListComponent"]');
        if (!gridNode) return;

        var gridManager = BX.Main.gridManager.getById('CCrmEntityProductListComponent');
        var grid = gridManager && gridManager.instance;
        if (!grid) return;

        var rows = grid.getRows();
        var children = rows.getBodyChild();
        if (!children || !children.length) return;

        // Detect column indices from first row
        var nameKey = null, articleKey = null;
        var firstRow = rows.rows[0];
        if (firstRow && firstRow.node) {
            Array.from(firstRow.node.children).forEach(function (td, idx) {
                var col = td.getAttribute('data-name');
                if (col === 'MAIN_INFO') nameKey = idx;
                if (col === 'ARTNUMBER' || col === 'PROPERTY_ARTNUMBER' || col === 'SKU') articleKey = idx;
            });
        }

        children.forEach(function (row) {
            if (row.node.querySelector('.' + BTN_CLASS)) return;

            var productName = '';
            if (nameKey !== null && row.node.children[nameKey]) {
                var nameInput = row.node.children[nameKey].querySelector('input[data-name="NAME"]');
                productName = nameInput
                    ? nameInput.value.trim()
                    : (row.node.children[nameKey].textContent || '').trim();
            }

            // bitrixId — из скрытого инпута PRODUCT_ID внутри строки
            var bitrixId = 0;
            var pidInput = row.node.querySelector('input[data-name="PRODUCT_ID"]');
            if (pidInput && pidInput.value) bitrixId = parseInt(pidInput.value) || 0;

            var article = '';
            if (articleKey !== null && row.node.children[articleKey]) {
                article = (row.node.children[articleKey].textContent || '').trim();
            }
            if (!article && productName) {
                var m = productName.match(/\d+\.\d+\.\d+/);
                if (m) article = m[0];
            }
            if (!article && !bitrixId) return;

            var lastCell = row.node.cells[row.node.cells.length - 1];
            if (!lastCell) return;

            var btn = document.createElement('button');
            btn.className = BTN_CLASS;
            btn.title = 'Crystal параметры: ' + article;
            btn.style.cssText = [
                'display:inline-flex;align-items:center;gap:3px;',
                'margin-top:4px;padding:3px 8px;',
                'background:#f0f7ff;border:1px solid #bfdbfe;',
                'color:#1d4ed8;border-radius:4px;',
                'font-size:12px;font-weight:600;cursor:pointer;',
                'white-space:nowrap;line-height:1.4;'
            ].join('');
            btn.textContent = '⚙ Crystal';

            btn.addEventListener('mouseenter', function () {
                btn.style.background = '#dbeafe';
                btn.style.borderColor = '#93c5fd';
            });
            btn.addEventListener('mouseleave', function () {
                btn.style.background = '#f0f7ff';
                btn.style.borderColor = '#bfdbfe';
            });
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                e.preventDefault();
                openPopup(article, productName, bitrixId);
            });

            lastCell.appendChild(document.createElement('br'));
            lastCell.appendChild(btn);
        });
    }

    // ===== INIT =====

    BX.ready(function () {
        if (!window.location.href.match(/crm\/deal\/details\/(\d+)/)) return;
    });

})();
