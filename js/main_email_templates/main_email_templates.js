(function() {
    function log() {
        try {
                //console.info("[mail-add-templates]", ...arguments); 
            } 
        catch(e) {
            //
        }
    }

    BX.ready(function() {
        if (!window.location.href.match(/\/mail\/message\/new/)) { return; }
        log('mail-add-templates активен на этой странице');

        const buttonsBox = document.getElementById('ui-toolbar-title-item-box-buttons');
        if (!buttonsBox) { return; }

        const checkboxContainer = document.querySelectorAll('.main-mail-form-footer');
        if (!checkboxContainer) { return; }

        // Стили
        const style = document.createElement('style');
        style.textContent = `
            .mail-template-block {
                display:flex;align-items:center;cursor:pointer;padding:4px 10px;
                border:1px solid #d9d9d9;border-radius:3px;background:#fff;
                font-size:14px;margin-left:5px;
            }
            .mail-template-block:hover{background:#f5f5f5;}
            .mail-template-block .crm-activity-planner-slider-header-control-description{margin-right:5px;font-weight:500;color:#333;}
            .mail-template-block .crm-activity-planner-slider-header-control-text{margin-right:5px;color:#555;}
            .template-manager-popup{font-family:"Helvetica Neue",Arial,sans-serif;font-size:14px;padding:10px;background:#fff;border:1px solid #d9d9d9;border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}
            .template-manager-popup>div>div{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid #e1e4e6;border-radius:3px;cursor:default;transition:background 0.2s;}
            .template-manager-popup>div>div:last-child{border-bottom:none;}
            .template-manager-popup>div>div:hover{background:#f5f7fa;}
            .template-manager-popup>div>div>span{color:#333;font-weight:500;}
            .template-manager-popup>div>div>div{display:flex;gap:5px;}
            .template-manager-popup input,.template-manager-popup textarea{width:100%;padding:5px 6px;margin:5px 0;border:1px solid #d9d9d9;border-radius:3px;font-size:14px;box-sizing:border-box;}
            .template-manager-popup textarea{resize:none;height:150px;}
            .menu-popup{font-family:"Helvetica Neue",Arial,sans-serif;font-size:14px;background:#fff;border:1px solid #d9d9d9;border-radius:3px;box-shadow:0 2px 10px rgba(0,0,0,0.1);padding:4px 0;}
            .menu-popup-item{display:flex;align-items:center;padding:6px 12px;cursor:pointer;transition:background 0.2s;color:#333;text-decoration:none;}
            .menu-popup-item:hover{background-color:#f5f7fa;}
            .menu-popup-item-selected{font-weight:500;background-color:#e6f5ff;color:#0b66c3;}
            .menu-popup-separator{border-top:1px solid #e1e4e6;margin:3px 0;pointer-events:none;}
        `;
        document.head.appendChild(style);

        const tplBlock = document.createElement('div');
        tplBlock.className = 'mail-template-block crm-activity-planner-slider-header-control-item crm-activity-planner-slider-header-control-select crm-activity-email-create-template';

        const desc = document.createElement('div');
        desc.className = 'crm-activity-planner-slider-header-control-description';
        desc.textContent = 'Шаблон:';

        const text = document.createElement('div');
        text.className = 'crm-activity-planner-slider-header-control-text';
        text.textContent = 'Без шаблона';

        tplBlock.appendChild(desc);
        tplBlock.appendChild(text);
        tplBlock.appendChild(document.createElement('div')).className = 'crm-activity-planner-slider-header-control-triangle';

        // ===== Функция загрузки шаблонов =====
        let templates = [];
        function loadTemplates(callback) {
            BX.ajax({
                url: '/local/js/main_email_templates/main_email_templates.php',
                method: 'POST',
                data: { action: 'get_email_templates' },
                dataType: 'json',
                onsuccess: function(response) {
                    templates = [];
                    if (response && response.templates) {
                        response.templates.forEach(tpl => {
                            templates.push({
                                id: tpl.id,
                                title: tpl.title,
                                subject: tpl.subject,
                                body: tpl.body
                            });
                        });
                        log('Шаблоны загружены', templates);
                    } else {
                        log('Нет шаблонов в ответе');
                    }
                    if (callback) callback();
                },
                onfailure: function() {
                    log('Ошибка при загрузке шаблонов');
                    if (callback) callback();
                }
            });
        }

        function setSubject(subject) {
            const input = document.querySelector('input[name="data[subject]"]');
            if (input) input.value = subject || '';
        }

        function setBody(body) {
            const editor = BXHtmlEditor.Get('main_mail_form_mail_msg_new_form_editor');
            if (editor) {
                editor.SetContent(body || '<br>');
                editor.Focus();
            }
        }

        // ===== Менеджер шаблонов =====
        function openTemplateManager() {
            const popupId = 'template-manager-popup-'+Date.now();
            const content = BX.create('div', {props:{className:'template-manager-popup'}});
            const listContainer = BX.create('div', {style:'margin-bottom:10px;'});
            content.appendChild(listContainer);

            function renderTemplateList() {
                listContainer.innerHTML='';
                templates.forEach(tpl => {
                    const item = BX.create('div', {className:'template-list-item'});
                    item.appendChild(BX.create('span', {text:tpl.title}));

                    const btns = BX.create('div');
                    const editBtn = BX.create('button', {
                        props:{className:'ui-btn ui-btn-light-border',type:'button'},
                        text:'✏️',
                        events:{click:()=>openEditing(tpl)}
                    });
                    const delBtn = BX.create('button', {
                        props:{className:'ui-btn ui-btn-danger',type:'button'},
                        text:'🗑️',
                        events:{click:()=>{
                            BX.ajax({
                                url: '/local/js/main_email_templates/main_email_templates.php',
                                method: 'POST',
                                data: {
                                    action:'delete_email_template',
                                    id:tpl.id
                                },
                                dataType:'json',
                                onsuccess:function(){
                                    loadTemplates(renderTemplateList);
                                }
                            });
                        }}
                    });
                    btns.appendChild(editBtn);
                    btns.appendChild(delBtn);
                    item.appendChild(btns);
                    listContainer.appendChild(item);
                });
            }

            renderTemplateList();

            const titleInput = BX.create('input',{props:{type:'text',placeholder:'Название шаблона'}});
            const subjectInput = BX.create('input',{props:{type:'text',placeholder:'Тема письма'}});
            const bodyTextarea = BX.create('textarea',{props:{placeholder:'Тело письма'}});
            const saveBtn = BX.create('button',{
                props:{className:'ui-btn ui-btn-success',type:'button'},
                text:'Сохранить шаблон'
            });

            // content.appendChild(titleInput);
            // content.appendChild(subjectInput);
            // content.appendChild(bodyTextarea);
            // content.appendChild(saveBtn);

            const popup = new BX.PopupWindow(popupId,tplBlock,{content:content,titleBar:'Менеджер шаблонов',closeIcon:true,width:500,autoHide:true});
            popup.show();

            saveBtn.addEventListener('click',function() {
                const title = titleInput.value.trim();
                const subject = subjectInput.value.trim();
                const body = bodyTextarea.value;
                if(!title) { alert('Введите название шаблона'); return; }

                const editingId = saveBtn.getAttribute('data-editing-id');
                let actionData = {action: editingId ? 'update_email_template' : 'add_email_template', title, subject, body};
                if(editingId) actionData.id = editingId;

                BX.ajax({
                    url: '/local/js/main_email_templates/main_email_templates.php',
                    method: 'POST',
                    data: actionData,
                    dataType: 'json',
                    onsuccess:function(){
                        titleInput.value=''; subjectInput.value=''; bodyTextarea.value='';
                        saveBtn.removeAttribute('data-editing-id');
                        loadTemplates(renderTemplateList);
                    }
                });
            });

            function editTemplate(tpl) {
                titleInput.value = tpl.title;
                subjectInput.value = tpl.subject;
                bodyTextarea.value = tpl.body;
                saveBtn.setAttribute('data-editing-id', tpl.id);
            }

            function openEditing(tpl) {
                if (!tpl || !tpl.id) return;
                const url = `/crm/configs/mailtemplate/edit/${tpl.id}/`;
                window.open(url, '_blank', 'noopener, noreferrer');
            }
        }

        // ===== Меню =====
        function updateMenu() {
            tplBlock.onclick = function() {
                loadTemplates(function() {
                    const menuItems = [
                        {
                            html: `<span style="display:flex; align-items:center;">
                                    <svg width="16" height="16" style="margin-right:5px;" viewBox="0 0 16 16"><path fill="currentColor" d="M12.3 3.7l.7.7-9 9H3.3v-1.7l9-9zM11.3 2.7L13 4.3l-1.4 1.4-1.7-1.7L11.3 2.7z"/>
                                    </svg>Настроить
                                </span>`,
                            onclick: () => {
                                openTemplateManager();
                                BX.PopupMenu.destroy('mail-template-selector');
                            }
                        },
                        {
                            html: `<span style="display:flex; align-items:center;">
                                    <svg width="16" height="16" style="margin-right:5px;" viewBox="0 0 16 16"><path fill="currentColor" d="M1 3h14v2H1V3zm0 4h14v2H1V7zm0 4h14v2H1v-2z"/>
                                    </svg>Без шаблона
                                </span>`,
                            onclick: () => {
                                text.textContent = 'Без шаблона';
                                setSubject('');
                                setBody('');
                                BX.PopupMenu.destroy('mail-template-selector');
                            }
                        }
                    ];

                    templates.forEach(tpl => {
                        menuItems.push({
                            html: `<span style="display:flex; align-items:center;">
                                    <svg width="16" height="16" style="margin-right:5px;" viewBox="0 0 16 16">
                                        <circle cx="8" cy="8" r="6" fill="${tpl.id === text._id ? '#0b66c3' : '#ccc'}"/>
                                    </svg>${tpl.title}
                                </span>`,
                            onclick: () => {
                                text.textContent = tpl.title;
                                text._id = tpl.id;
                                setSubject(tpl.subject);
                                setBody(tpl.body);
                                BX.PopupMenu.destroy('mail-template-selector');
                            }
                        });
                    });

                    BX.PopupMenu.show('mail-template-selector', tplBlock, menuItems, {
                        offsetLeft: 0,
                        offsetTop: 0,
                        className: 'custom-menu-popup'
                    });
                });
            };
        }

        updateMenu();
        buttonsBox.appendChild(tplBlock);
        const saveBtn = BX.create('button', {
            props: { className: 'ui-btn ui-btn-success', type: 'button' },
            text: '💾 Сохранить шаблон'
        });
        /*
        <label class="crm-task-list-mail-additionally-info-name" style="display: flex; align-items: center; ">
				<input type="checkbox" name="save_as_template" value="1" style="margin: 0 5px; ">Сохранить как шаблон</label>
        */
       const checkboxContainers = document.querySelectorAll('.main-mail-form-footer');
        //if (!checkboxContainers || checkboxContainers.length === 0) { return; }

        checkboxContainers.forEach(container => {
            const label = document.createElement('label');
            label.className = 'crm-task-list-mail-additionally-info-name label_save_templates';
            label.style.cssText = 'display: flex; align-items: center;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'save_as_template';
            checkbox.value = '1';
            checkbox.style.cssText = 'margin: 0 5px;';

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode('Сохранить как шаблон'));

            container.appendChild(label);

            label.addEventListener('click', function(e) {
                label.style.pointerEvents = 'none';
                label.style.opacity = '0.4';
                if (e.target.checked) {
                    BX.ajax({
                        url: '/local/js/main_email_templates/main_email_templates.php',
                        method: 'POST',
                        data: {
                            action: 'add_email_template',
                            title: document.querySelector('input[name="data[subject]"]').value || 'Без названия',
                            subject: document.querySelector('input[name="data[subject]"]').value || 'Без названия',
                            body: BXHtmlEditor.Get('main_mail_form_mail_msg_new_form_editor').GetContent()
                        },
                        dataType: 'json',
                        onsuccess:function(res){
                            label.style.pointerEvents = 'inherit';
                            label.style.opacity = '1';
                            label.setAttribute('data-new-template-id', res.id);
                            BX.PopupMenu.destroy('mail-template-selector');
                        }
                    });
                } else if (!e.target.checked) {
                    BX.ajax({
                        url: '/local/js/main_email_templates/main_email_templates.php',
                        method: 'POST',
                        data: {
                            action: 'delete_email_template',
                            id: label.getAttribute('data-new-template-id')
                        },
                        dataType:'json',
                        onsuccess:function(){
                            label.style.pointerEvents = 'inherit';
                            label.style.opacity = '1';
                            label.removeAttribute('data-new-template-id');
                            BX.PopupMenu.destroy('mail-template-selector');
                        }
                    });
                }
            });
        });
        //checkboxContainer.appendChild(saveBtn);
        log('mail-add-templates инициализирован');
    });
})();

(function() {
    function log() { 
        try { 
                //console.info('[mail-add-templates]', ...arguments); 
            } 
        catch(e) {
            //
        } 
    }

    function insertSaveTemplateCheckbox(container) {
        if (container.querySelector('.label_save_templates')) return;

        const label = document.createElement('label');
        label.className = 'crm-task-list-mail-additionally-info-name label_save_templates';
        label.style.cssText = 'display:flex;align-items:center;margin-left:5px;';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'save_as_template';
        checkbox.value = '1';
        checkbox.style.cssText = 'margin:0 5px;';

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode('Сохранить как шаблон'));
        container.appendChild(label);

        checkbox.addEventListener('click', function(e) {
            // ищем iframe родителя
            let iframe = container.closest('iframe');
            let doc = iframe ? iframe.contentDocument || iframe.contentWindow.document : document;

            const form = doc.querySelector('form[id^="mail_msg_reply_"]');
            if (!form) {
                log('Форма не найдена');
                return;
            }

            const formIdMatch = form.id.match(/mail_msg_reply_(\d+)_form/);
            if (!formIdMatch) return;
            const messageId = formIdMatch[1];
            const editorId = `main_mail_form_mail_msg_reply_${messageId}_form_editor`;

            const subjectInput = form.querySelector('input[name="data[subject]"]');
            let bodyHtml = '';

            try {
                const editor = LHEPostForm.getEditor(editorId);
                if (editor) bodyHtml = editor.GetContent();
            } catch(e) {
                log('Ошибка получения редактора', e);
            }

            if (!bodyHtml) {
                const fallbackTextarea = form.querySelector('textarea[name="BODY"]');
                if (fallbackTextarea) bodyHtml = fallbackTextarea.value;
            }

            const data = {
                action: 'add_email_template',
                title: subjectInput?.value || 'Без названия',
                subject: subjectInput?.value || 'Без названия',
                body: bodyHtml
            };

            //console.log(data);

            if (checkbox.checked) {
                BX.ajax({
                    url: '/local/js/main_email_templates/main_email_templates.php',
                    method: 'POST',
                    data: data,
                    dataType: 'json',
                    onsuccess: function(res) {
                        if (res?.id) label.setAttribute('data-new-template-id', res.id);
                        log('Шаблон сохранен', res);
                        BX.PopupMenu.destroy('mail-template-selector');
                    },
                    onfailure: function() {
                        log('Ошибка при сохранении шаблона');
                    }
                });
            } else {
                const templateId = label.getAttribute('data-new-template-id');
                if (!templateId) return;
                BX.ajax({
                    url: '/local/js/main_email_templates/main_email_templates.php',
                    method: 'POST',
                    data: { action: 'delete_email_template', id: templateId },
                    dataType: 'json',
                    onsuccess: function() {
                        label.removeAttribute('data-new-template-id');
                        log('Шаблон удален');
                        BX.PopupMenu.destroy('mail-template-selector');
                    }
                });
            }
        });
    }

    function insertSaveTemplateList (container) {
        if (container.querySelector('.choose_main_mail_template')) return;
        const tplBlock = document.createElement('div');
        tplBlock.className = 'choose_main_mail_template mail-template-block crm-activity-planner-slider-header-control-item crm-activity-planner-slider-header-control-select crm-activity-email-create-template';

        const desc = document.createElement('div');
        desc.className = 'crm-activity-planner-slider-header-control-description';
        desc.textContent = 'Шаблон:';

        const text = document.createElement('div');
        text.className = 'crm-activity-planner-slider-header-control-text';
        text.textContent = 'Без шаблона';

        tplBlock.appendChild(desc);
        tplBlock.appendChild(text);
        tplBlock.appendChild(document.createElement('div')).className = 'crm-activity-planner-slider-header-control-triangle';
        container.appendChild(tplBlock);

        // ===== Функция загрузки шаблонов =====
        let templates = [];
        function loadTemplates(callback) {
            BX.ajax({
                url: '/local/js/main_email_templates/main_email_templates.php',
                method: 'POST',
                data: { action: 'get_email_templates' },
                dataType: 'json',
                onsuccess: function(response) {
                    templates = [];
                    if (response && response.templates) {
                        response.templates.forEach(tpl => {
                            templates.push({
                                id: tpl.id,
                                title: tpl.title,
                                subject: tpl.subject,
                                body: tpl.body
                            });
                        });
                        log('Шаблоны загружены', templates);
                    } else {
                        log('Нет шаблонов в ответе');
                    }
                    if (callback) callback();
                },
                onfailure: function() {
                    log('Ошибка при загрузке шаблонов');
                    if (callback) callback();
                }
            });
        }

        function setBody(body) {
            //console.log(body);

            let iframe = container.closest('iframe');
            let doc = iframe ? iframe.contentDocument || iframe.contentWindow.document : document;

            const form = doc.querySelector('form[id^="mail_msg_reply_"]');
            if (!form) {
                log('Форма не найдена');
                return;
            }

            const formIdMatch = form.id.match(/mail_msg_reply_(\d+)_form/);
            if (!formIdMatch) return;
            const messageId = formIdMatch[1];
            const editorId = `main_mail_form_mail_msg_reply_${messageId}_form_editor`;
            // console.log('messageId ', messageId);
            // console.log('editorId ', editorId);

            let bodyHtml = body;

            try {
                const editor = LHEPostForm.getEditor(editorId);
                if (editor) editor.SetContent(bodyHtml);
            } catch(e) {
                log('Ошибка получения редактора', e);
            }

            // if (!bodyHtml) {
            //     const fallbackTextarea = form.querySelector('textarea[name="BODY"]');
            //     if (fallbackTextarea) bodyHtml = fallbackTextarea.value;
            // }

            // const editor = BXHtmlEditor.Get('main_mail_form_mail_msg_new_form_editor');
            // if (editor) {
            //     editor.SetContent(body || '<br>');
            //     editor.Focus();
            // }
        }

        // ===== Менеджер шаблонов =====
        function openTemplateManager() {
            const popupId = 'template-manager-popup-'+Date.now();
            const content = BX.create('div', {props:{className:'template-manager-popup'}});
            const listContainer = BX.create('div', {style:'margin-bottom:10px;'});
            content.appendChild(listContainer);

            function renderTemplateList() {
                listContainer.innerHTML='';
                templates.forEach(tpl => {
                    const item = BX.create('div', {className:'template-list-item'});
                    item.appendChild(BX.create('span', {text:tpl.title}));

                    const btns = BX.create('div');
                    const editBtn = BX.create('button', {
                        props:{className:'ui-btn ui-btn-light-border',type:'button'},
                        text:'✏️',
                        events:{click:()=>openEditing(tpl)}
                    });
                    const delBtn = BX.create('button', {
                        props:{className:'ui-btn ui-btn-danger',type:'button'},
                        text:'🗑️',
                        events:{click:()=>{
                            BX.ajax({
                                url: '/local/js/main_email_templates/main_email_templates.php',
                                method: 'POST',
                                data: {
                                    action:'delete_email_template',
                                    id:tpl.id
                                },
                                dataType:'json',
                                onsuccess:function(){
                                    loadTemplates(renderTemplateList);
                                }
                            });
                        }}
                    });
                    btns.appendChild(editBtn);
                    btns.appendChild(delBtn);
                    item.appendChild(btns);
                    listContainer.appendChild(item);
                });
            }

            renderTemplateList();

            const titleInput = BX.create('input',{props:{type:'text',placeholder:'Название шаблона'}});
            const subjectInput = BX.create('input',{props:{type:'text',placeholder:'Тема письма'}});
            const bodyTextarea = BX.create('textarea',{props:{placeholder:'Тело письма'}});
            const saveBtn = BX.create('button',{
                props:{className:'ui-btn ui-btn-success',type:'button'},
                text:'Сохранить шаблон'
            });

            // content.appendChild(titleInput);
            // content.appendChild(subjectInput);
            // content.appendChild(bodyTextarea);
            // content.appendChild(saveBtn);

            const popup = new BX.PopupWindow(
                popupId,
                tplBlock,
                {
                    content:content,
                    titleBar:'Менеджер шаблонов',
                    closeIcon:true,
                    width:500,
                    autoHide:true
                });
            popup.show();

            saveBtn.addEventListener('click',function() {
                const title = titleInput.value.trim();
                const subject = subjectInput.value.trim();
                const body = bodyTextarea.value;
                if(!title) { alert('Введите название шаблона'); return; }

                const editingId = saveBtn.getAttribute('data-editing-id');
                let actionData = {action: editingId ? 'update_email_template' : 'add_email_template', title, subject, body};
                if(editingId) actionData.id = editingId;

                BX.ajax({
                    url: '/local/js/main_email_templates/main_email_templates.php',
                    method: 'POST',
                    data: actionData,
                    dataType: 'json',
                    onsuccess:function(){
                        titleInput.value=''; subjectInput.value=''; bodyTextarea.value='';
                        saveBtn.removeAttribute('data-editing-id');
                        loadTemplates(renderTemplateList);
                    }
                });
            });

            function editTemplate(tpl) {
                titleInput.value = tpl.title;
                subjectInput.value = tpl.subject;
                bodyTextarea.value = tpl.body;
                saveBtn.setAttribute('data-editing-id', tpl.id);
            }

            function openEditing(tpl) {
                if (!tpl || !tpl.id) return;
                const url = `/crm/configs/mailtemplate/edit/${tpl.id}/`;
                window.open(url, '_blank', 'noopener, noreferrer');
            }
        }

        // ===== Меню =====
        function updateMenu() {
            tplBlock.onclick = function() {
                loadTemplates(function() {
                    const menuItems = [
                        {
                            html: `<span style="display:flex; align-items:center;">
                                    <svg width="16" height="16" style="margin-right:5px;" viewBox="0 0 16 16"><path fill="currentColor" d="M12.3 3.7l.7.7-9 9H3.3v-1.7l9-9zM11.3 2.7L13 4.3l-1.4 1.4-1.7-1.7L11.3 2.7z"/>
                                    </svg>Настроить
                                </span>`,
                            onclick: () => {
                                openTemplateManager();
                                BX.PopupMenu.destroy('mail-template-selector');
                            }
                        },
                        {
                            html: `<span style="display:flex; align-items:center;">
                                    <svg width="16" height="16" style="margin-right:5px;" viewBox="0 0 16 16"><path fill="currentColor" d="M1 3h14v2H1V3zm0 4h14v2H1V7zm0 4h14v2H1v-2z"/>
                                    </svg>Без шаблона
                                </span>`,
                            onclick: () => {
                                text.textContent = 'Без шаблона';
                                //setSubject('');
                                setBody('');
                                BX.PopupMenu.destroy('mail-template-selector');
                            }
                        }
                    ];

                    templates.forEach(tpl => {
                        menuItems.push({
                            html: `<span style="display:flex; align-items:center;">
                                    <svg width="16" height="16" style="margin-right:5px;" viewBox="0 0 16 16">
                                        <circle cx="8" cy="8" r="6" fill="${tpl.id === text._id ? '#0b66c3' : '#ccc'}"/>
                                    </svg>${tpl.title}
                                </span>`,
                            onclick: () => {
                                text.textContent = tpl.title;
                                text._id = tpl.id;
                                //setSubject(tpl.subject);
                                setBody(tpl.body);
                                BX.PopupMenu.destroy('mail-template-selector');
                            }
                        });
                    });

                    BX.PopupMenu.destroy('mail-template-selector');

                    BX.PopupMenu.show('mail-template-selector', tplBlock, menuItems, {
                        offsetLeft: 0,
                        offsetTop: 0,
                        className: 'custom-menu-popup'
                    });
                });
            };
        }

        updateMenu();
        
        log('mail-add-templates инициализирован');
    }

    function processAllMailFootersTemplates () {
        // Стили
        const style = document.createElement('style');
        style.textContent = `
            .mail-template-block {
                display:flex;align-items:center;cursor:pointer;padding:4px 10px;
                border:1px solid #d9d9d9;border-radius:3px;background:#fff;
                font-size:14px;margin-left:5px;
            }
            .mail-template-block:hover{background:#f5f5f5;}
            .mail-template-block .crm-activity-planner-slider-header-control-description{margin-right:5px;font-weight:500;color:#333;}
            .mail-template-block .crm-activity-planner-slider-header-control-text{margin-right:5px;color:#555;}
            .template-manager-popup{font-family:"Helvetica Neue",Arial,sans-serif;font-size:14px;padding:10px;background:#fff;border:1px solid #d9d9d9;border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}
            .template-manager-popup>div>div{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid #e1e4e6;border-radius:3px;cursor:default;transition:background 0.2s;}
            .template-manager-popup>div>div:last-child{border-bottom:none;}
            .template-manager-popup>div>div:hover{background:#f5f7fa;}
            .template-manager-popup>div>div>span{color:#333;font-weight:500;}
            .template-manager-popup>div>div>div{display:flex;gap:5px;}
            .template-manager-popup input,.template-manager-popup textarea{width:100%;padding:5px 6px;margin:5px 0;border:1px solid #d9d9d9;border-radius:3px;font-size:14px;box-sizing:border-box;}
            .template-manager-popup textarea{resize:none;height:150px;}
            .menu-popup{font-family:"Helvetica Neue",Arial,sans-serif;font-size:14px;background:#fff;border:1px solid #d9d9d9;border-radius:3px;box-shadow:0 2px 10px rgba(0,0,0,0.1);padding:4px 0;}
            .menu-popup-item{display:flex;align-items:center;padding:6px 12px;cursor:pointer;transition:background 0.2s;color:#333;text-decoration:none;}
            .menu-popup-item:hover{background-color:#f5f7fa;}
            .menu-popup-item-selected{font-weight:500;background-color:#e6f5ff;color:#0b66c3;}
            .menu-popup-separator{border-top:1px solid #e1e4e6;margin:3px 0;pointer-events:none;}
        `;
        document.head.appendChild(style);
        const footers = document.querySelectorAll('.main-mail-form-footer');
        footers.forEach(insertSaveTemplateList);
    }

    function processAllMailFooters() {
        const footers = document.querySelectorAll('.main-mail-form-footer');
        footers.forEach(insertSaveTemplateCheckbox);
    }

    BX.ready(function() {
        if (!window.location.href.match(/\/mail\/message\/(\d+)/)) { return; }
        processAllMailFootersTemplates();
        processAllMailFooters();

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;

                    if (node.matches('.main-mail-form-footer')) insertSaveTemplateList(node);
                    else node.querySelectorAll?.('.main-mail-form-footer').forEach(insertSaveTemplateList);

                    if (node.matches('.main-mail-form-footer')) insertSaveTemplateCheckbox(node);
                    else node.querySelectorAll?.('.main-mail-form-footer').forEach(insertSaveTemplateCheckbox);
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
        log('Скрипт вставки чекбокса шаблона активен');
    });
})();
