(function () {
    'use strict';

    var CRYSTAL_BASE = 'https://crystal.alvla.tools';
    var API_KEY = 'legenda';

    var typesCache = null;
    var specKeysCache = null;
    var specValuesCache = {};
    var currentBitrixUser = null;

    // ===== DOM HELPERS =====

    function el(tag, style, text) {
        var e = document.createElement(tag);
        if (style) e.style.cssText = style;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function sectionHead(text) {
        return el('div',
            'font-size:11px;font-weight:700;color:#9ca3af;' +
            'text-transform:uppercase;letter-spacing:0.07em;' +
            'margin:14px 0 10px;border-top:1px solid #f3f4f6;padding-top:12px;',
            text
        );
    }

    function fieldRow(labelText, content) {
        var row = el('div', 'display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;');
        var lbl = el('span', 'font-size:14px;color:#374151;width:155px;flex-shrink:0;padding-top:8px;', labelText);
        var wrap = el('div', 'flex:1;');
        wrap.appendChild(content);
        row.appendChild(lbl);
        row.appendChild(wrap);
        return row;
    }

    // ===== UTILS =====

    function resolveUnit(unit) {
        if (!unit) return '';
        if (typeof unit === 'object') return unit['ru'] || unit['en'] || '';
        return unit;
    }

    // ===== API =====

    function apiFetch(method, path, data) {
        var opts = {
            method: method,
            headers: { 'X-Api-Key': API_KEY }
        };
        if (data !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(data);
        }
        return fetch(CRYSTAL_BASE + '/api' + path, opts).then(function (r) {
            if (r.status === 204) return null;
            return r.json().then(function (body) {
                if (!r.ok) throw new Error((body && body.message) || 'HTTP ' + r.status);
                return body;
            });
        });
    }

    function apiFetchForm(method, path, dto, files) {
        var fd = new FormData();
        fd.append('data', JSON.stringify(dto));
        files.forEach(function (f) { fd.append('files', f, f.name); });
        return fetch(CRYSTAL_BASE + '/api' + path, {
            method: method,
            headers: { 'X-Api-Key': API_KEY },
            body: fd
        }).then(function (r) {
            if (r.status === 204) return null;
            return r.json().then(function (body) {
                if (!r.ok) throw new Error((body && body.message) || 'HTTP ' + r.status);
                return body;
            });
        });
    }

    function apiGet(path)                        { return apiFetch('GET',   path); }
    function apiPost(path, data)                 { return apiFetch('POST',  path, data); }
    function apiPatch(path, data)                { return apiFetch('PATCH', path, data); }
    function apiPostForm(path, dto, files)       { return apiFetchForm('POST',  path, dto, files); }
    function apiPatchForm(path, dto, files)      { return apiFetchForm('PATCH', path, dto, files); }

    // ===== DATA LOADERS =====

    function loadCurrentUser() {
        if (currentBitrixUser) return Promise.resolve(currentBitrixUser);
        return fetch('/local/ajax/crystal/get_current_user.php')
            .then(function (r) { return r.json(); })
            .then(function (u) { currentBitrixUser = u; return u; });
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
                var products = (resp && resp.data) ? resp.data : (resp && resp.items) ? resp.items : (Array.isArray(resp) ? resp : []);
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

    function loadFormByArticle(article) {
        if (!article) return Promise.resolve(null);
        return fetch(CRYSTAL_BASE + '/api/product-forms/byArticle/' + encodeURIComponent(article), {
            headers: { 'X-Api-Key': API_KEY }
        })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }

    // ===== POPUP SHELL =====

    function openPopup(baseArticle, productName, bitrixId) {
        var existing = document.getElementById('ccp-overlay');
        if (existing) existing.remove();

        var overlay = el('div',
            'position:fixed;top:0;left:0;right:0;bottom:0;' +
            'background:rgba(0,0,0,0.45);z-index:99999;' +
            'display:flex;align-items:center;justify-content:center;'
        );
        overlay.id = 'ccp-overlay';
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

        var modal = el('div',
            'background:#fff;border-radius:8px;' +
            'width:95vw;max-width:95vw;' +
            'min-height:70vh;max-height:92vh;' +
            'position:relative;box-shadow:0 8px 40px rgba(0,0,0,0.22);' +
            'display:flex;flex-direction:column;'
        );

        var header = el('div', 'padding:18px 24px 14px;border-bottom:1px solid #f3f4f6;flex-shrink:0;position:relative;');
        var closeBtn = el('button',
            'position:absolute;top:14px;right:14px;background:none;border:none;font-size:20px;cursor:pointer;color:#999;padding:4px 8px;line-height:1;',
            '✕'
        );
        closeBtn.addEventListener('click', function () { overlay.remove(); });
        header.appendChild(closeBtn);
        header.appendChild(el('div', 'font-size:17px;font-weight:700;color:#222;margin-bottom:2px;padding-right:36px;', 'Техпаспорт варианта: ' + baseArticle));
        var subtitleEl = el('div', 'font-size:13px;color:#9ca3af;margin-top:4px;display:flex;flex-wrap:wrap;gap:4px 16px;', productName || '');
        header.appendChild(subtitleEl);

        var body = el('div', 'display:flex;flex:1;min-height:0;');

        // Drawing panel (right)
        var drawingPanel = el('div',
            'width:63%;flex-shrink:0;border-left:1px solid #f3f4f6;' +
            'display:flex;flex-direction:column;background:#f9fafb;'
        );
        var drawingContent = el('div',
            'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px;min-height:0;'
        );
        drawingContent.innerHTML = '<span style="font-size:13px;color:#9ca3af;">Загрузка чертежа...</span>';
        drawingPanel.appendChild(el('div',
            'padding:10px 14px;font-size:12px;font-weight:700;color:#9ca3af;' +
            'text-transform:uppercase;letter-spacing:0.06em;' +
            'border-bottom:1px solid #f3f4f6;flex-shrink:0;',
            'Чертёж'
        ));
        drawingPanel.appendChild(drawingContent);

        // Form panel (left)
        var formPanel = el('div', 'flex:1;overflow-y:auto;padding:18px 22px;');
        var statusEl = el('div', 'font-size:14px;color:#6b7280;padding:30px;text-align:center;', 'Загрузка...');
        formPanel.appendChild(statusEl);

        body.appendChild(formPanel);
        body.appendChild(drawingPanel);
        modal.appendChild(header);
        modal.appendChild(body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Load drawing in parallel
        var drawingParam = bitrixId ? 'bitrixId=' + bitrixId : 'article=' + encodeURIComponent(baseArticle);
        fetch('/local/ajax/crystal/get_product_drawing.php?' + drawingParam)
            .then(function (r) { return r.json(); })
            .then(function (resp) { renderDrawing(drawingContent, resp); })
            .catch(function () { renderDrawing(drawingContent, null); });

        Promise.all([findProductByArticle(baseArticle), loadTypes(), loadSpecKeys(), loadCurrentUser(), loadFormByArticle(baseArticle)])
            .then(function (results) {
                var formData = results[4];

                subtitleEl.textContent = '';
                subtitleEl.style.cssText = 'font-size:13px;margin-top:4px;display:flex;flex-wrap:wrap;gap:4px 16px;';
                function nameTag(label, value) {
                    var wrap = document.createElement('span');
                    wrap.style.cssText = 'white-space:nowrap;';
                    var lbl = document.createElement('b');
                    lbl.style.cssText = 'color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-right:4px;font-weight:600;';
                    lbl.textContent = label + ':';
                    var val = document.createElement('span');
                    val.style.cssText = 'color:#374151;font-weight:600;';
                    val.textContent = value || '—';
                    wrap.appendChild(lbl);
                    wrap.appendChild(val);
                    return wrap;
                }
                var fp = (formData && formData.productName) || productName || baseArticle;
                var fv = (formData && (formData.variantName || formData.name)) || productName || baseArticle;
                var fb = formData ? (formData.bitrixName || formData.name || '—') : (productName || '—');
                subtitleEl.appendChild(nameTag('Группа', fp));
                subtitleEl.appendChild(nameTag('Вариант', fv));
                subtitleEl.appendChild(nameTag('BitrixName', fb));

                function proceed(found) {
                    formPanel.removeChild(statusEl);
                    renderForm(formPanel, baseArticle, productName, found, results[1], results[2], formData);
                }

                var found = results[0];
                if (!found && formData && formData.productName) {
                    apiGet('/products/getAll?search=' + encodeURIComponent(formData.productName) + '&limit=5')
                        .then(function (resp) {
                            var products = (resp && resp.items) ? resp.items : (resp && resp.data) ? resp.data : (Array.isArray(resp) ? resp : []);
                            var match = null;
                            for (var i = 0; i < products.length; i++) {
                                var n = products[i].name || {};
                                if (n.ru === formData.productName || n.en === formData.productName) {
                                    match = products[i];
                                    break;
                                }
                            }
                            proceed(match ? { product: match, variant: null } : null);
                        })
                        .catch(function () { proceed(null); });
                } else {
                    proceed(found);
                }
            })
            .catch(function (err) {
                statusEl.style.color = '#dc2626';
                statusEl.textContent = 'Ошибка загрузки: ' + (err.message || '');
            });
    }

    // ===== DRAWING PANEL =====

    function renderDrawing(container, resp) {
        container.innerHTML = '';
        var file = resp && resp.found ? resp.file : null;

        if (!resp || !resp.found) {
            container.appendChild(el('span', 'font-size:13px;color:#9ca3af;text-align:center;',
                (resp && resp.message) ? resp.message : 'Чертёж не прикреплён'
            ));
            return;
        }
        if (!file) {
            container.appendChild(el('span', 'font-size:13px;color:#9ca3af;text-align:center;', 'Чертёж не прикреплён'));
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
            container.appendChild(el('div', 'font-size:40px;margin-bottom:10px;', '📄'));
            container.appendChild(el('div', 'font-size:13px;color:#6b7280;margin-bottom:6px;text-align:center;', file.name));
            container.appendChild(el('div', 'font-size:12px;color:#9ca3af;margin-bottom:16px;text-align:center;', 'Предпросмотр недоступен'));
        }

        var dlBtn = document.createElement('a');
        dlBtn.href = file.url;
        dlBtn.download = file.name;
        dlBtn.target = '_blank';
        dlBtn.style.cssText =
            'display:inline-flex;align-items:center;gap:5px;' +
            'margin-top:10px;padding:6px 14px;flex-shrink:0;' +
            'background:#f0f7ff;border:1px solid #bfdbfe;' +
            'color:#1d4ed8;border-radius:5px;font-size:13px;font-weight:600;text-decoration:none;';
        dlBtn.textContent = '⬇ Скачать ' + file.ext.toUpperCase();
        container.appendChild(dlBtn);
    }

    // ===== FORM SECTIONS =====

    function renderBadge(modal, existingVariant) {
        modal.appendChild(el('div',
            'font-size:13px;padding:6px 10px;margin-bottom:6px;' +
            'background:#f0fdf4;border:1px solid #86efac;' +
            'color:#166534;border-radius:5px;font-weight:600;',
            '✓ Вариант найден в Crystal — редактирование'
        ));

        if (existingVariant.updatedByName || existingVariant.updatedAt) {
            var parts = [];
            if (existingVariant.updatedByName) parts.push('Последнее изменение: ' + existingVariant.updatedByName);
            if (existingVariant.updatedAt) {
                var d = new Date(existingVariant.updatedAt);
                parts.push(d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
            }
            modal.appendChild(el('div', 'font-size:12px;color:#6b7280;margin-bottom:14px;padding:0 2px;', parts.join(' · ')));
        }
    }

    function buildDimsBlock(vals, inputsArr) {
        var wrap = el('div', 'display:flex;gap:6px;');
        ['width', 'depth', 'height'].forEach(function (axis, idx) {
            var cell = el('div', 'flex:1;position:relative;');
            var inp = document.createElement('input');
            inp.type = 'number';
            inp.min = '0';
            inp.step = '1';
            inp.placeholder = ['Ш', 'Г', 'В'][idx];
            inp.dataset.axis = axis;
            inp.value = vals[axis] != null ? vals[axis] : '';
            inp.style.cssText = 'width:100%;box-sizing:border-box;padding:7px 24px 7px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;';
            cell.appendChild(inp);
            cell.appendChild(el('span', 'position:absolute;right:5px;top:50%;transform:translateY(-50%);font-size:11px;color:#9ca3af;pointer-events:none;', 'мм'));
            wrap.appendChild(cell);
            inputsArr.push(inp);
        });
        return wrap;
    }

    function renderPhysicalSection(modal, existingVariant) {
        var dimsData = (existingVariant && existingVariant.dimensions) || {};
        var extInputs = [], intInputs = [];

        modal.appendChild(sectionHead('Физические параметры'));
        modal.appendChild(fieldRow('Внешние габариты', buildDimsBlock(dimsData.external || {}, extInputs)));
        modal.appendChild(fieldRow('Внутренние габариты', buildDimsBlock(dimsData.internal || {}, intInputs)));

        var weightWrap = el('div', 'position:relative;max-width:120px;');
        var weightInp = document.createElement('input');
        weightInp.type = 'number';
        weightInp.min = '0';
        weightInp.step = '0.001';
        weightInp.placeholder = '0.000';
        weightInp.value = (existingVariant && existingVariant.weight != null) ? existingVariant.weight : '';
        weightInp.style.cssText = 'width:100%;box-sizing:border-box;padding:7px 26px 7px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;';
        weightWrap.appendChild(weightInp);
        weightWrap.appendChild(el('span', 'position:absolute;right:5px;top:50%;transform:translateY(-50%);font-size:11px;color:#9ca3af;pointer-events:none;', 'кг'));
        modal.appendChild(fieldRow('Вес нетто', weightWrap));

        return { extInputs: extInputs, intInputs: intInputs, weightInp: weightInp };
    }

    function renderSpecsSection(modal, existingVariant, typeSelect, specKeys, productSpecs) {
        var specsContainer = document.createElement('div');
        modal.appendChild(specsContainer);

        var inheritedBorder = 'border-color:#93c5fd;';
        var inheritedBg     = 'background:#f0f7ff;';
        var inheritedTitle  = 'Значение из продукта';

        function rebuild(typeCode) {
            specsContainer.innerHTML = '';
            if (!typeCode) return;

            var filtered = (specKeys || []).filter(function (sk) {
                return !sk.productTypeCodes || sk.productTypeCodes.indexOf(typeCode) !== -1;
            });
            if (!filtered.length) return;

            specsContainer.appendChild(sectionHead('Атрибуты'));

            filtered.forEach(function (sk) {
                var variantVal = existingVariant && existingVariant.specs ? existingVariant.specs[sk.code] : undefined;
                var productVal = productSpecs ? productSpecs[sk.code] : undefined;
                var currentVal = variantVal !== undefined ? variantVal : productVal;
                var isInherited = variantVal === undefined && productVal !== undefined;
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
                        if (isInherited) {
                            sel.style.borderColor = '#93c5fd';
                            sel.style.background = '#f0f7ff';
                            sel.title = inheritedTitle;
                        }
                    }).catch(function () {
                        sel.innerHTML = '';
                        var errO = document.createElement('option');
                        errO.textContent = 'Ошибка загрузки';
                        sel.appendChild(errO);
                    });

                } else if (sk.valueType === 'float') {
                    if (sk.allowRange) {
                        var rw = el('div', 'display:flex;gap:6px;align-items:center;');
                        var minI = document.createElement('input');
                        minI.type = 'number'; minI.placeholder = 'от';
                        minI.dataset.specKey = sk.code; minI.dataset.vtype = 'range_min';
                        minI.style.cssText = 'flex:1;padding:7px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;' + (isInherited ? inheritedBorder + inheritedBg : '');
                        if (isInherited) minI.title = inheritedTitle;
                        if (Array.isArray(currentVal) && currentVal[0] != null) minI.value = currentVal[0];
                        var maxI = document.createElement('input');
                        maxI.type = 'number'; maxI.placeholder = 'до';
                        maxI.dataset.specKey = sk.code; maxI.dataset.vtype = 'range_max';
                        maxI.style.cssText = 'flex:1;padding:7px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;' + (isInherited ? inheritedBorder + inheritedBg : '');
                        if (isInherited) maxI.title = inheritedTitle;
                        if (Array.isArray(currentVal) && currentVal[1] != null) maxI.value = currentVal[1];
                        rw.appendChild(minI);
                        rw.appendChild(el('span', 'color:#9ca3af;font-size:14px;flex-shrink:0;', '—'));
                        rw.appendChild(maxI);
                        if (sk.unit) rw.appendChild(el('span', 'font-size:13px;color:#9ca3af;flex-shrink:0;', resolveUnit(sk.unit)));
                        content = rw;
                    } else {
                        var nw = el('div', 'position:relative;');
                        var nInp = document.createElement('input');
                        nInp.type = 'number'; nInp.step = 'any';
                        nInp.dataset.specKey = sk.code; nInp.dataset.vtype = 'float';
                        nInp.style.cssText = 'width:100%;box-sizing:border-box;padding:7px ' + (sk.unit ? '36px' : '8px') + ' 7px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;' + (isInherited ? inheritedBorder + inheritedBg : '');
                        if (isInherited) nInp.title = inheritedTitle;
                        if (currentVal != null) nInp.value = currentVal;
                        nw.appendChild(nInp);
                        if (sk.unit) nw.appendChild(el('span', 'position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:11px;color:#9ca3af;pointer-events:none;', resolveUnit(sk.unit)));
                        content = nw;
                    }
                } else {
                    var tInp = document.createElement('input');
                    tInp.type = 'text';
                    tInp.dataset.specKey = sk.code; tInp.dataset.vtype = 'text';
                    tInp.style.cssText = 'width:100%;box-sizing:border-box;padding:7px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:14px;' + (isInherited ? inheritedBorder + inheritedBg : '');
                    if (isInherited) tInp.title = inheritedTitle;
                    if (currentVal != null) tInp.value = currentVal;
                    content = tInp;
                }

                var lbl = (sk.labels && (sk.labels.ru || sk.labels.en)) || sk.code;
                if (sk.unit && sk.valueType === 'float' && !sk.allowRange) lbl += ', ' + resolveUnit(sk.unit);
                specsContainer.appendChild(fieldRow(lbl, content));
            });
        }

        if (typeSelect.value) rebuild(typeSelect.value);
        typeSelect.addEventListener('change', function () { rebuild(typeSelect.value); });

        return specsContainer;
    }

    // ===== IMAGES SECTION =====

    function renderImagesSection(modal, existingVariant) {
        var keptMedia = (existingVariant && existingVariant.media)
            ? existingVariant.media.filter(function (m) { return m.typeOfMedia === 'image'; }).slice()
            : [];
        var newFiles = []; // [{ file: File, previewUrl: string }]

        modal.appendChild(sectionHead('Фотографии'));

        var grid = el('div', 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;align-items:flex-start;');

        function makeThumb(imgSrc, onDelete, isNew) {
            var wrap = el('div', 'position:relative;width:80px;height:80px;flex-shrink:0;');
            var img = document.createElement('img');
            img.src = imgSrc;
            img.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:5px;display:block;' +
                (isNew ? 'border:2px solid #93c5fd;' : 'border:1px solid #e5e7eb;');
            var delBtn = el('button',
                'position:absolute;top:2px;right:2px;' +
                'background:rgba(0,0,0,0.55);color:#fff;border:none;' +
                'border-radius:50%;width:18px;height:18px;font-size:10px;' +
                'cursor:pointer;line-height:1;padding:0;',
                '✕'
            );
            delBtn.addEventListener('click', function () { onDelete(); wrap.remove(); });
            wrap.appendChild(img);
            wrap.appendChild(delBtn);
            return wrap;
        }

        var pasteZone = el('div',
            'display:flex;align-items:center;justify-content:center;' +
            'width:80px;height:80px;border:2px dashed #d1d5db;border-radius:6px;' +
            'color:#9ca3af;text-align:center;cursor:default;flex-shrink:0;' +
            'padding:6px;box-sizing:border-box;line-height:1.3;font-size:11px;'
        );
        pasteZone.innerHTML = '<span>Ctrl+V<br><span style="font-size:10px">вставить<br>скриншот</span></span>';

        keptMedia.forEach(function (m) {
            var captured = m;
            grid.appendChild(makeThumb(
                CRYSTAL_BASE + '/api/files/image?path=' + encodeURIComponent(m.url),
                function () {
                    var i = keptMedia.indexOf(captured);
                    if (i !== -1) keptMedia.splice(i, 1);
                },
                false
            ));
        });
        grid.appendChild(pasteZone);
        modal.appendChild(grid);

        function addNewImage(file) {
            var previewUrl = URL.createObjectURL(file);
            var item = { file: file, previewUrl: previewUrl };
            newFiles.push(item);
            grid.insertBefore(makeThumb(
                previewUrl,
                function () {
                    var i = newFiles.indexOf(item);
                    if (i !== -1) { newFiles.splice(i, 1); URL.revokeObjectURL(previewUrl); }
                },
                true
            ), pasteZone);
        }

        return {
            addNewImage: addNewImage,
            getMediaDto: function () {
                var result = [];
                keptMedia.forEach(function (m, i) {
                    result.push(Object.assign({}, m, { order: i }));
                });
                newFiles.forEach(function (item, i) {
                    result.push({ url: 'FILE::' + item.file.name, order: keptMedia.length + i, typeOfMedia: 'image', useType: 'marketing', alt: '' });
                });
                return result;
            },
            getFiles: function () { return newFiles.map(function (item) { return item.file; }); },
            cleanup: function () { newFiles.forEach(function (item) { URL.revokeObjectURL(item.previewUrl); }); }
        };
    }

    function collectData(extInputs, intInputs, weightInp, specsContainer) {
        function dimVals(inputs) {
            var obj = {};
            inputs.forEach(function (inp) {
                var v = parseFloat(inp.value);
                if (!isNaN(v)) obj[inp.dataset.axis] = v;
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

        specsContainer.querySelectorAll('[data-spec-key]').forEach(function (node) {
            var key = node.dataset.specKey;
            var vtype = node.dataset.vtype;
            if (vtype === 'enum') {
                if (node.value) specs[key] = node.value;
            } else if (vtype === 'float') {
                var v = parseFloat(node.value);
                if (!isNaN(v)) specs[key] = v;
            } else if (vtype === 'range_min' || vtype === 'range_max') {
                if (!specs[key]) specs[key] = [null, null];
                var rv = parseFloat(node.value);
                if (!isNaN(rv)) specs[key][vtype === 'range_min' ? 0 : 1] = rv;
            } else if (vtype === 'text') {
                var s = node.value.trim();
                if (s) specs[key] = s;
            }
        });

        Object.keys(specs).forEach(function (k) {
            if (Array.isArray(specs[k]) && specs[k][0] === null && specs[k][1] === null) delete specs[k];
        });

        return { dims: dims, weight: isNaN(w) ? null : w, specs: specs };
    }

    // ===== FORM =====

    function renderForm(modal, baseArticle, productName, found, types, specKeys, formData) {
        var existingProduct = found ? found.product : null;
        var existingVariant = found ? found.variant : null;

        // Имена для Crystal из формы: группа, вариант, bitrixName
        var crystalProductName = (formData && formData.productName) || productName || baseArticle;
        var crystalVariantName = (formData && (formData.variantName || formData.name)) || productName || baseArticle;
        var crystalBitrixName  = formData ? (formData.bitrixName || formData.name || null) : null;

        if (existingVariant) renderBadge(modal, existingVariant);

        // Type selector
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
            typeSelect.disabled = true;
            typeSelect.style.cssText = 'width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:5px;font-size:14px;background:#f9fafb;color:#6b7280;cursor:default;';
            typeSelect.title = 'Тип задан на уровне продукта';
        }
        modal.appendChild(fieldRow('Тип продукта', typeSelect));

        var physical = renderPhysicalSection(modal, existingVariant);
        var productSpecs = existingProduct && existingProduct.defaultSpecs ? existingProduct.defaultSpecs : null;
        var specsContainer = renderSpecsSection(modal, existingVariant, typeSelect, specKeys, productSpecs);
        var imagesSection = renderImagesSection(modal, existingVariant);

        // Paste handler — слушаем на document, самоудаляется когда оверлей закрыт
        function handlePaste(e) {
            if (!document.getElementById('ccp-overlay')) {
                document.removeEventListener('paste', handlePaste);
                return;
            }
            var items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            for (var i = 0; i < items.length; i++) {
                if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
                    var blob = items[i].getAsFile();
                    if (!blob) break;
                    var name = 'screenshot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.png';
                    imagesSection.addNewImage(new File([blob], name, { type: blob.type || 'image/png' }));
                    e.preventDefault();
                    break;
                }
            }
        }
        document.addEventListener('paste', handlePaste);

        // Footer
        var footer = el('div', 'border-top:1px solid #e5e7eb;padding-top:16px;margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;');
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

        var saveStatus = el('div', 'width:100%;font-size:13px;min-height:16px;text-align:center;');

        footer.appendChild(saveBtn);
        footer.appendChild(cancelBtn);
        footer.appendChild(saveStatus);
        modal.appendChild(footer);

        saveBtn.addEventListener('click', function () {
            var typeCode = typeSelect.value;
            if (!typeCode) {
                saveStatus.style.color = '#dc2626';
                saveStatus.textContent = 'Выберите тип продукта';
                return;
            }

            var bxUserId   = currentBitrixUser ? currentBitrixUser.id   : null;
            var bxUserName = currentBitrixUser ? currentBitrixUser.name : null;

            var data = collectData(physical.extInputs, physical.intInputs, physical.weightInp, specsContainer);
            var editorMeta = {
                bitrixUserId:   bxUserId ? Number(bxUserId) : undefined,
                bitrixUserName: bxUserName || undefined
            };
            var mediaDto = imagesSection.getMediaDto();
            var newFiles = imagesSection.getFiles();
            var physicalDto = {
                weight:     data.weight,
                dimensions: Object.keys(data.dims).length ? data.dims : undefined,
                specs:      data.specs,
                media:      mediaDto,
                isActive:   true
            };

            saveBtn.disabled = true;
            saveBtn.textContent = '⧗ Сохранение...';
            saveStatus.style.color = '#6b7280';
            saveStatus.textContent = '';

            function doSave(apiPath, method, dto) {
                if (newFiles.length > 0) return apiFetchForm(method, apiPath, dto, newFiles);
                if (method === 'PATCH') return apiPatch(apiPath, dto);
                return apiPost(apiPath, dto);
            }

            var promise;
            if (existingVariant && existingProduct) {
                var variantDto = Object.assign({
                    article:    existingVariant.article,
                    name:       existingVariant.name,
                    specs:      data.specs,
                    dimensions: Object.keys(data.dims).length ? data.dims : undefined,
                    weight:     data.weight,
                    media:      mediaDto,
                    isActive:   true
                }, editorMeta);
                promise = doSave('/products/variants/' + existingVariant.id, 'PATCH', variantDto);
            } else if (existingProduct) {
                promise = doSave('/products/addVariant/' + existingProduct.id, 'POST',
                    Object.assign({
                        article:    baseArticle,
                        name:       { ru: crystalVariantName, en: crystalVariantName },
                        bitrixName: crystalBitrixName || undefined
                    }, physicalDto, editorMeta));
            } else {
                promise = doSave('/products/findOrCreate', 'POST', {
                    productTypeCode: typeCode,
                    name:       { ru: crystalProductName, en: crystalProductName },
                    article:    baseArticle,
                    bitrixName: crystalBitrixName || undefined,
                    variants:   [Object.assign({
                        article:    baseArticle,
                        name:       { ru: crystalVariantName, en: crystalVariantName },
                        bitrixName: crystalBitrixName || undefined
                    }, physicalDto)]
                });
            }

            promise
                .then(function () {
                    imagesSection.cleanup();
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

    BX.ready(function () {
        if (!window.location.href.match(/crm\/deal\/details\/(\d+)/)) return;
    });

})();
