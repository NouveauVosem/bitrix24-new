(function () {
    'use strict';

    // ===== КОНСТАНТЫ =====

    var CRYSTAL_BASE = 'https://crystal.alvla.tools';
    var API_KEY = 'legenda';
    var PRINT_QUEUE_USER_IDS = [19, 23, 26, 53]; // Павел, Ярослав, Наталья, Лиля
    var IDB_NAME = 'crystal_print_panel';
    var IDB_STORE = 'handles';
    var ROOT_DIR_KEY = 'printRootDir';

    // ===== BITRIX BRIDGE =====

    var currentBitrixUser = null;
    function loadCurrentUser() {
        if (currentBitrixUser) return Promise.resolve(currentBitrixUser);
        return fetch('/local/ajax/crystal/get_current_user.php')
            .then(function (r) { return r.json(); })
            .then(function (u) { currentBitrixUser = u; return u; })
            .catch(function () { return null; });
    }

    // ===== CRYSTAL API =====

    function listPrints(taskId) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs?taskId=' + encodeURIComponent(taskId), {
            headers: { 'X-Api-Key': API_KEY }
        }).then(function (r) { return r.json(); });
    }

    function listPrintsByStatus(status) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs?status=' + encodeURIComponent(status), {
            headers: { 'X-Api-Key': API_KEY }
        }).then(function (r) { return r.json(); });
    }

    function uploadPrint(fd) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs', {
            method: 'POST',
            headers: { 'X-Api-Key': API_KEY },
            body: fd
        }).then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error(body.message || 'Ошибка загрузки');
                return body;
            });
        });
    }

    function attachPrintFile(id, fd) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs/' + encodeURIComponent(id) + '/file', {
            method: 'POST',
            headers: { 'X-Api-Key': API_KEY },
            body: fd
        }).then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error(body.message || 'Ошибка загрузки файла');
                return body;
            });
        });
    }

    function updatePrintStatus(id, status) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs/' + encodeURIComponent(id) + '/status', {
            method: 'PATCH',
            headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: status })
        }).then(function (r) { return r.json(); });
    }

    function addReference(id, fd) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs/' + encodeURIComponent(id) + '/references', {
            method: 'POST',
            headers: { 'X-Api-Key': API_KEY },
            body: fd
        }).then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error(body.message || 'Ошибка загрузки референса');
                return body;
            });
        });
    }

    function deleteReference(id, remotePath) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs/' + encodeURIComponent(id) + '/references?path=' + encodeURIComponent(remotePath), {
            method: 'DELETE',
            headers: { 'X-Api-Key': API_KEY }
        }).then(function (r) { return r.json(); });
    }

    function fetchReferenceBlob(id, remotePath) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs/' + encodeURIComponent(id) + '/references/file?path=' + encodeURIComponent(remotePath), {
            headers: { 'X-Api-Key': API_KEY }
        }).then(function (r) {
            if (!r.ok) throw new Error('Не удалось загрузить файл');
            return r.blob();
        });
    }

    function deletePrint(id) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs/' + encodeURIComponent(id), {
            method: 'DELETE',
            headers: { 'X-Api-Key': API_KEY }
        }).then(function (r) { return r.json(); });
    }

    // Справочники тканей/цветов — грузятся один раз за сессию страницы и кэшируются
    var fabricsCache = null;
    function listFabrics() {
        if (!fabricsCache) {
            fabricsCache = fetch(CRYSTAL_BASE + '/api/fabrics', { headers: { 'X-Api-Key': API_KEY } })
                .then(function (r) { return r.json(); })
                .catch(function (e) { fabricsCache = null; throw e; });
        }
        return fabricsCache;
    }

    var fabricColorsCache = null;
    function listFabricColors() {
        if (!fabricColorsCache) {
            fabricColorsCache = fetch(CRYSTAL_BASE + '/api/fabrics/colors', { headers: { 'X-Api-Key': API_KEY } })
                .then(function (r) { return r.json(); })
                .catch(function (e) { fabricColorsCache = null; throw e; });
        }
        return fabricColorsCache;
    }

    function fetchPrintFile(id) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs/' + encodeURIComponent(id) + '/file', {
            headers: { 'X-Api-Key': API_KEY }
        }).then(function (r) {
            if (!r.ok) throw new Error('Не удалось скачать файл');
            return r.blob();
        });
    }

    // ===== СТАТУСЫ =====

    var STATUSES = [
        { value: 'pending',  label: 'Запрос создан',          color: '#aaa' },
        { value: 'ready',    label: 'Файл готов к печати',    color: '#2fc6f6' },
        { value: 'printed',  label: 'Напечатано',             color: '#f39c12' },
        { value: 'applied',  label: 'Нанесено на ткань',      color: '#27ae60' },
    ];

    function statusInfo(value) {
        for (var i = 0; i < STATUSES.length; i++) {
            if (STATUSES[i].value === value) return STATUSES[i];
        }
        return { value: value, label: value, color: '#aaa' };
    }

    function renderStatusBadge(status) {
        var info = statusInfo(status);
        var el = document.createElement('span');
        el.style.cssText = 'display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;background:' + info.color + ';';
        el.textContent = info.label;
        return el;
    }

    function renderStatusSelector(currentStatus, onSelect) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;';
        STATUSES.forEach(function (s) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = s.label;
            var active = s.value === currentStatus;
            btn.style.cssText = 'padding:3px 10px;border-radius:12px;font-size:12px;cursor:pointer;border:2px solid ' + s.color + ';' +
                'background:' + (active ? s.color : '#fff') + ';color:' + (active ? '#fff' : s.color) + ';font-weight:' + (active ? '600' : '400') + ';';
            btn.onclick = function () {
                if (!active) onSelect(s.value);
            };
            wrap.appendChild(btn);
        });
        return wrap;
    }

    // ===== СТРУКТУРИРОВАННЫЕ НАСТРОЙКИ ПЕЧАТИ =====

    var HEAT_DEFAULTS = {
        crocodile: { time: 60, temperature: 205 },
        hippo: { time: 80, temperature: 190 }
    };

    function numOrNull(v) {
        if (v === '' || v === null || v === undefined) return null;
        var n = Number(v);
        return isNaN(n) ? null : n;
    }

    function formatPrintSettings(ps) {
        var lines = [];
        if (!ps) return lines;

        if (ps.graphicSize && (ps.graphicSize.width || ps.graphicSize.height)) {
            lines.push('Графика: ' + (ps.graphicSize.width || '?') + '×' + (ps.graphicSize.height || '?') + ' мм');
        }

        if (ps.printFabric) {
            if (ps.printFabric.colorMode === 'picker' && ps.printFabric.color) {
                var pfc = ps.printFabric.color;
                var pfcLabel = pfc.colorName + (pfc.colorCode ? ' ' + pfc.colorCode : '') + ' (' + pfc.fabricCode + ')';
                lines.push('Ткань для печати: ' + pfcLabel);
            } else if (ps.printFabric.colorMode === 'text' && ps.printFabric.colorText) {
                lines.push('Ткань для печати: ' + ps.printFabric.colorText);
            }
        }

        if (ps.fill && ps.fill.enabled) {
            var colorLabel = '';
            if (ps.fill.colorMode === 'picker' && ps.fill.color) {
                colorLabel = ', цвет: ' + ps.fill.color.colorName + ' (' + ps.fill.color.fabricCode + ')';
            } else if (ps.fill.colorMode === 'text' && ps.fill.colorText) {
                colorLabel = ', цвет: ' + ps.fill.colorText;
            }
            lines.push('Заливка: ' + (ps.fill.width || '?') + '×' + (ps.fill.height || '?') + ' мм' + colorLabel);
        }

        if (ps.heatTransfer && (ps.heatTransfer.time || ps.heatTransfer.temperature)) {
            var pressLabel = ps.heatTransfer.pressType === 'hippo' ? 'Бегемот' : 'Крокодил';
            lines.push('Пресс: ' + pressLabel + ', ' + (ps.heatTransfer.time || '?') + ' сек, ' + (ps.heatTransfer.temperature || '?') + '°C');
        }

        if (ps.dashedBorder && ps.dashedBorder.enabled) {
            var shapeLabel = ps.dashedBorder.shape === 'oval' ? 'Овал' : 'Квадрат';
            var borderLine = 'Пунктирная рамка (' + shapeLabel + '): ' + (ps.dashedBorder.width || '?') + '×' + (ps.dashedBorder.height || '?') + ' мм';
            if (ps.dashedBorder.shape !== 'oval' && ps.dashedBorder.radius) borderLine += ', R' + ps.dashedBorder.radius;
            lines.push(borderLine);
        }

        if (!lines.length && ps.raw) lines.push(ps.raw);
        return lines;
    }

    function sectionTitle(text) {
        var t = document.createElement('div');
        t.style.cssText = 'font-weight:600;font-size:13px;margin:14px 0 8px;color:#333;';
        t.textContent = text;
        return t;
    }

    function numberField(labelText) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'flex:1;';
        var label = document.createElement('div');
        label.style.cssText = 'font-size:12px;color:#666;margin-bottom:4px;';
        label.textContent = labelText;
        wrap.appendChild(label);
        var input = document.createElement('input');
        input.type = 'number';
        input.style.cssText = 'width:100%;padding:6px;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;';
        wrap.appendChild(input);
        return { el: wrap, input: input };
    }

    // Универсальный переключатель на N вариантов
    function segmentedToggle(options, defaultValue) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'display:inline-flex;border:1px solid #ddd;border-radius:6px;overflow:hidden;margin-bottom:8px;';

        var current = defaultValue;
        var changeHandlers = [];
        var buttons = [];

        function paint() {
            buttons.forEach(function (b) {
                if (b.value === current) {
                    b.btn.style.background = '#2fc6f6';
                    b.btn.style.color = '#fff';
                } else {
                    b.btn.style.background = '#fff';
                    b.btn.style.color = '#333';
                }
            });
        }

        options.forEach(function (opt) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = opt.label;
            btn.style.cssText = 'border:none;padding:6px 12px;font-size:12px;cursor:pointer;';
            btn.onclick = function () {
                if (current === opt.value) return;
                current = opt.value;
                paint();
                changeHandlers.forEach(function (h) { h(current); });
            };
            buttons.push({ btn: btn, value: opt.value });
            wrap.appendChild(btn);
        });
        paint();

        return {
            el: wrap,
            getValue: function () { return current; },
            setValue: function (v) { current = v; paint(); },
            onChange: function (h) { changeHandlers.push(h); }
        };
    }

    // Числовое поле с кнопками-пресетами и плашкой предупреждения
    function presetNumberField(labelText, presets, unit) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'margin-bottom:12px;';

        var label = document.createElement('div');
        label.style.cssText = 'font-size:12px;color:#666;margin-bottom:4px;';
        label.textContent = labelText;
        wrap.appendChild(label);

        var row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:center;';

        var input = document.createElement('input');
        input.type = 'number';
        input.style.cssText = 'width:80px;padding:6px;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;';
        row.appendChild(input);

        var manualHandlers = [];
        presets.forEach(function (p) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ui-btn ui-btn-light-border ui-btn-xs';
            btn.textContent = p + (unit || '');
            btn.onclick = function () {
                input.value = p;
                manualHandlers.forEach(function (h) { h(p); });
            };
            row.appendChild(btn);
        });
        wrap.appendChild(row);

        var warning = document.createElement('div');
        warning.style.cssText = 'display:none;margin-top:6px;background:#fff3cd;color:#856404;border:1px solid #ffe69c;border-radius:6px;padding:6px 8px;font-size:12px;';
        warning.textContent = '⚠ Внимание, это особенная настройка.';
        wrap.appendChild(warning);

        input.addEventListener('input', function () {
            manualHandlers.forEach(function (h) { h(input.value); });
        });

        return {
            el: wrap,
            getValue: function () { return input.value; },
            setValue: function (v) { input.value = v; },
            setWarning: function (show) { warning.style.display = show ? 'block' : 'none'; },
            onManualChange: function (h) { manualHandlers.push(h); }
        };
    }

    // Переключатель "выбрать цвет ткани из списка / вписать текстом"
    function renderFabricColorPicker(placeholderText) {
        var state = { fabricColor: null };
        var wrap = document.createElement('div');

        var modeToggle = segmentedToggle([{ label: 'Выбрать из списка', value: 'picker' }, { label: 'Свой текст', value: 'text' }], 'picker');
        wrap.appendChild(modeToggle.el);

        var pickBtn = document.createElement('button');
        pickBtn.type = 'button';
        pickBtn.className = 'ui-btn ui-btn-light-border ui-btn-sm';
        pickBtn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;text-align:left;box-sizing:border-box;';
        var swatch = document.createElement('span');
        swatch.style.cssText = 'display:inline-block;width:14px;height:14px;border-radius:50%;border:1px solid #ccc;flex-shrink:0;background:#eee;';
        var pickLabel = document.createElement('span');
        pickLabel.textContent = placeholderText;
        pickBtn.appendChild(swatch);
        pickBtn.appendChild(pickLabel);
        pickBtn.onclick = function () {
            openFabricColorPicker(function (picked) {
                state.fabricColor = picked;
                swatch.style.background = picked.hex || '#eee';
                pickLabel.textContent = picked.colorName + ' (' + picked.fabricCode + ')';
            });
        };
        wrap.appendChild(pickBtn);

        var textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.placeholder = 'Например: красный лён';
        textInput.style.cssText = 'display:none;width:100%;padding:6px;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;';
        wrap.appendChild(textInput);

        modeToggle.onChange(function (mode) {
            pickBtn.style.display = mode === 'picker' ? 'flex' : 'none';
            textInput.style.display = mode === 'text' ? 'block' : 'none';
        });

        return {
            el: wrap,
            getValue: function () {
                return {
                    colorMode: modeToggle.getValue(),
                    color: modeToggle.getValue() === 'picker' ? state.fabricColor : null,
                    colorText: modeToggle.getValue() === 'text' ? textInput.value : ''
                };
            },
            reset: function () {
                modeToggle.setValue('picker');
                pickBtn.style.display = 'flex';
                textInput.style.display = 'none';
                textInput.value = '';
                state.fabricColor = null;
                swatch.style.background = '#eee';
                pickLabel.textContent = placeholderText;
            }
        };
    }

    function renderPrintSettingsFields() {
        var wrap = document.createElement('div');

        // ---- Размер графики ----
        wrap.appendChild(sectionTitle('Размер графики'));
        var graphicRow = document.createElement('div');
        graphicRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
        var graphicWidth = numberField('Ш, мм');
        var graphicHeight = numberField('В, мм');
        graphicRow.appendChild(graphicWidth.el);
        graphicRow.appendChild(graphicHeight.el);
        wrap.appendChild(graphicRow);

        // ---- Ткань, на которой печатаем ----
        wrap.appendChild(sectionTitle('Ткань для печати'));
        var printFabricField = renderFabricColorPicker('Выбрать ткань для печати…');
        wrap.appendChild(printFabricField.el);

        // ---- Заливка ----
        wrap.appendChild(sectionTitle('Заливка'));
        var fillToggle = segmentedToggle([{ label: 'Нет', value: false }, { label: 'Есть', value: true }], false);
        wrap.appendChild(fillToggle.el);

        var fillDetails = document.createElement('div');
        fillDetails.style.cssText = 'display:none;padding:10px;background:#f8f9fb;border-radius:8px;margin-bottom:8px;';
        wrap.appendChild(fillDetails);

        var fillSizeRow = document.createElement('div');
        fillSizeRow.style.cssText = 'display:flex;gap:8px;margin-bottom:10px;';
        var fillWidth = numberField('Ш, мм');
        var fillHeight = numberField('В, мм');
        fillSizeRow.appendChild(fillWidth.el);
        fillSizeRow.appendChild(fillHeight.el);
        fillDetails.appendChild(fillSizeRow);

        var colorModeLabel = document.createElement('div');
        colorModeLabel.style.cssText = 'font-size:12px;color:#666;margin-bottom:4px;';
        colorModeLabel.textContent = 'Цвет ткани:';
        fillDetails.appendChild(colorModeLabel);

        var fillColorField = renderFabricColorPicker('Выбрать цвет ткани…');
        fillDetails.appendChild(fillColorField.el);

        fillToggle.onChange(function (enabled) {
            fillDetails.style.display = enabled ? 'block' : 'none';
        });

        // ---- Пунктирная рамка ----
        wrap.appendChild(sectionTitle('Пунктирная рамка'));
        var borderToggle = segmentedToggle([{ label: 'Нет', value: false }, { label: 'Есть', value: true }], false);
        wrap.appendChild(borderToggle.el);

        var borderDetails = document.createElement('div');
        borderDetails.style.cssText = 'display:none;padding:10px;background:#f8f9fb;border-radius:8px;margin-bottom:8px;';
        wrap.appendChild(borderDetails);

        var borderShapeLabel = document.createElement('div');
        borderShapeLabel.style.cssText = 'font-size:12px;color:#666;margin-bottom:4px;';
        borderShapeLabel.textContent = 'Форма:';
        borderDetails.appendChild(borderShapeLabel);

        var borderShapeToggle = segmentedToggle([{ label: 'Квадрат', value: 'rect' }, { label: 'Овал', value: 'oval' }], 'rect');
        borderDetails.appendChild(borderShapeToggle.el);

        var borderSizeRow = document.createElement('div');
        borderSizeRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;margin-bottom:8px;';
        var borderWidth = numberField('Ш, мм');
        var borderHeight = numberField('В, мм');
        borderSizeRow.appendChild(borderWidth.el);
        borderSizeRow.appendChild(borderHeight.el);
        borderDetails.appendChild(borderSizeRow);

        var borderRadiusWrap = document.createElement('div');
        borderDetails.appendChild(borderRadiusWrap);
        var borderRadius = numberField('Радиус скругления, мм');
        borderRadiusWrap.appendChild(borderRadius.el);

        borderShapeToggle.onChange(function (shape) {
            borderRadiusWrap.style.display = shape === 'oval' ? 'none' : 'block';
        });

        borderToggle.onChange(function (enabled) {
            borderDetails.style.display = enabled ? 'block' : 'none';
        });

        // ---- Теплоперенос ----
        wrap.appendChild(sectionTitle('Настройки теплопереноса'));

        var pressLabel = document.createElement('div');
        pressLabel.style.cssText = 'font-size:12px;color:#666;margin-bottom:4px;';
        pressLabel.textContent = 'Тип пресса:';
        wrap.appendChild(pressLabel);

        var pressToggle = segmentedToggle([{ label: 'Крокодил', value: 'crocodile' }, { label: 'Бегемот', value: 'hippo' }], 'crocodile');
        wrap.appendChild(pressToggle.el);

        var timeField = presetNumberField('Время переноса, сек', [60, 80]);
        wrap.appendChild(timeField.el);

        var tempField = presetNumberField('Температура, °C', [190, 205]);
        wrap.appendChild(tempField.el);

        function applyDefaults(pressType) {
            var d = HEAT_DEFAULTS[pressType];
            timeField.setValue(d.time);
            timeField.setWarning(false);
            tempField.setValue(d.temperature);
            tempField.setWarning(false);
        }
        pressToggle.onChange(function (val) { applyDefaults(val); });

        timeField.onManualChange(function (val) {
            timeField.setWarning(Number(val) !== HEAT_DEFAULTS[pressToggle.getValue()].time);
        });
        tempField.onManualChange(function (val) {
            tempField.setWarning(Number(val) !== HEAT_DEFAULTS[pressToggle.getValue()].temperature);
        });

        applyDefaults('crocodile');

        function reset() {
            graphicWidth.input.value = '';
            graphicHeight.input.value = '';
            printFabricField.reset();
            fillToggle.setValue(false);
            fillDetails.style.display = 'none';
            fillWidth.input.value = '';
            fillHeight.input.value = '';
            fillColorField.reset();
            borderToggle.setValue(false);
            borderDetails.style.display = 'none';
            borderShapeToggle.setValue('rect');
            borderRadiusWrap.style.display = 'block';
            borderWidth.input.value = '';
            borderHeight.input.value = '';
            borderRadius.input.value = '';
            pressToggle.setValue('crocodile');
            applyDefaults('crocodile');
        }

        return {
            el: wrap,
            reset: reset,
            getValue: function () {
                var fillColor = fillColorField.getValue();
                return {
                    graphicSize: { width: numOrNull(graphicWidth.input.value), height: numOrNull(graphicHeight.input.value) },
                    printFabric: printFabricField.getValue(),
                    fill: {
                        enabled: fillToggle.getValue(),
                        width: numOrNull(fillWidth.input.value),
                        height: numOrNull(fillHeight.input.value),
                        colorMode: fillColor.colorMode,
                        color: fillColor.color,
                        colorText: fillColor.colorText
                    },
                    heatTransfer: {
                        pressType: pressToggle.getValue(),
                        time: numOrNull(timeField.getValue()),
                        temperature: numOrNull(tempField.getValue())
                    },
                    dashedBorder: {
                        enabled: borderToggle.getValue(),
                        shape: borderShapeToggle.getValue(),
                        width: numOrNull(borderWidth.input.value),
                        height: numOrNull(borderHeight.input.value),
                        radius: borderShapeToggle.getValue() === 'oval' ? null : numOrNull(borderRadius.input.value)
                    }
                };
            }
        };
    }

    // Пикер цвета ткани: чипы тканей → чипы цветов выбранной ткани
    function openFabricColorPicker(onPick) {
        var overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9600;' +
            'display:flex;align-items:center;justify-content:center;';

        var box = document.createElement('div');
        box.style.cssText =
            'background:#fff;border-radius:10px;width:560px;max-width:94vw;max-height:80vh;' +
            'overflow-y:auto;padding:18px;position:relative;font-size:14px;color:#333;';

        var closeBtn = document.createElement('div');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'position:absolute;top:12px;right:16px;cursor:pointer;font-size:16px;color:#888;';
        closeBtn.onclick = function () { overlay.remove(); };
        box.appendChild(closeBtn);

        var title = document.createElement('h3');
        title.style.cssText = 'margin:0 0 12px;font-size:15px;padding-right:20px;';
        title.textContent = 'Выберите ткань';
        box.appendChild(title);

        var searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Поиск…';
        searchInput.style.cssText = 'width:100%;padding:7px;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;';
        box.appendChild(searchInput);

        var chipsWrap = document.createElement('div');
        chipsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
        box.appendChild(chipsWrap);

        var loading = document.createElement('div');
        loading.style.cssText = 'color:#999;';
        loading.textContent = 'Загрузка…';
        chipsWrap.appendChild(loading);

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        function chip(label, onClick) {
            var el = document.createElement('div');
            el.textContent = label;
            el.style.cssText = 'padding:8px 14px;border:1px solid #ddd;border-radius:20px;cursor:pointer;font-size:13px;';
            el.onmouseenter = function () { el.style.background = '#f2f7fb'; };
            el.onmouseleave = function () { el.style.background = '#fff'; };
            el.onclick = onClick;
            return el;
        }

        function renderFabricStep(fabrics, colors) {
            title.textContent = 'Выберите ткань';
            closeBtn.onclick = function () { overlay.remove(); };

            function paint(items) {
                chipsWrap.innerHTML = '';
                if (!items.length) {
                    var empty = document.createElement('div');
                    empty.style.color = '#999';
                    empty.textContent = 'Ничего не найдено';
                    chipsWrap.appendChild(empty);
                    return;
                }
                items.forEach(function (f) {
                    var label = f.name ? (f.name + ' (' + f.code + ')') : f.code;
                    chipsWrap.appendChild(chip(label, function () {
                        renderColorStep(f, colors.filter(function (c) { return c.fabricCode === f.code; }), fabrics, colors);
                    }));
                });
            }

            searchInput.value = '';
            searchInput.oninput = function () {
                var q = searchInput.value.toLowerCase();
                paint(fabrics.filter(function (f) {
                    return (f.name || '').toLowerCase().indexOf(q) !== -1 || (f.code || '').toLowerCase().indexOf(q) !== -1;
                }));
            };
            paint(fabrics);
        }

        function renderColorStep(fabric, fabricColors, allFabrics, allColors) {
            title.textContent = 'Цвет ткани: ' + (fabric.name || fabric.code);

            chipsWrap.innerHTML = '';
            var backBtn = document.createElement('div');
            backBtn.textContent = '← Назад к тканям';
            backBtn.style.cssText = 'color:#2fc6f6;cursor:pointer;font-size:12px;width:100%;margin-bottom:4px;';
            backBtn.onclick = function () { renderFabricStep(allFabrics, allColors); };
            chipsWrap.appendChild(backBtn);

            var chipsRow = document.createElement('div');
            chipsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;width:100%;';
            chipsWrap.appendChild(chipsRow);

            function paint(items) {
                chipsRow.innerHTML = '';
                if (!items.length) {
                    var empty = document.createElement('div');
                    empty.style.color = '#999';
                    empty.textContent = 'Цвета не найдены';
                    chipsRow.appendChild(empty);
                    return;
                }
                items.forEach(function (c) {
                    var el = document.createElement('div');
                    el.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid #ddd;border-radius:20px;cursor:pointer;font-size:13px;';
                    var dot = document.createElement('span');
                    dot.style.cssText = 'display:inline-block;width:14px;height:14px;border-radius:50%;border:1px solid #ccc;background:' + (c.hex || '#eee') + ';';
                    el.appendChild(dot);
                    var lbl = document.createElement('span');
                    lbl.textContent = c.name;
                    el.appendChild(lbl);
                    el.onmouseenter = function () { el.style.background = '#f2f7fb'; };
                    el.onmouseleave = function () { el.style.background = '#fff'; };
                    el.onclick = function () {
                        onPick({
                            fabricCode: fabric.code,
                            fabricName: fabric.name || null,
                            colorId: c.id,
                            colorCode: c.code,
                            colorName: c.name,
                            hex: c.hex || null
                        });
                        overlay.remove();
                    };
                    chipsRow.appendChild(el);
                });
            }

            searchInput.value = '';
            searchInput.oninput = function () {
                var q = searchInput.value.toLowerCase();
                paint(fabricColors.filter(function (c) {
                    return (c.name || '').toLowerCase().indexOf(q) !== -1 || (c.code || '').toLowerCase().indexOf(q) !== -1;
                }));
            };
            paint(fabricColors);
        }

        Promise.all([listFabrics(), listFabricColors()]).then(function (res) {
            renderFabricStep(res[0] || [], res[1] || []);
        }).catch(function (e) {
            chipsWrap.innerHTML = '';
            var err = document.createElement('div');
            err.style.color = '#c0392b';
            err.textContent = 'Не удалось загрузить список тканей: ' + e.message;
            chipsWrap.appendChild(err);
        });
    }

    // ===== FILE SYSTEM ACCESS (скачивание в папку клиента на ПК) =====

    function renderFolderStatus() {
        var wrap = document.createElement('div');
        wrap.style.cssText =
            'display:flex;align-items:center;gap:8px;background:#f8f9fb;border:1px solid #eee;' +
            'border-radius:8px;padding:8px 10px;margin-bottom:14px;font-size:13px;';

        var label = document.createElement('span');
        label.style.cssText = 'flex:1;color:#555;';
        wrap.appendChild(label);

        var btn = document.createElement('button');
        btn.className = 'ui-btn ui-btn-light-border ui-btn-xs';
        wrap.appendChild(btn);

        btn.onclick = function () {
            chooseRootDir().then(function () {
                refresh();
            }).catch(function (e) {
                if (e && e.name === 'AbortError') return;
                alert('Не удалось выбрать папку: ' + e.message);
            });
        };

        function refresh() {
            if (!window.showDirectoryPicker) {
                label.textContent = 'Браузер не поддерживает сохранение в папку (нужен Chrome/Edge)';
                btn.style.display = 'none';
                return;
            }
            peekRootDirHandle().then(function (result) {
                if (result && result.granted) {
                    label.textContent = 'Папка для сохранения: ' + result.handle.name;
                    btn.textContent = 'Сменить';
                } else if (result && result.handle) {
                    label.textContent = 'Папка выбрана (' + result.handle.name + '), доступ подтвердится при скачивании';
                    btn.textContent = 'Сменить';
                } else {
                    label.textContent = 'Папка не настроена — создайте её (например C:\\PrintJobs) и укажите один раз';
                    btn.textContent = 'Настроить';
                }
            });
        }
        refresh();

        return { el: wrap, refresh: refresh };
    }

    function downloadToFolder(item, getInfo, taskId) {
        if (!window.showDirectoryPicker) {
            return Promise.reject(new Error('Браузер не поддерживает сохранение в папку (нужен Chrome/Edge)'));
        }

        var info = getInfo();
        var client = info.client || 'Клиент';
        var dealId = info.dealId || taskId;
        var folderName = sanitizeFolderName(client + ' (bid-' + dealId + ')');

        return getRootDirHandle()
            .then(function (rootHandle) {
                return rootHandle.getDirectoryHandle(folderName, { create: true });
            })
            .then(function (clientDirHandle) {
                return fetchPrintFile(item.id).then(function (blob) {
                    return clientDirHandle.getFileHandle(item.originalName, { create: true }).then(function (fileHandle) {
                        return fileHandle.createWritable().then(function (writable) {
                            return writable.write(blob).then(function () {
                                return writable.close().then(function () {
                                    return { folderName: folderName, fileName: item.originalName };
                                });
                            });
                        });
                    });
                });
            });
    }

    function sanitizeFolderName(name) {
        return name.replace(/[<>:"/\\|?*]/g, '_').trim();
    }

    function getRootDirHandle() {
        return idbGet(ROOT_DIR_KEY).then(function (handle) {
            if (handle) {
                return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
                    if (perm === 'granted') return handle;
                    return handle.requestPermission({ mode: 'readwrite' }).then(function (perm2) {
                        if (perm2 === 'granted') return handle;
                        throw new Error('Доступ к папке не подтверждён');
                    });
                });
            }
            return chooseRootDir();
        });
    }

    function peekRootDirHandle() {
        return idbGet(ROOT_DIR_KEY).then(function (handle) {
            if (!handle) return null;
            return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
                return { handle: handle, granted: perm === 'granted' };
            });
        });
    }

    function chooseRootDir() {
        return window.showDirectoryPicker({ mode: 'readwrite', id: 'crystal-print-root', startIn: 'desktop' })
            .then(function (handle) {
                return idbSet(ROOT_DIR_KEY, handle).then(function () { return handle; });
            });
    }

    // ===== МИНИ IndexedDB ХРАНИЛИЩЕ ДЛЯ FileSystemDirectoryHandle =====

    function idbOpen() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = function () {
                req.result.createObjectStore(IDB_STORE);
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function idbGet(key) {
        return idbOpen().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(IDB_STORE, 'readonly');
                var req = tx.objectStore(IDB_STORE).get(key);
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function () { reject(req.error); };
            });
        });
    }

    function idbSet(key, value) {
        return idbOpen().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(value, key);
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    // ===== ЭКСПОРТ =====

    window.CrystalPrint = {
        PRINT_QUEUE_USER_IDS: PRINT_QUEUE_USER_IDS,
        // Bitrix bridge
        loadCurrentUser: loadCurrentUser,
        // Crystal API
        listPrints: listPrints,
        listPrintsByStatus: listPrintsByStatus,
        uploadPrint: uploadPrint,
        attachPrintFile: attachPrintFile,
        updatePrintStatus: updatePrintStatus,
        addReference: addReference,
        deleteReference: deleteReference,
        fetchReferenceBlob: fetchReferenceBlob,
        deletePrint: deletePrint,
        // UI
        renderStatusBadge: renderStatusBadge,
        renderStatusSelector: renderStatusSelector,
        formatPrintSettings: formatPrintSettings,
        renderPrintSettingsFields: renderPrintSettingsFields,
        renderFabricColorPicker: renderFabricColorPicker,
        openFabricColorPicker: openFabricColorPicker,
        // File system
        renderFolderStatus: renderFolderStatus,
        downloadToFolder: downloadToFolder,
    };

})();
