BX.ready(function() {
    let url = window.location.href;
    ///shop/documents/moving
    let shopDocumentsMatch = url.match(/\/shop\/documents\/sales_order/);
    console.log("shopDocumentsMatch", shopDocumentsMatch);
    if (!shopDocumentsMatch) return;

    // Добавляем пункт меню в контекстное меню строки грида
    if (shopDocumentsMatch) {
        window.BXDEBUG = true;
        BX.addCustomEvent("onPopupShow", function(popupWindow) {
            try {
                const bindEl = popupWindow.bindElement;
                if (!bindEl) return;

                // Проверяем, что меню вызвано на строке грида
                const row = bindEl.closest("tr[data-id]");
                if (!row) return;

                const container = popupWindow.contentContainer?.querySelector(".menu-popup-items");
                if (!container) return;

                // Проверяем, чтобы не вставить второй раз
                if (container.querySelector(".added-menu-item")) return;

                // Создаём пункт меню
                const item = document.createElement("span");
                item.className = "menu-popup-item menu-popup-no-icon added-menu-item";
                item.innerHTML = `<span class="menu-popup-item-icon"></span>
                                <span class="menu-popup-item-text">Изменить дату проведения</span>`;

                item.addEventListener("click", function() {
                    const docId = row.getAttribute("data-id");
                    popupWindow.close(); // закрываем контекстное меню

                    // Создаём контейнер и input для даты
                    const calendarContainer = document.createElement("div");
                    calendarContainer.style.padding = "10px";
                    calendarContainer.style.textAlign = "center";

                    const input = document.createElement("input");
                    input.type = "text";
                    input.className = "main-ui-filter-search-filter input_calendar_change_document_data";
                    input.style.width = "220px";
                    input.style.textAlign = "center";
                    input.style.padding = "0 15px";
                    input.placeholder = "Выберите дату";
                    calendarContainer.appendChild(input);

                    // Создаём отдельный попап
                    const popup = new BX.PopupWindow("calendar_popup_" + docId, bindEl, {
                        content: calendarContainer,
                        titleBar: "Изменить дату документа " + docId,
                        autoHide: true,
                        closeByEsc: true,
                        zIndex: 2000,
                        closeIcon: true,
                        autoHide: true,
                        buttons: [
                            new BX.PopupWindowButton({
                                text: "Сохранить",
                                className: "ui-btn ui-btn-primary change_document_data_save",
                                events: { click: function() {
                                        BX.ajax({
                                            url: '/local/ajax/change_documents_data.php',
                                            method: 'POST',
                                            data: {
                                                document_id: docId,
                                                new_date: input.value
                                            },
                                            dataType: 'json',
                                            onsuccess: function(response) {
                                                console.log(response);
                                                if (response.success) {
                                                    console.log("Дата документа изменена");
                                                    location.reload(); // Перезагружаем страницу
                                                } else {
                                                    console.log("Ошибка: " + response.error);
                                                }
                                            },
                                            onfailure: function() {
                                                //alert("Ошибка при выполнении запроса");
                                            }
                                        });
                                        this.popupWindow.close();
                                        this.popupWindow.destroy();
                                        //popupWindow.destroy();
                                    }
                                }
                            }),
                            new BX.PopupWindowButton({
                                text: "Закрыть",
                                className: "ui-btn ui-btn-link popup_window_button_cancel",
                                events: { click: function() {
                                        this.popupWindow.close();
                                        this.popupWindow.destroy();
                                    }
                                }
                            })
                        ]
                    });
                    popup.show();

                    // Флаг, чтобы календарь создавался один раз
                    let calendarInitialized = false;

                    // Клик по input — открываем календарь один раз
                    input.addEventListener("click", function() {
                        //if (calendarInitialized) return; // не создаём второй раз

                        //BX.calendar({}); // закрываем все открытые календари

                        const calendar = BX.calendar({
                            node: input,
                            field: input,
                            bTime: true,
                            bHideTime: true,
                            callback: function(selectedDate) {
                                console.log("ID документа:", docId, "Новая дата:", selectedDate);
                                input.value = selectedDate; // оставляем дату в input
                            }
                        });

                        calendarInitialized = true;
                    });
                    BX.addCustomEvent(popup, "onPopupClose", function() {
                        popup.destroy();
                        //calendar.close();
                    });
                });

                container.appendChild(item);

            } catch (e) {
                console.error("Ошибка в onPopupShow:", e);
            }
        });
    }
});