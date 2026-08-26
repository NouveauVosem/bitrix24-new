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
            var ps = item.printSettings;
            var fabricColor = ps && ps.printFabric && ps.printFabric.colorMode === 'picker' && ps.printFabric.color
                ? ps.printFabric.color : null;

            var card = document.createElement('div');
            card.style.cssText =
                'border:1px solid #e0e8f0;border-left:4px solid #2fc6f6;border-radius:10px;' +
                'margin-bottom:12px;overflow:hidden;background:#fff;';

            // === ШАПКА: бейджи + qty ===
            var topRow = document.createElement('div');
            topRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px 8px;flex-wrap:wrap;';

            if (item.dealId) {
                var dealBadge = document.createElement('span');
                dealBadge.style.cssText = 'padding:2px 10px;border-radius:20px;background:#f0f4f8;font-size:12px;font-weight:600;color:#555;';
                dealBadge.textContent = 'Сделка #' + item.dealId;
                topRow.appendChild(dealBadge);
            }
            if (item.taskId) {
                var taskBadge = document.createElement('span');
                taskBadge.style.cssText = 'padding:2px 10px;border-radius:20px;background:#f0f4f8;font-size:12px;color:#777;';
                taskBadge.textContent = 'Задача #' + item.taskId;
                topRow.appendChild(taskBadge);
            }

            var statusDot = document.createElement('span');
            statusDot.style.cssText = 'padding:2px 10px;border-radius:20px;background:#e8f8f5;font-size:12px;color:#27ae60;display:flex;align-items:center;gap:4px;';
            statusDot.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#27ae60;display:inline-block;flex-shrink:0;"></span>Готов к печати';
            topRow.appendChild(statusDot);

            var topSpacer = document.createElement('div');
            topSpacer.style.cssText = 'flex:1;';
            topRow.appendChild(topSpacer);

            if (item.qtyOrder) {
                var qtyOrderBox = document.createElement('div');
                qtyOrderBox.style.cssText = 'text-align:right;margin-left:12px;';
                qtyOrderBox.innerHTML =
                    '<div style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:.5px;">На заказ</div>' +
                    '<div style="font-size:22px;font-weight:700;color:#222;line-height:1.1;">' + item.qtyOrder +
                    ' <span style="font-size:12px;font-weight:400;color:#888;">шт</span></div>';
                topRow.appendChild(qtyOrderBox);
            }
            if (item.qtyArchive) {
                var qtyArchiveBox = document.createElement('div');
                qtyArchiveBox.style.cssText = 'text-align:right;margin-left:12px;';
                qtyArchiveBox.innerHTML =
                    '<div style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:.5px;">В архив</div>' +
                    '<div style="font-size:22px;font-weight:700;color:#222;line-height:1.1;">' + item.qtyArchive +
                    ' <span style="font-size:12px;font-weight:400;color:#888;">шт</span></div>';
                topRow.appendChild(qtyArchiveBox);
            }

            card.appendChild(topRow);

            // === КЛИЕНТ + ДАТА ===
            var clientSection = document.createElement('div');
            clientSection.style.cssText = 'padding:0 14px 10px;';

            var clientEl = document.createElement('div');
            clientEl.style.cssText = 'font-size:17px;font-weight:700;color:#222;margin-bottom:2px;';
            clientEl.textContent = item.client || 'Клиент не указан';
            clientSection.appendChild(clientEl);

            if (item.createdAt || item.uploadedById) {
                var metaEl = document.createElement('div');
                metaEl.style.cssText = 'font-size:12px;color:#bbb;';
                var metaParts = [];
                if (item.createdAt) metaParts.push('Загружено ' + new Date(item.createdAt).toLocaleString('ru-RU'));
                if (item.uploadedById) metaParts.push('пользователь #' + item.uploadedById);
                metaEl.textContent = metaParts.join(' · ');
                clientSection.appendChild(metaEl);
            }

            card.appendChild(clientSection);

            // === РАЗДЕЛИТЕЛЬ ===
            var sep = document.createElement('div');
            sep.style.cssText = 'border-top:1px solid #f0f4f8;';
            card.appendChild(sep);

            // === ТЕЛО: левая + правая колонки ===
            var body = document.createElement('div');
            body.style.cssText = 'display:flex;';

            // Левая колонка
            var leftCol = document.createElement('div');
            leftCol.style.cssText = 'flex:1;min-width:0;padding:12px 14px;';

            // Файл
            var fileBlock = document.createElement('div');
            fileBlock.style.cssText =
                'display:flex;align-items:center;gap:10px;background:#f8f9fb;border:1px solid #eee;' +
                'border-radius:8px;padding:10px 12px;margin-bottom:10px;';

            var fileIcon = document.createElement('div');
            fileIcon.style.cssText =
                'width:32px;height:32px;border-radius:6px;background:#ffe8e8;display:flex;' +
                'align-items:center;justify-content:center;flex-shrink:0;font-size:16px;';
            fileIcon.textContent = '📄';
            fileBlock.appendChild(fileIcon);

            var fileNameEl = document.createElement('div');
            fileNameEl.style.cssText = 'flex:1;min-width:0;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            fileNameEl.textContent = item.originalName || '(файл не прикреплён)';
            fileBlock.appendChild(fileNameEl);

            leftCol.appendChild(fileBlock);

            // Тайлы настроек
            var tilesRow = document.createElement('div');
            tilesRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

            function makeTile(label, value) {
                var tile = document.createElement('div');
                tile.style.cssText =
                    'flex:1;min-width:70px;background:#f8f9fb;border:1px solid #eee;border-radius:8px;padding:8px 10px;';
                tile.innerHTML =
                    '<div style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">' + label + '</div>' +
                    '<div style="font-size:14px;font-weight:600;color:#333;">' + value + '</div>';
                return tile;
            }

            if (ps && ps.graphicSize && (ps.graphicSize.width || ps.graphicSize.height)) {
                tilesRow.appendChild(makeTile('Графика', (ps.graphicSize.width || '?') + ' × ' + (ps.graphicSize.height || '?') + ' мм'));
            }
            if (ps && ps.heatTransfer && ps.heatTransfer.pressType) {
                tilesRow.appendChild(makeTile('Пресс', ps.heatTransfer.pressType === 'hippo' ? 'Бегемот' : 'Крокодил'));
            }
            if (ps && ps.heatTransfer && ps.heatTransfer.temperature) {
                tilesRow.appendChild(makeTile('Температура', ps.heatTransfer.temperature + ' °C'));
            }
            if (ps && ps.heatTransfer && ps.heatTransfer.time) {
                tilesRow.appendChild(makeTile('Время', ps.heatTransfer.time + ' сек'));
            }

            if (tilesRow.children.length) leftCol.appendChild(tilesRow);

            if (item.comment) {
                var commentEl = document.createElement('div');
                commentEl.style.cssText = 'font-size:12px;color:#666;margin-top:8px;white-space:pre-wrap;';
                commentEl.textContent = item.comment;
                leftCol.appendChild(commentEl);
            }

            body.appendChild(leftCol);

            // Правая колонка
            var rightCol = document.createElement('div');
            rightCol.style.cssText =
                'width:190px;flex-shrink:0;border-left:1px solid #f0f4f8;padding:12px 14px;' +
                'display:flex;flex-direction:column;gap:10px;';

            // Ткань для печати
            if (fabricColor) {
                var swatchBlock = document.createElement('div');
                swatchBlock.style.cssText = 'display:flex;gap:10px;align-items:flex-start;';

                var swatch = document.createElement('div');
                swatch.style.cssText =
                    'width:48px;height:48px;flex-shrink:0;border-radius:8px;' +
                    'border:1px solid rgba(0,0,0,.1);background:' + (fabricColor.hex || '#eee') + ';';
                swatchBlock.appendChild(swatch);

                var swatchInfo = document.createElement('div');
                swatchInfo.style.cssText = 'min-width:0;';

                var swatchTitle = document.createElement('div');
                swatchTitle.style.cssText = 'font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;';
                swatchTitle.textContent = 'Ткань для печати';
                swatchInfo.appendChild(swatchTitle);

                var swatchName = document.createElement('div');
                swatchName.style.cssText = 'font-size:13px;font-weight:700;color:#333;margin-bottom:2px;';
                swatchName.textContent = (fabricColor.colorName || '') + (fabricColor.colorCode ? ' ' + fabricColor.colorCode : '');
                swatchInfo.appendChild(swatchName);

                var metaParts = [];
                if (fabricColor.fabricCode) metaParts.push(fabricColor.fabricCode.toUpperCase().replace(/_/g, '-'));
                if (fabricColor.hex) metaParts.push(fabricColor.hex.toUpperCase());
                if (metaParts.length) {
                    var swatchMeta = document.createElement('div');
                    swatchMeta.style.cssText = 'font-size:11px;color:#aaa;';
                    swatchMeta.textContent = metaParts.join(' · ');
                    swatchInfo.appendChild(swatchMeta);
                }

                swatchBlock.appendChild(swatchInfo);
                rightCol.appendChild(swatchBlock);
            }

            // Референсы
            var imageRefs = (item.references || []).filter(function (r) {
                return r.mimeType && r.mimeType.indexOf('image/') === 0;
            }).slice(0, 3);
            if (imageRefs.length) {
                var refsWrap = document.createElement('div');
                refsWrap.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
                imageRefs.forEach(function (ref) {
                    var img = document.createElement('img');
                    img.src = CrystalPrint.referenceFileUrl(item.id, ref.remotePath);
                    img.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #eee;cursor:pointer;';
                    img.onclick = function () { window.open(img.src, '_blank'); };
                    refsWrap.appendChild(img);
                });
                rightCol.appendChild(refsWrap);
            }

            var btnSpacer = document.createElement('div');
            btnSpacer.style.cssText = 'flex:1;';
            rightCol.appendChild(btnSpacer);

            var savedInfo = document.createElement('div');
            savedInfo.style.cssText = 'display:none;font-size:11px;color:#27ae60;word-break:break-all;';
            rightCol.appendChild(savedInfo);

            if (item.originalName) {
                var dlBtn = document.createElement('button');
                dlBtn.type = 'button';
                dlBtn.className = 'ui-btn ui-btn-primary ui-btn-sm';
                dlBtn.style.cssText = 'width:100%;';
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
                rightCol.appendChild(dlBtn);
            }

            var printedBtn = document.createElement('button');
            printedBtn.type = 'button';
            printedBtn.className = 'ui-btn ui-btn-light-border ui-btn-sm';
            printedBtn.style.cssText = 'width:100%;';
            printedBtn.textContent = 'Напечатано';
            printedBtn.onclick = function () {
                CrystalPrint.updatePrintStatus(item.id, 'printed').then(function () {
                    card.style.opacity = '0.4';
                    printedBtn.textContent = 'Готово ✓';
                    printedBtn.disabled = true;
                }).catch(function (e) { alert(e.message); });
            };
            rightCol.appendChild(printedBtn);

            if (item.dealId) {
                var dealLink = document.createElement('a');
                dealLink.href = '/crm/deal/details/' + item.dealId + '/';
                dealLink.target = '_blank';
                dealLink.style.cssText =
                    'display:flex;align-items:center;justify-content:center;gap:4px;' +
                    'font-size:12px;color:#aaa;text-decoration:none;margin-top:2px;';
                dealLink.innerHTML = '<span style="font-size:13px;">↗</span> Открыть сделку';
                rightCol.appendChild(dealLink);
            }

            body.appendChild(rightCol);
            card.appendChild(body);
            container.appendChild(card);
        });
    }

})();
