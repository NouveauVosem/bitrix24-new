(function () {
    'use strict';

    var CRYSTAL_BASE = 'https://crystal.alvla.tools';
    var API_KEY = 'legenda';
    var PRINT_QUEUE_USER_IDS = [19, 23, 26, 53]; // Павел, Ярослав, Наталья, Лиля
    var IDB_NAME = 'crystal_print_panel';
    var IDB_STORE = 'handles';
    var ROOT_DIR_KEY = 'printRootDir';
    var CARD_SELECTOR = '.tasks-full-card-content[data-task-card-scroll]';
    var CHIPS_SELECTOR = '.tasks-full-card-chips';
    var CHIP_ID = 'crystal-print-chip';
    var BADGE_ID = 'crystal-print-chip-badge';

    BX.ready(function () {
        var currentTaskId = null;
        var dealId = null;
        var client = null;

        // Модуль задач Bitrix24 — SPA: переход между задачами не всегда
        // перезагружает страницу, поэтому BX.ready срабатывает только один раз.
        // Карточка задачи сама несёт свой ID в data-task-card-scroll — читаем
        // его при каждой мутации DOM, чтобы чип появлялся/пересоздавался и
        // без полного reload (Bitrix иногда пересобирает ряд чипов целиком).
        function sync() {
            var card = document.querySelector(CARD_SELECTOR);
            var taskId = card ? card.getAttribute('data-task-card-scroll') : null;

            if (taskId !== currentTaskId) {
                currentTaskId = taskId;
                dealId = null;
                client = null;

                var oldChip = document.getElementById(CHIP_ID);
                if (oldChip) oldChip.remove();

                if (taskId) {
                    loadTaskDeal(taskId).then(function (info) {
                        dealId = info.dealId;
                        client = info.client;
                    }).catch(function () {});
                }
            }

            if (taskId && card) insertChip(card, taskId, function () { return { dealId: dealId, client: client }; });
        }

        sync();

        var navObserver = new MutationObserver(function () { sync(); });
        navObserver.observe(document.body, { childList: true, subtree: true });

        // ===== ОЧЕРЕДЬ ПЕЧАТИ (на странице списка задач) =====
        loadCurrentUser().then(function (user) {
            if (!user || PRINT_QUEUE_USER_IDS.indexOf(user.id) === -1) return;
            initPrintQueue();
        });
    });

    // ===== BITRIX BRIDGE =====

    function loadTaskDeal(taskId) {
        return fetch('/local/ajax/crystal/get_task_deal.php?taskId=' + encodeURIComponent(taskId))
            .then(function (r) { return r.json(); })
            .then(function (resp) {
                if (resp.status !== 'success') throw new Error(resp.message || 'Не удалось получить сделку по задаче');
                return { dealId: resp.dealId, client: resp.client, taskTitle: resp.taskTitle };
            });
    }

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

    function createPrintJob(fd) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs/create', {
            method: 'POST',
            headers: { 'X-Api-Key': API_KEY },
            body: fd
        }).then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error(body.message || 'Ошибка создания');
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
        return fetch(CRYSTAL_BASE + '/api/print-jobs/' + encodeURIComponent(id) + '/references/' + encodeURIComponent(remotePath), {
            method: 'DELETE',
            headers: { 'X-Api-Key': API_KEY }
        }).then(function (r) { return r.json(); });
    }

    function referenceFileUrl(id, remotePath) {
        return CRYSTAL_BASE + '/api/print-jobs/' + encodeURIComponent(id) + '/references/' + encodeURIComponent(remotePath) + '/file?key=' + encodeURIComponent(API_KEY);
    }

    function deletePrint(id) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs/' + encodeURIComponent(id), {
            method: 'DELETE',
            headers: { 'X-Api-Key': API_KEY }
        }).then(function (r) { return r.json(); });
    }

    // Справочники тканей/цветов — грузятся один раз за сессию страницы и кэшируются,
    // список большой и одинаков для всех задач, смысла дёргать заново нет.
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

    // ===== ЧИП В КАРТОЧКЕ ЗАДАЧИ (ряд .tasks-full-card-chips: Результаты, Файлы, Теги...) =====

    function insertChip(card, taskId, getInfo) {
        if (document.getElementById(CHIP_ID)) return;

        var chipsWrap = card.querySelector(CHIPS_SELECTOR);
        if (!chipsWrap) return;

        var chip = document.createElement('div');
        chip.id = CHIP_ID;
        chip.className = 'ui-chip --shadow-accent --l --compact';
        chip.tabIndex = 0;

        var icon = document.createElement('div');
        icon.className = 'ui-chip-icon';
        icon.textContent = '🖨';
        chip.appendChild(icon);

        var text = document.createElement('div');
        text.className = 'ui-chip-text';
        text.textContent = 'Печати';
        chip.appendChild(text);

        var badge = document.createElement('span');
        badge.id = BADGE_ID;
        badge.style.cssText = 'display:none;margin-left:6px;background:#2fc6f6;color:#fff;border-radius:9px;padding:0 6px;font-size:11px;line-height:16px;';
        chip.appendChild(badge);

        chip.addEventListener('click', function () {
            openPanel(taskId, getInfo);
        });

        chipsWrap.insertBefore(chip, chipsWrap.firstChild);

        refreshChipCount(taskId);
    }

    function refreshChipCount(taskId) {
        return listPrints(taskId).then(function (items) {
            var badge = document.getElementById(BADGE_ID);
            if (!badge) return;
            if (items.length > 0) {
                badge.textContent = items.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }).catch(function () {});
    }

    // ===== PANEL (overlay, закрывается только по ✕) =====

    function openPanel(taskId, getInfo) {
        var overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9500;' +
            'display:flex;align-items:center;justify-content:center;';

        var box = document.createElement('div');
        box.style.cssText =
            'background:#fff;border-radius:10px;width:520px;max-width:92vw;max-height:85vh;' +
            'overflow-y:auto;padding:20px;position:relative;font-size:14px;color:#333;';

        var closeBtn = document.createElement('div');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'position:absolute;top:12px;right:16px;cursor:pointer;font-size:16px;color:#888;';
        closeBtn.onclick = function () { overlay.remove(); };
        box.appendChild(closeBtn);

        var title = document.createElement('h3');
        title.textContent = 'Печати по задаче #' + taskId;
        title.style.cssText = 'margin:0 0 14px;font-size:16px;';
        box.appendChild(title);

        var folderRow = renderFolderStatus();
        box.appendChild(folderRow.el);

        var listWrap = document.createElement('div');
        box.appendChild(listWrap);

        var uploadWrap = document.createElement('div');
        uploadWrap.style.cssText = 'margin-top:16px;border-top:1px solid #eee;padding-top:14px;';
        box.appendChild(uploadWrap);

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        function reload() {
            listWrap.innerHTML = 'Загрузка…';
            listPrints(taskId).then(function (items) {
                renderList(listWrap, items, taskId, getInfo, reload);
            }).catch(function (e) {
                listWrap.textContent = 'Ошибка загрузки: ' + e.message;
            });
        }
        reload();

        renderUploadForm(uploadWrap, taskId, getInfo, reload);
    }

    function renderList(container, items, taskId, getInfo, onChanged) {
        container.innerHTML = '';
        if (!items.length) {
            var empty = document.createElement('div');
            empty.style.cssText = 'color:#999;padding:10px 0;';
            empty.textContent = 'Пока нет ни одной печати по этой задаче';
            container.appendChild(empty);
            return;
        }

        items.forEach(function (item) {
            var row = document.createElement('div');
            row.style.cssText = 'border:1px solid #eee;border-radius:8px;padding:10px 12px;margin-bottom:10px;';

            // --- Статус ---
            var statusRow = document.createElement('div');
            statusRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
            statusRow.appendChild(renderStatusBadge(item.status || 'pending'));

            var toggleStatusBtn = document.createElement('button');
            toggleStatusBtn.type = 'button';
            toggleStatusBtn.className = 'ui-btn ui-btn-light-border ui-btn-xs';
            toggleStatusBtn.textContent = 'Изменить';
            statusRow.appendChild(toggleStatusBtn);
            row.appendChild(statusRow);

            var statusSelector = renderStatusSelector(item.status || 'pending', function (newStatus) {
                updatePrintStatus(item.id, newStatus).then(onChanged).catch(function (e) {
                    alert('Ошибка: ' + e.message);
                });
            });
            statusSelector.style.display = 'none';
            row.appendChild(statusSelector);

            toggleStatusBtn.onclick = function () {
                statusSelector.style.display = statusSelector.style.display === 'none' ? 'flex' : 'none';
            };

            // --- Название файла ---
            var name = document.createElement('div');
            name.style.cssText = 'font-weight:600;margin-bottom:4px;';
            name.textContent = item.originalName || '(файл не прикреплён)';
            row.appendChild(name);

            if (item.comment) {
                var comment = document.createElement('div');
                comment.style.cssText = 'color:#555;font-size:13px;margin-bottom:4px;white-space:pre-wrap;';
                comment.textContent = item.comment;
                row.appendChild(comment);
            }

            var settingsLines = formatPrintSettings(item.printSettings);
            if (settingsLines.length) {
                var settings = document.createElement('div');
                settings.style.cssText = 'color:#888;font-size:12px;margin-bottom:6px;';
                settingsLines.forEach(function (line) {
                    var lineEl = document.createElement('div');
                    lineEl.textContent = line;
                    settings.appendChild(lineEl);
                });
                row.appendChild(settings);
            }

            var date = document.createElement('div');
            date.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:8px;';
            date.textContent = new Date(item.createdAt).toLocaleString('ru-RU');
            row.appendChild(date);

            // --- Референсы ---
            if ((item.references || []).length) {
                var refsTitle = document.createElement('div');
                refsTitle.style.cssText = 'font-size:12px;color:#666;font-weight:600;margin-bottom:6px;';
                refsTitle.textContent = 'Референсы:';
                row.appendChild(refsTitle);

                var refsGrid = document.createElement('div');
                refsGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;';
                item.references.forEach(function (ref) {
                    var isImage = ref.mimeType && ref.mimeType.indexOf('image/') === 0;
                    var refWrap = document.createElement('div');
                    refWrap.style.cssText = 'position:relative;width:70px;';

                    var fileUrl = referenceFileUrl(item.id, ref.remotePath);
                    if (isImage) {
                        var img = document.createElement('img');
                        img.src = fileUrl;
                        img.style.cssText = 'width:70px;height:70px;object-fit:cover;border-radius:6px;border:1px solid #eee;cursor:pointer;';
                        img.onclick = function () { window.open(fileUrl, '_blank'); };
                        refWrap.appendChild(img);
                    } else {
                        var fileLink = document.createElement('a');
                        fileLink.href = fileUrl;
                        fileLink.target = '_blank';
                        fileLink.style.cssText = 'display:flex;align-items:center;justify-content:center;width:70px;height:70px;border:1px solid #eee;border-radius:6px;font-size:11px;color:#555;text-align:center;padding:4px;box-sizing:border-box;word-break:break-all;';
                        fileLink.textContent = ref.originalName;
                        refWrap.appendChild(fileLink);
                    }

                    var delRefBtn = document.createElement('button');
                    delRefBtn.type = 'button';
                    delRefBtn.textContent = '✕';
                    delRefBtn.style.cssText = 'position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#e74c3c;color:#fff;border:none;cursor:pointer;font-size:11px;line-height:18px;padding:0;';
                    delRefBtn.onclick = function () {
                        if (!confirm('Удалить референс "' + ref.originalName + '"?')) return;
                        deleteReference(item.id, ref.remotePath).then(onChanged).catch(function (e) { alert(e.message); });
                    };
                    refWrap.appendChild(delRefBtn);
                    refsGrid.appendChild(refWrap);
                });
                row.appendChild(refsGrid);
            }

            // --- Загрузить референс ---
            var addRefWrap = document.createElement('div');
            addRefWrap.style.cssText = 'margin-bottom:10px;';
            var addRefToggle = document.createElement('button');
            addRefToggle.type = 'button';
            addRefToggle.className = 'ui-btn ui-btn-light-border ui-btn-xs';
            addRefToggle.textContent = '+ Добавить референс';
            addRefWrap.appendChild(addRefToggle);

            var addRefForm = document.createElement('div');
            addRefForm.style.cssText = 'display:none;margin-top:6px;';
            var refInput = document.createElement('input');
            refInput.type = 'file';
            refInput.accept = 'image/*,.pdf';
            refInput.style.cssText = 'font-size:12px;';
            var refUploadBtn = document.createElement('button');
            refUploadBtn.type = 'button';
            refUploadBtn.className = 'ui-btn ui-btn-primary ui-btn-xs';
            refUploadBtn.style.marginLeft = '6px';
            refUploadBtn.textContent = 'Загрузить';
            refUploadBtn.onclick = function () {
                var f = refInput.files[0];
                if (!f) { alert('Выберите файл'); return; }
                refUploadBtn.disabled = true;
                var fd = new FormData();
                fd.append('file', f, f.name);
                addReference(item.id, fd).then(onChanged).catch(function (e) {
                    alert('Ошибка: ' + e.message);
                    refUploadBtn.disabled = false;
                });
            };
            addRefForm.appendChild(refInput);
            addRefForm.appendChild(refUploadBtn);
            addRefToggle.onclick = function () {
                addRefForm.style.display = addRefForm.style.display === 'none' ? 'flex' : 'none';
                addRefForm.style.alignItems = 'center';
            };
            addRefWrap.appendChild(addRefForm);
            row.appendChild(addRefWrap);

            // --- Кнопки действий ---
            var actions = document.createElement('div');
            actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';

            // Прикрепить файл (если его нет)
            if (!item.originalName) {
                var attachWrap = document.createElement('div');
                var attachInput = document.createElement('input');
                attachInput.type = 'file';
                attachInput.style.display = 'none';
                var attachBtn = document.createElement('button');
                attachBtn.className = 'ui-btn ui-btn-primary ui-btn-sm';
                attachBtn.textContent = 'Прикрепить файл печати';
                attachBtn.onclick = function () { attachInput.click(); };
                attachInput.onchange = function () {
                    var f = attachInput.files[0];
                    if (!f) return;
                    attachBtn.disabled = true;
                    attachBtn.textContent = 'Загрузка…';
                    var fd = new FormData();
                    fd.append('file', f, f.name);
                    attachPrintFile(item.id, fd).then(onChanged).catch(function (e) {
                        alert('Ошибка: ' + e.message);
                        attachBtn.disabled = false;
                        attachBtn.textContent = 'Прикрепить файл печати';
                    });
                };
                attachWrap.appendChild(attachInput);
                attachWrap.appendChild(attachBtn);
                actions.appendChild(attachWrap);
            } else {
                var downloadBtn = document.createElement('button');
                downloadBtn.className = 'ui-btn ui-btn-primary ui-btn-sm';
                downloadBtn.textContent = 'Скачать в папку';

                var savedInfo = document.createElement('div');
                savedInfo.style.cssText = 'display:none;font-size:12px;color:#27ae60;margin-top:4px;word-break:break-all;width:100%;';

                downloadBtn.onclick = function () {
                    downloadBtn.disabled = true;
                    downloadBtn.textContent = 'Скачивание…';
                    savedInfo.style.display = 'none';
                    downloadToFolder(item, getInfo, taskId)
                        .then(function (result) {
                            downloadBtn.textContent = 'Скачать в папку';
                            downloadBtn.disabled = false;
                            savedInfo.textContent = 'Сохранено: ' + result.folderName + ' / ' + result.fileName;
                            savedInfo.style.display = 'block';
                        })
                        .catch(function (e) {
                            alert('Ошибка скачивания: ' + e.message);
                            downloadBtn.textContent = 'Скачать в папку';
                            downloadBtn.disabled = false;
                        });
                };
                actions.appendChild(downloadBtn);
                row.appendChild(savedInfo);
            }

            var delBtn = document.createElement('button');
            delBtn.className = 'ui-btn ui-btn-danger ui-btn-sm';
            delBtn.textContent = 'Удалить';
            delBtn.onclick = function () {
                if (!confirm('Удалить printjob "' + (item.originalName || item.id) + '"?')) return;
                deletePrint(item.id).then(onChanged);
            };
            actions.appendChild(delBtn);

            row.appendChild(actions);
            container.appendChild(row);
        });
    }

    function renderUploadForm(container, taskId, getInfo, onUploaded) {
        var fileLabel = document.createElement('div');
        fileLabel.style.cssText = 'font-weight:600;margin-bottom:8px;';
        fileLabel.textContent = 'Добавить печать';
        container.appendChild(fileLabel);

        // Быстрое создание запроса без файла (конструктор ставит задачу)
        var quickBtn = document.createElement('button');
        quickBtn.className = 'ui-btn ui-btn-light-border ui-btn-sm';
        quickBtn.style.cssText = 'margin-bottom:12px;';
        quickBtn.textContent = '+ Создать запрос без файла';
        quickBtn.onclick = function () {
            quickBtn.disabled = true;
            var info = getInfo();
            var fd = new FormData();
            fd.append('taskId', taskId);
            if (info.dealId) fd.append('dealId', info.dealId);
            if (info.client) fd.append('client', info.client);
            createPrintJob(fd).then(function () {
                quickBtn.disabled = false;
                onUploaded();
            }).catch(function (e) {
                alert('Ошибка: ' + e.message);
                quickBtn.disabled = false;
            });
        };
        container.appendChild(quickBtn);

        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.style.cssText = 'display:block;margin-bottom:8px;';
        container.appendChild(fileInput);

        var commentInput = document.createElement('textarea');
        commentInput.placeholder = 'Комментарий';
        commentInput.style.cssText = 'width:100%;min-height:44px;margin-bottom:8px;padding:6px;box-sizing:border-box;';
        container.appendChild(commentInput);

        var printSettingsFields = renderPrintSettingsFields();
        container.appendChild(printSettingsFields.el);

        var submitBtn = document.createElement('button');
        submitBtn.className = 'ui-btn ui-btn-success ui-btn-sm';
        submitBtn.textContent = 'Загрузить';
        submitBtn.onclick = function () {
            var file = fileInput.files[0];
            if (!file) { alert('Выберите файл'); return; }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Загрузка…';

            Promise.all([loadCurrentUser()]).then(function () {
                var info = getInfo();
                var fd = new FormData();
                fd.append('file', file, file.name);
                fd.append('taskId', taskId);
                if (info.dealId) fd.append('dealId', info.dealId);
                if (info.client) fd.append('client', info.client);
                fd.append('comment', commentInput.value || '');
                fd.append('printSettings', JSON.stringify(printSettingsFields.getValue()));
                if (currentBitrixUser && currentBitrixUser.id) fd.append('uploadedById', String(currentBitrixUser.id));
                return uploadPrint(fd);
            }).then(function () {
                fileInput.value = '';
                commentInput.value = '';
                printSettingsFields.reset();
                submitBtn.disabled = false;
                submitBtn.textContent = 'Загрузить';
                onUploaded();
            }).catch(function (e) {
                alert('Ошибка загрузки: ' + e.message);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Загрузить';
            });
        };
        container.appendChild(submitBtn);
    }

    // ===== СТРУКТУРИРОВАННЫЕ НАСТРОЙКИ ПЕЧАТИ (графика / заливка / теплоперенос) =====

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
                lines.push('Ткань для печати: ' + ps.printFabric.color.colorName + ' (' + ps.printFabric.color.fabricCode + ')');
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

    // Универсальный переключатель на N вариантов (булев тоггл, тип пресса, режим цвета — всё через него)
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

    // Числовое поле с кнопками-пресетами и плашкой предупреждения при нестандартном значении
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

    // Переключатель "выбрать цвет ткани из списка / вписать текстом" — используется и для
    // ткани, на которой печатаем, и для цвета заливки, поэтому вынесен в отдельный конструктор.
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
                    }
                };
            }
        };
    }

    // Пикер цвета ткани: чипы тканей → чипы цветов выбранной ткани (список большой, select неудобен)
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

    // ===== ОЧЕРЕДЬ ПЕЧАТИ =====

    var QUEUE_WIDGET_ID = 'crystal-print-queue';
    var QUEUE_CONTAINER_SELECTOR = '.main-grid-container';

    function initPrintQueue() {
        var queueObserver = new MutationObserver(function () { syncPrintQueue(); });
        queueObserver.observe(document.body, { childList: true, subtree: true });
        syncPrintQueue();
    }

    function syncPrintQueue() {
        var isTasksPage = /\/tasks\//.test(window.location.pathname);
        var existing = document.getElementById(QUEUE_WIDGET_ID);

        if (!isTasksPage) {
            if (existing) existing.remove();
            return;
        }

        if (existing) return; // уже вставлен

        var container = document.querySelector(QUEUE_CONTAINER_SELECTOR);
        if (!container) return;

        var widget = document.createElement('div');
        widget.id = QUEUE_WIDGET_ID;
        widget.style.cssText =
            'background:#fff;border:1px solid #e0e8f0;border-radius:10px;padding:14px 16px;' +
            'margin-bottom:14px;font-size:13px;color:#333;';

        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;';

        var headerTitle = document.createElement('span');
        headerTitle.style.cssText = 'font-weight:700;font-size:14px;flex:1;';
        headerTitle.textContent = '🖨 Очередь печати';
        header.appendChild(headerTitle);

        var refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'ui-btn ui-btn-light-border ui-btn-xs';
        refreshBtn.textContent = 'Обновить';
        refreshBtn.onclick = function () { loadQueue(); };
        header.appendChild(refreshBtn);

        var toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'ui-btn ui-btn-light-border ui-btn-xs';
        toggleBtn.textContent = '▲';
        header.appendChild(toggleBtn);

        widget.appendChild(header);

        var body = document.createElement('div');
        widget.appendChild(body);

        toggleBtn.onclick = function () {
            var collapsed = body.style.display === 'none';
            body.style.display = collapsed ? 'block' : 'none';
            toggleBtn.textContent = collapsed ? '▲' : '▼';
        };

        container.parentNode.insertBefore(widget, container);

        function loadQueue() {
            body.innerHTML = '<div style="color:#999;">Загрузка…</div>';
            listPrintsByStatus('ready').then(function (items) {
                renderQueue(body, items);
            }).catch(function (e) {
                body.innerHTML = '<div style="color:#c0392b;">Ошибка: ' + e.message + '</div>';
            });
        }

        loadQueue();
    }

    function renderQueue(container, items) {
        container.innerHTML = '';

        if (!items.length) {
            var empty = document.createElement('div');
            empty.style.cssText = 'color:#999;padding:4px 0;';
            empty.textContent = 'Нет файлов, готовых к печати';
            container.appendChild(empty);
            return;
        }

        items.forEach(function (item) {
            var row = document.createElement('div');
            row.style.cssText =
                'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;' +
                'border:1px solid #eee;margin-bottom:8px;flex-wrap:wrap;';

            // Клиент + файл
            var info = document.createElement('div');
            info.style.cssText = 'flex:1;min-width:0;';

            var clientEl = document.createElement('div');
            clientEl.style.cssText = 'font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            clientEl.textContent = item.client || 'Клиент не указан';
            info.appendChild(clientEl);

            var fileEl = document.createElement('div');
            fileEl.style.cssText = 'font-size:12px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            fileEl.textContent = item.originalName || '(файл не прикреплён)';
            info.appendChild(fileEl);

            var settingsLines = formatPrintSettings(item.printSettings);
            if (settingsLines.length) {
                var settingsEl = document.createElement('div');
                settingsEl.style.cssText = 'font-size:11px;color:#888;margin-top:2px;';
                settingsEl.textContent = settingsLines.join(' · ');
                info.appendChild(settingsEl);
            }

            row.appendChild(info);

            // Референсы-превью
            if ((item.references || []).length) {
                var refsWrap = document.createElement('div');
                refsWrap.style.cssText = 'display:flex;gap:4px;';
                item.references.slice(0, 3).forEach(function (ref) {
                    if (ref.mimeType && ref.mimeType.indexOf('image/') === 0) {
                        var img = document.createElement('img');
                        img.src = referenceFileUrl(item.id, ref.remotePath);
                        img.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #eee;cursor:pointer;';
                        img.onclick = function () { window.open(img.src, '_blank'); };
                        refsWrap.appendChild(img);
                    }
                });
                row.appendChild(refsWrap);
            }

            // Кнопки
            var btns = document.createElement('div');
            btns.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';

            if (item.originalName) {
                var dlBtn = document.createElement('button');
                dlBtn.type = 'button';
                dlBtn.className = 'ui-btn ui-btn-primary ui-btn-xs';
                dlBtn.textContent = 'Скачать';
                dlBtn.onclick = function () {
                    dlBtn.disabled = true;
                    downloadToFolder(item, function () { return { dealId: item.dealId, client: item.client }; }, item.taskId)
                        .then(function () { dlBtn.textContent = 'Готово ✓'; })
                        .catch(function (e) { alert(e.message); dlBtn.disabled = false; });
                };
                btns.appendChild(dlBtn);
            }

            var printedBtn = document.createElement('button');
            printedBtn.type = 'button';
            printedBtn.className = 'ui-btn ui-btn-light-border ui-btn-xs';
            printedBtn.textContent = 'Напечатано';
            printedBtn.onclick = function () {
                updatePrintStatus(item.id, 'printed').then(function () {
                    row.style.opacity = '0.4';
                    printedBtn.textContent = 'Готово ✓';
                    printedBtn.disabled = true;
                }).catch(function (e) { alert(e.message); });
            };
            btns.appendChild(printedBtn);

            row.appendChild(btns);
            container.appendChild(row);
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

    // Проверяет сохранённый хендл БЕЗ показа диалогов (для статуса в панели)
    function peekRootDirHandle() {
        return idbGet(ROOT_DIR_KEY).then(function (handle) {
            if (!handle) return null;
            return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
                return { handle: handle, granted: perm === 'granted' };
            });
        });
    }

    // Всегда показывает диалог выбора папки (первичная настройка / смена папки)
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

})();
