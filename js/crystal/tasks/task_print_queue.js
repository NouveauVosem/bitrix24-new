(function () {
    'use strict';

    var QUEUE_WIDGET_ID = 'crystal-print-queue';
    var QUEUE_CONTAINER_SELECTOR = '.main-grid-container';

    BX.ready(function () {
        CrystalPrint.loadCurrentUser().then(function (user) {
            if (!user || CrystalPrint.PRINT_QUEUE_USER_IDS.indexOf(user.id) === -1) return;
            initPrintQueue();
        });
    });

    // ===== ОЧЕРЕДЬ ПЕЧАТИ =====

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
            CrystalPrint.listPrintsByStatus('ready').then(function (items) {
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

            var settingsLines = CrystalPrint.formatPrintSettings(item.printSettings);
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
                        img.src = CrystalPrint.referenceFileUrl(item.id, ref.remotePath);
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

            var savedInfo = document.createElement('div');
            savedInfo.style.cssText = 'display:none;font-size:11px;color:#27ae60;margin-top:4px;word-break:break-all;width:100%;';
            row.appendChild(savedInfo);

            if (item.originalName) {
                var dlBtn = document.createElement('button');
                dlBtn.type = 'button';
                dlBtn.className = 'ui-btn ui-btn-primary ui-btn-xs';
                dlBtn.textContent = 'Скачать';
                dlBtn.onclick = function () {
                    dlBtn.disabled = true;
                    dlBtn.textContent = 'Скачивание…';
                    savedInfo.style.display = 'none';
                    CrystalPrint.downloadToFolder(item, function () { return { dealId: item.dealId, client: item.client }; }, item.taskId)
                        .then(function (result) {
                            dlBtn.textContent = 'Скачать';
                            dlBtn.disabled = false;
                            savedInfo.textContent = 'Сохранено: ' + result.folderName + ' / ' + result.fileName;
                            savedInfo.style.display = 'block';
                        })
                        .catch(function (e) { alert(e.message); dlBtn.textContent = 'Скачать'; dlBtn.disabled = false; });
                };
                btns.appendChild(dlBtn);
            }

            var printedBtn = document.createElement('button');
            printedBtn.type = 'button';
            printedBtn.className = 'ui-btn ui-btn-light-border ui-btn-xs';
            printedBtn.textContent = 'Напечатано';
            printedBtn.onclick = function () {
                CrystalPrint.updatePrintStatus(item.id, 'printed').then(function () {
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

})();
