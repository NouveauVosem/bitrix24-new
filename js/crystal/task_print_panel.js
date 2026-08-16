(function () {
    'use strict';

    var CRYSTAL_BASE = 'https://crystal.alvla.tools';
    var API_KEY = 'legenda';
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

    function deletePrint(id) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs/' + encodeURIComponent(id), {
            method: 'DELETE',
            headers: { 'X-Api-Key': API_KEY }
        }).then(function (r) { return r.json(); });
    }

    function fetchPrintFile(id) {
        return fetch(CRYSTAL_BASE + '/api/print-jobs/' + encodeURIComponent(id) + '/file', {
            headers: { 'X-Api-Key': API_KEY }
        }).then(function (r) {
            if (!r.ok) throw new Error('Не удалось скачать файл');
            return r.blob();
        });
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

            var name = document.createElement('div');
            name.style.cssText = 'font-weight:600;margin-bottom:4px;';
            name.textContent = item.originalName;
            row.appendChild(name);

            if (item.comment) {
                var comment = document.createElement('div');
                comment.style.cssText = 'color:#555;font-size:13px;margin-bottom:4px;white-space:pre-wrap;';
                comment.textContent = item.comment;
                row.appendChild(comment);
            }

            if (item.printSettings && item.printSettings.raw) {
                var settings = document.createElement('div');
                settings.style.cssText = 'color:#888;font-size:12px;margin-bottom:6px;white-space:pre-wrap;';
                settings.textContent = 'Настройки: ' + item.printSettings.raw;
                row.appendChild(settings);
            }

            var date = document.createElement('div');
            date.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:8px;';
            date.textContent = new Date(item.createdAt).toLocaleString('ru-RU');
            row.appendChild(date);

            var actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:8px;';

            var downloadBtn = document.createElement('button');
            downloadBtn.className = 'ui-btn ui-btn-primary ui-btn-sm';
            downloadBtn.textContent = 'Скачать в папку';
            downloadBtn.onclick = function () {
                downloadBtn.disabled = true;
                downloadBtn.textContent = 'Скачивание…';
                downloadToFolder(item, getInfo, taskId)
                    .then(function () {
                        downloadBtn.textContent = 'Готово ✓';
                        setTimeout(function () { downloadBtn.textContent = 'Скачать в папку'; downloadBtn.disabled = false; }, 1500);
                    })
                    .catch(function (e) {
                        alert('Ошибка скачивания: ' + e.message);
                        downloadBtn.textContent = 'Скачать в папку';
                        downloadBtn.disabled = false;
                    });
            };
            actions.appendChild(downloadBtn);

            var delBtn = document.createElement('button');
            delBtn.className = 'ui-btn ui-btn-danger ui-btn-sm';
            delBtn.textContent = 'Удалить';
            delBtn.onclick = function () {
                if (!confirm('Удалить "' + item.originalName + '"?')) return;
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
        fileLabel.textContent = 'Добавить файл для печати';
        container.appendChild(fileLabel);

        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.style.cssText = 'display:block;margin-bottom:8px;';
        container.appendChild(fileInput);

        var commentInput = document.createElement('textarea');
        commentInput.placeholder = 'Комментарий';
        commentInput.style.cssText = 'width:100%;min-height:44px;margin-bottom:8px;padding:6px;box-sizing:border-box;';
        container.appendChild(commentInput);

        var settingsInput = document.createElement('textarea');
        settingsInput.placeholder = 'Настройки принтера / теплопресса';
        settingsInput.style.cssText = 'width:100%;min-height:44px;margin-bottom:8px;padding:6px;box-sizing:border-box;';
        container.appendChild(settingsInput);

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
                fd.append('printSettings', JSON.stringify({ raw: settingsInput.value || '' }));
                if (currentBitrixUser && currentBitrixUser.id) fd.append('uploadedById', String(currentBitrixUser.id));
                return uploadPrint(fd);
            }).then(function () {
                fileInput.value = '';
                commentInput.value = '';
                settingsInput.value = '';
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
                            return writable.write(blob).then(function () { return writable.close(); });
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
