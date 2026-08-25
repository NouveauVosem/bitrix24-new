(function () {
    'use strict';

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

    // ===== ЧИП В КАРТОЧКЕ ЗАДАЧИ =====

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
        return CrystalPrint.listPrints(taskId).then(function (items) {
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
            'background:#fff;border-radius:10px;width:900px;max-width:95vw;max-height:88vh;' +
            'display:flex;flex-direction:column;position:relative;font-size:14px;color:#333;overflow:hidden;';

        // --- Хедер ---
        var header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px 12px;border-bottom:1px solid #eee;flex-shrink:0;';

        var closeBtn = document.createElement('div');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'position:absolute;top:14px;right:18px;cursor:pointer;font-size:16px;color:#888;line-height:1;';
        closeBtn.onclick = function () { overlay.remove(); };
        header.appendChild(closeBtn);

        var title = document.createElement('h3');
        title.textContent = 'Печати по задаче #' + taskId;
        title.style.cssText = 'margin:0 0 8px;font-size:16px;padding-right:24px;';
        header.appendChild(title);

        var folderRow = CrystalPrint.renderFolderStatus();
        header.appendChild(folderRow.el);

        box.appendChild(header);

        // --- Двухколоночное тело ---
        var body = document.createElement('div');
        body.style.cssText = 'display:flex;flex:1;min-height:0;';

        // Левая колонка — список
        var leftCol = document.createElement('div');
        leftCol.style.cssText =
            'flex:1;min-width:0;overflow-y:auto;padding:16px 20px;border-right:1px solid #eee;';

        var listTitle = document.createElement('div');
        listTitle.style.cssText = 'font-weight:600;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;';
        listTitle.textContent = 'Созданные печати';
        leftCol.appendChild(listTitle);

        var listWrap = document.createElement('div');
        leftCol.appendChild(listWrap);

        // Правая колонка — форма
        var rightCol = document.createElement('div');
        rightCol.style.cssText =
            'width:300px;flex-shrink:0;overflow-y:auto;padding:16px 20px;background:#fafafa;';

        var formTitle = document.createElement('div');
        formTitle.style.cssText = 'font-weight:600;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;';
        formTitle.textContent = 'Добавить печать';
        rightCol.appendChild(formTitle);

        body.appendChild(leftCol);
        body.appendChild(rightCol);
        box.appendChild(body);

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        function reload() {
            listWrap.innerHTML = 'Загрузка…';
            CrystalPrint.listPrints(taskId).then(function (items) {
                renderList(listWrap, items, taskId, getInfo, reload);
            }).catch(function (e) {
                listWrap.textContent = 'Ошибка загрузки: ' + e.message;
            });
        }
        reload();

        renderUploadForm(rightCol, taskId, getInfo, reload);
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
            statusRow.appendChild(CrystalPrint.renderStatusBadge(item.status || 'pending'));

            var toggleStatusBtn = document.createElement('button');
            toggleStatusBtn.type = 'button';
            toggleStatusBtn.className = 'ui-btn ui-btn-light-border ui-btn-xs';
            toggleStatusBtn.textContent = 'Изменить';
            statusRow.appendChild(toggleStatusBtn);
            row.appendChild(statusRow);

            var statusSelector = CrystalPrint.renderStatusSelector(item.status || 'pending', function (newStatus) {
                CrystalPrint.updatePrintStatus(item.id, newStatus).then(onChanged).catch(function (e) {
                    alert('Ошибка: ' + e.message);
                });
            });
            statusSelector.style.display = 'none';
            row.appendChild(statusSelector);

            toggleStatusBtn.onclick = function () {
                statusSelector.style.display = statusSelector.style.display === 'none' ? 'flex' : 'none';
            };

            // --- Основное тело карточки: левая часть + колонка ткани ---
            var cardBody = document.createElement('div');
            cardBody.style.cssText = 'display:flex;gap:12px;align-items:flex-start;';

            var cardMain = document.createElement('div');
            cardMain.style.cssText = 'flex:1;min-width:0;';
            cardBody.appendChild(cardMain);

            // --- Колонка ткани (справа) ---
            var ps = item.printSettings;
            var fabricColor = ps && ps.printFabric && ps.printFabric.colorMode === 'picker' && ps.printFabric.color
                ? ps.printFabric.color : null;
            if (fabricColor) {
                var fabricCol = document.createElement('div');
                fabricCol.style.cssText = 'flex-shrink:0;width:68px;text-align:center;';

                var swatch = document.createElement('div');
                swatch.style.cssText = 'width:56px;height:56px;border-radius:6px;border:1px solid rgba(0,0,0,.12);margin:0 auto 5px;background:' + (fabricColor.hex || '#eee') + ';';
                fabricCol.appendChild(swatch);

                if (fabricColor.fabricCode) {
                    var swatchFabric = document.createElement('div');
                    swatchFabric.style.cssText = 'font-size:10px;color:#aaa;margin-bottom:2px;';
                    swatchFabric.textContent = '(' + fabricColor.fabricCode + ')';
                    fabricCol.appendChild(swatchFabric);
                }

                if (fabricColor.colorName) {
                    var swatchName = document.createElement('div');
                    swatchName.style.cssText = 'font-size:12px;font-weight:600;color:#444;word-break:break-word;margin-bottom:1px;';
                    swatchName.textContent = fabricColor.colorName;
                    fabricCol.appendChild(swatchName);
                }

                if (fabricColor.colorCode) {
                    var swatchCode = document.createElement('div');
                    swatchCode.style.cssText = 'font-size:11px;color:#888;';
                    swatchCode.textContent = fabricColor.colorCode;
                    fabricCol.appendChild(swatchCode);
                }

                cardBody.appendChild(fabricCol);
            }

            row.appendChild(cardBody);

            // --- Название файла ---
            var name = document.createElement('div');
            name.style.cssText = 'font-weight:600;margin-bottom:4px;';
            name.textContent = item.originalName || '(файл не прикреплён)';
            cardMain.appendChild(name);

            if (item.qtyOrder || item.qtyArchive) {
                var qtyDisplay = document.createElement('div');
                qtyDisplay.style.cssText = 'display:flex;gap:12px;margin-bottom:6px;';
                if (item.qtyOrder) {
                    var qtyOrderEl = document.createElement('div');
                    qtyOrderEl.style.cssText = 'font-size:12px;color:#555;';
                    qtyOrderEl.innerHTML = '<span style="color:#aaa;">На заказ:</span> <strong>' + item.qtyOrder + '</strong> шт';
                    qtyDisplay.appendChild(qtyOrderEl);
                }
                if (item.qtyArchive) {
                    var qtyArchiveEl = document.createElement('div');
                    qtyArchiveEl.style.cssText = 'font-size:12px;color:#555;';
                    qtyArchiveEl.innerHTML = '<span style="color:#aaa;">В архив:</span> <strong>' + item.qtyArchive + '</strong> шт';
                    qtyDisplay.appendChild(qtyArchiveEl);
                }
                cardMain.appendChild(qtyDisplay);
            }

            if (item.comment) {
                var comment = document.createElement('div');
                comment.style.cssText = 'color:#555;font-size:13px;margin-bottom:4px;white-space:pre-wrap;';
                comment.textContent = item.comment;
                cardMain.appendChild(comment);
            }

            var settingsLines = CrystalPrint.formatPrintSettings(item.printSettings);
            if (settingsLines.length) {
                var settings = document.createElement('div');
                settings.style.cssText = 'margin-bottom:6px;';
                settingsLines.forEach(function (line) {
                    if (line.indexOf('Ткань для печати:') === 0) return; // рендерится отдельно в колонке
                    var isMain = line.indexOf('Графика:') === 0;
                    var lineEl = document.createElement('div');
                    lineEl.style.cssText = isMain
                        ? 'color:#444;font-size:14px;font-weight:600;margin-bottom:2px;'
                        : 'color:#999;font-size:12px;margin-bottom:1px;';
                    lineEl.textContent = line;
                    settings.appendChild(lineEl);
                });
                cardMain.appendChild(settings);
            }

            var date = document.createElement('div');
            date.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:8px;';
            date.textContent = new Date(item.createdAt).toLocaleString('ru-RU');
            cardMain.appendChild(date);

            // --- Референсы ---
            if ((item.references || []).length) {
                var refsTitle = document.createElement('div');
                refsTitle.style.cssText = 'font-size:12px;color:#666;font-weight:600;margin-bottom:6px;';
                refsTitle.textContent = 'Референсы:';
                cardMain.appendChild(refsTitle);

                var refsGrid = document.createElement('div');
                refsGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;';
                item.references.forEach(function (ref) {
                    var isImage = ref.mimeType && ref.mimeType.indexOf('image/') === 0;
                    var refWrap = document.createElement('div');
                    refWrap.style.cssText = 'position:relative;width:70px;';

                    var fileUrl = CrystalPrint.referenceFileUrl(item.id, ref.remotePath);
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
                        CrystalPrint.deleteReference(item.id, ref.remotePath).then(onChanged).catch(function (e) { alert(e.message); });
                    };
                    refWrap.appendChild(delRefBtn);
                    refsGrid.appendChild(refWrap);
                });
                cardMain.appendChild(refsGrid);
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
                CrystalPrint.addReference(item.id, fd).then(onChanged).catch(function (e) {
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
            cardMain.appendChild(addRefWrap);

            // --- Кнопки действий ---
            var actions = document.createElement('div');
            actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';

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
                    CrystalPrint.attachPrintFile(item.id, fd).then(onChanged).catch(function (e) {
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
                    CrystalPrint.downloadToFolder(item, getInfo, taskId)
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
                cardMain.appendChild(savedInfo);
            }

            var delBtn = document.createElement('button');
            delBtn.className = 'ui-btn ui-btn-danger ui-btn-sm';
            delBtn.textContent = 'Удалить';
            delBtn.onclick = function () {
                if (!confirm('Удалить printjob "' + (item.originalName || item.id) + '"?')) return;
                CrystalPrint.deletePrint(item.id).then(onChanged);
            };
            actions.appendChild(delBtn);

            cardMain.appendChild(actions);
            container.appendChild(row);
        });
    }

    function renderUploadForm(container, taskId, getInfo, onUploaded) {
        // --- Кол-во ---
        var qtyRow = document.createElement('div');
        qtyRow.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;';

        function makeQtyField(labelText) {
            var wrap = document.createElement('div');
            wrap.style.cssText = 'flex:1;';
            var label = document.createElement('div');
            label.style.cssText = 'font-size:11px;color:#888;margin-bottom:3px;';
            label.textContent = labelText;
            wrap.appendChild(label);
            var input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.style.cssText = 'width:100%;padding:6px;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;font-size:13px;';
            wrap.appendChild(input);
            return { el: wrap, input: input };
        }

        var qtyOrder = makeQtyField('Кол-во на заказ');
        var qtyArchive = makeQtyField('Кол-во в архив');
        qtyRow.appendChild(qtyOrder.el);
        qtyRow.appendChild(qtyArchive.el);
        container.appendChild(qtyRow);

        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.style.cssText = 'display:block;margin-bottom:8px;';
        container.appendChild(fileInput);

        var commentInput = document.createElement('textarea');
        commentInput.placeholder = 'Комментарий';
        commentInput.style.cssText = 'width:100%;min-height:44px;margin-bottom:8px;padding:6px;box-sizing:border-box;';
        container.appendChild(commentInput);

        var printSettingsFields = CrystalPrint.renderPrintSettingsFields();
        container.appendChild(printSettingsFields.el);

        var submitBtn = document.createElement('button');
        submitBtn.className = 'ui-btn ui-btn-success ui-btn-sm';
        submitBtn.style.cssText = 'width:100%;';
        submitBtn.textContent = 'Создать без файла';

        function updateSubmitLabel() {
            submitBtn.textContent = fileInput.files[0] ? 'Загрузить' : 'Создать без файла';
        }
        fileInput.addEventListener('change', updateSubmitLabel);

        submitBtn.onclick = function () {
            var file = fileInput.files[0] || null;

            submitBtn.disabled = true;
            submitBtn.textContent = file ? 'Загрузка…' : 'Создание…';

            CrystalPrint.loadCurrentUser().then(function (user) {
                var info = getInfo();
                var fd = new FormData();
                if (file) fd.append('file', file, file.name);
                fd.append('taskId', taskId);
                if (info.dealId) fd.append('dealId', info.dealId);
                if (info.client) fd.append('client', info.client);
                fd.append('comment', commentInput.value || '');
                fd.append('printSettings', JSON.stringify(printSettingsFields.getValue()));
                if (qtyOrder.input.value) fd.append('qtyOrder', qtyOrder.input.value);
                if (qtyArchive.input.value) fd.append('qtyArchive', qtyArchive.input.value);
                if (user && user.id) fd.append('uploadedById', String(user.id));
                return CrystalPrint.uploadPrint(fd);
            }).then(function () {
                fileInput.value = '';
                commentInput.value = '';
                qtyOrder.input.value = '';
                qtyArchive.input.value = '';
                printSettingsFields.reset();
                submitBtn.disabled = false;
                updateSubmitLabel();
                onUploaded();
            }).catch(function (e) {
                alert('Ошибка: ' + e.message);
                submitBtn.disabled = false;
                updateSubmitLabel();
            });
        };
        container.appendChild(submitBtn);
    }

})();
