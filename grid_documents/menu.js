BX.ready(function() {
    let url = window.location.href;
    ///shop/documents/moving
    let shopDocumentsMatch1 = url.match(/\/shop\/documents\/receipt_adjustment/);
	let shopDocumentsMatch2 = url.match(/\/shop\/documents\/sales_order/);
	let shopDocumentsMatch3 = url.match(/\/shop\/documents\/moving/);
	let shopDocumentsMatch4 = url.match(/\/shop\/documents\/deduct/);
    
	let name = '';
	let type = '';
	
	if(shopDocumentsMatch1!=null){
		name = "Змінити дату Приходу";
		type = "receipt_adjustment";
	}else if(shopDocumentsMatch2!=null){
		name = "Змінити дату Реалізації";
		type = "sales_order";
	}else if(shopDocumentsMatch3!=null){
		name = "Змінити дату Переміщення";
		type = "moving";
	}else if(shopDocumentsMatch4!=null){
		name = "Змінити дату Списання";
		type = "deduct";
	}else{
		return ;
	}

    // Добавляем пункт меню в контекстное меню строки грида
    if (typeof(type)!="undefined") {
        window.BXDEBUG = true;
        BX.addCustomEvent("onPopupShow", function(popupWindow) {
            try {
				
                const bindEl = popupWindow.bindElement;
                if (!bindEl) return;
 
                const row = bindEl.closest("tr[data-id]");
                if (!row) return;

                const container = popupWindow.contentContainer?.querySelector(".menu-popup-items");
                if (!container) return;

                if (container.querySelector(".added-menu-item2")) return;
 
                const item = document.createElement("span");
                item.className = "menu-popup-item menu-popup-no-icon added-menu-item2";
                item.innerHTML = `<span class="menu-popup-item-icon"></span>
                                <span class="menu-popup-item-text">`+name+`</span>`;

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
                    input.placeholder = "Виберіть дату";
                    calendarContainer.appendChild(input);

                    // Создаём отдельный попап
                    const popup = new BX.PopupWindow("calendar_popup_" + docId, bindEl, {
                        content: calendarContainer,
                        titleBar: "Змінити дату документу " + docId,
                        autoHide: true,
                        closeByEsc: true,
                        zIndex: 2000,
                        closeIcon: true,
                        autoHide: true,
                        buttons: [
                            new BX.PopupWindowButton({
                                text: "Зберегти",
                                className: "ui-btn ui-btn-primary change_document_data_save",
                                events: { click: function() {
                                        BX.ajax({
                                            url: '/local/grid_documents/change.php',
                                            method: 'POST',
                                            data: {
                                                document_id: docId,
                                                new_date: input.value,
												typeDoc: type
                                            },
                                            dataType: 'json', 
                                            onsuccess: function(response) {
                                                console.log(response);
                                                if (response.success) {
                                                    location.reload(); 
                                                } else {
                                                    console.log("Ошибка: " + response.error);
                                                }
                                            },
                                            onfailure: function() {
                                            }
                                        });
                                        this.popupWindow.close();
                                        this.popupWindow.destroy();
                                    }
                                }
                            }),
                            new BX.PopupWindowButton({
                                text: "Закрити",
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
 
                    let calendarInitialized = false;
 
                    input.addEventListener("click", function() {
                         
                        const calendar = BX.calendar({
                            node: input,
                            field: input,
                            bTime: true,
                            bHideTime: true,
                            callback: function(selectedDate) {
                                console.log("ID документу:", docId, "Нова дата:", selectedDate);
                                input.value = selectedDate; 
                            }
                        });

                        calendarInitialized = true;
                    });
                    BX.addCustomEvent(popup, "onPopupClose", function() {
                        popup.destroy();
                    });
                });

                container.appendChild(item);

            } catch (e) {
                console.error("Ошибка в onPopupShow:", e);
            }
        });
    }
});


 