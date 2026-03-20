BX.ready(function () {

    //console.log('custom.js loaded');

    let url = window.location.href;
    let dealMatch = url.match(/crm\/deal\/details\/(\d+)/);

    if (dealMatch) {
        let dealId = dealMatch[1];

        if (dealId > 0) {

            let url = window.location.href;
            let dealMatch = url.match(/crm\/deal\/details\/(\d+)/);

            dealId = dealMatch[1];

            // Добавляем кнопку
            const needBtnCode = 'UF_CRM_1765617418';
            const btnChange = document.querySelector(`[data-cid="${needBtnCode}"]`);
            if (btnChange) {
                const newBtn = document.createElement('button');
                newBtn.className = 'ui-btn ui-btn-primary ui-btn-sm';
                newBtn.style.marginLeft = '10px';
                newBtn.textContent = 'Расчитать доставку';
                newBtn.onclick = function () {
                    console.log('Расчитать доставку для сделки ' + dealId);
                    // BX.ajax({
                    //     url: '/local/ajax/update_com_field.php',
                    //     method: 'POST',
                    //     dataType: 'json',
                    //     data: {
                    //         dealId: dealId,
                    //         action: 'update_all_comments_in_products'
                    //     },
                    //     onsuccess: function (response) {
                    //         if (response.status === 'success') {
                    //             BX.UI.Notification.Center.notify({
                    //                 content: response.message,
                    //                 color: 'success'
                    //             });
                    //             //location.reload();
                    //         } else {
                    //             BX.UI.Notification.Center.notify({
                    //                 content: response.message || 'Ошибка при обновлении',
                    //                 color: 'danger'
                    //             });
                    //         }
                    //     },
                    //     onfailure: function () {
                    //         BX.UI.Notification.Center.notify({
                    //             content: 'Ошибка при обновлении',
                    //             color: 'danger'
                    //         });
                    //     }
                    // })
                };
                btnChange.parentElement.appendChild(newBtn);
            }
            //

            //const needProperty = 'PROPERTY_91';
            // PROPERTY_92
            const needProperty = 'PROPERTY_92';

            //const saveInProperty = 'UF_CRM_1755616706';
            // UF_CRM_1755779350
            const saveInProperty = 'UF_CRM_1755779350';


            const observer = new MutationObserver(function(mutations, obs) {
                const gridNode = document.body.querySelector('[id^="CCrmEntityProductListComponent"]');

                if (gridNode) {
                    let gridManager = BX.Main.gridManager.getById('CCrmEntityProductListComponent');
                    let grid = gridManager && gridManager.instance;

                    // BX.Main.gridManager.getById('CCrmEntityProductListComponent').instance.reloadTable();

                    if (grid) {

                        let rows = grid.getRows();
                        let children = rows.getBodyChild();

                        let needKey = null;

                        let firstRow = rows.rows[0];
                        if (firstRow && firstRow.node) {
                            let cells = firstRow.node.children;
                            Array.from(cells).forEach((td, key) => {
                                if (td.getAttribute('data-name') == needProperty) {
                                    needKey = key;
                                }
                            });
                        }

                        if (needKey !== null) {
                            children.forEach(row => {
                                let dataID = row.getId();
                                let cells = row.node.children;
                                let td = cells[needKey];
                                
                                if (td) {
                                    if (td.querySelector('input.main-grid-editor-text')) return;
                                    // например, вставим input
                                    let div = document.createElement('div');
                                    div.setAttribute('data-id', dataID);
                                    div.setAttribute('data-deal-id', dealId);
                                    div.className = 'main-grid-editor-container';
                                    let input = document.createElement('input');
                                    input.type = 'text';
                                    input.className = 'main-grid-editor main-grid-editor-text';
                                    td.innerHTML = ''; // очистить содержимое
                                    div.appendChild(input);
                                    // добавим placeholder
                                    input.placeholder = 'Введите текст';
                                    td.appendChild(div);
                                    let oldValue = '';
                                    BX.ajax({
                                        url: '/local/ajax/get_com_field.php',
                                        method: 'POST',
                                        dataType: 'json',
                                        data: {
                                            dealId: dealId,
                                            rowId: dataID,
                                            action: 'get_new_comment'
                                        },
                                        onsuccess: function (response) {
                                            if (response.status === 'success') {
                                                // BX.UI.Notification.Center.notify({
                                                //     content: response.message || 'Ошибка при получении данных',
                                                //     color: 'success'
                                                // });
                                                input.value = response.value[0].VALUE || '';
                                            } else {
                                                // BX.UI.Notification.Center.notify({
                                                //     content: response.message || 'Ошибка при получении данных',
                                                //     color: 'danger'
                                                // });
                                            }
                                            document.activeElement.blur();
                                        },
                                        onfailure: function () {
                                            // BX.UI.Notification.Center.notify({
                                            //     content: 'Ошибка при получении данных',
                                            //     color: 'danger'
                                            // });
                                        }
                                    })
                                    input.addEventListener('focus', () => {
                                        oldValue = input.value;
                                    });

                                    input.addEventListener('input', () => {
                                        if (!td.querySelector('.custom-action-buttons')) {
                                            let btns = document.createElement('div');
                                            btns.className = 'main-grid-editor-container custom-action-buttons add_com_field_btns';
                                            btns.style.marginLeft = '5px';

                                            let saveBtn = document.createElement('button');
                                            saveBtn.textContent = 'Сохранить';
                                            saveBtn.className = 'ui-btn ui-btn-success ui-btn-sm';
                                            saveBtn.onclick = () => {
                                                let saveComment = '';
                                                let valueToSave = null;
                                                let saveOneItem = [];
                                                children.forEach(row => {
                                                    valueToSave = row.node.children[needKey].querySelector('input.main-grid-editor-text').value.trim();
                                                    if (valueToSave) {
                                                        saveComment += valueToSave + '\n\n';
                                                    }
                                                    saveOneItem.push({
                                                        rowId: row.node.children[needKey].querySelector('input.main-grid-editor-text').parentElement.getAttribute('data-id'),
                                                        value: valueToSave,
                                                        dealId: row.node.children[needKey].querySelector('input.main-grid-editor-text').parentElement.getAttribute('data-deal-id')
                                                    });
                                                });
                                                let dealId = input.parentElement.getAttribute('data-deal-id');
                                                let rowId = input.parentElement.getAttribute('data-id');
                                                let newTextToSave = saveComment;

                                                if (!newTextToSave) {
                                                    // BX.UI.Notification.Center.notify({
                                                    //     content: 'Поле пустое',
                                                    //     color: 'danger'
                                                    // });
                                                    return;
                                                }
                                                BX.ajax({
                                                    url: '/local/ajax/update_com_field.php',
                                                    method: 'POST',
                                                    dataType: 'json',
                                                    data: {
                                                        dealId: dealId,
                                                        rowId: rowId,
                                                        value: newTextToSave,
                                                        saveInProperty: saveInProperty,
                                                        action: 'add_new_comment'
                                                    },
                                                    onsuccess: function (response) {
                                                        if (response.status === 'success') {
                                                            BX.UI.Notification.Center.notify({
                                                                content: response.message,
                                                                color: 'success'
                                                            });
                                                            BX.ajax({
                                                                url: '/local/ajax/add_com_other_table.php',
                                                                method: 'POST',
                                                                dataType: 'json',
                                                                data: {
                                                                    saveOneItem: saveOneItem,
                                                                    action: 'add_to_other_table'
                                                                },
                                                                onsuccess: function (response) {
                                                                    if (response.status === 'success') {
                                                                        // BX.UI.Notification.Center.notify({
                                                                        //     content: response.message,
                                                                        //     color: 'success'
                                                                        // });
                                                                    }
                                                                },
                                                                onfailure: function () {
                                                                    // BX.UI.Notification.Center.notify({
                                                                    //     content: 'Ошибка при сохранении',
                                                                    //     color: 'danger'
                                                                    // });
                                                                }
                                                            });
                                                        } else {
                                                            // BX.UI.Notification.Center.notify({
                                                            //     content: 'Ошибка при сохранении',
                                                            //     color: 'danger'
                                                            // });
                                                        }
                                                        document.activeElement.blur();
                                                        //grid.reloadTable();
                                                    },
                                                    onfailure: function () {
                                                        // BX.UI.Notification.Center.notify({
                                                        //     content: 'Ошибка при сохранении',
                                                        //     color: 'danger'
                                                        // });
                                                    }
                                                })
                                                btns.remove();
                                                document.querySelectorAll('.add_com_field_btns').forEach(btn => btn.remove());
                                            };

                                            let cancelBtn = document.createElement('button');
                                            cancelBtn.textContent = 'Отменить';
                                            cancelBtn.className = 'ui-btn ui-btn-link ui-btn-sm';
                                            cancelBtn.onclick = () => {
                                                //input.value = ''; // очистить / вернуть старое
                                                input.value = oldValue;
                                                BX.ajax({
                                                    url: '/local/ajax/get_com_field.php',
                                                    method: 'POST',
                                                    dataType: 'json',
                                                    data: {
                                                        dealId: dealId,
                                                        rowId: dataID,
                                                        action: 'get_new_comment'
                                                    },
                                                    onsuccess: function (response) {
                                                        if (response.status === 'success') {
                                                            // BX.UI.Notification.Center.notify({
                                                            //     content: response.message || 'Ошибка при получении данных',
                                                            //     color: 'success'
                                                            // });
                                                            input.value = response.value[0].VALUE || '';
                                                        } else {
                                                            // BX.UI.Notification.Center.notify({
                                                            //     content: response.message || 'Ошибка при получении данных',
                                                            //     color: 'danger'
                                                            // });
                                                        }
                                                        document.activeElement.blur();
                                                    },
                                                    onfailure: function () {
                                                        // BX.UI.Notification.Center.notify({
                                                        //     content: 'Ошибка при получении данных',
                                                        //     color: 'danger'
                                                        // });
                                                    }
                                                })
                                                btns.remove();
                                                document.querySelectorAll('.add_com_field_btns').forEach(btn => btn.remove());
                                            };

                                            btns.appendChild(saveBtn);
                                            btns.appendChild(cancelBtn);
                                            td.appendChild(btns);
                                        }
                                    });
                                }
                            });
                        }

                    }
                    //obs.disconnect();
                }
            });

            function startAddChange () {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }

            startAddChange();
        }
    }

})