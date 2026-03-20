(function() {
    function log() { 
        try { 
            //console.info("[mail-fix]", ...arguments); 
        } catch(e) {}
    }

    function removeAllFiles(observer) {
        let replyFormFind = document.querySelectorAll('[id^="divmain_mail_form_crm_act_email_reply"]');
        setTimeout(() => {
            replyFormFind.forEach(form => {
                form.querySelectorAll('.ui-tile-uploader-item-remove .ui-icon-set')
                    .forEach(btn => btn.click());
            });
        }, 400);
        // отключаем observer после удаления
        if (observer && typeof observer.disconnect === 'function') {
            observer.disconnect();
            log('Observer disconnected after file removal');

            // включаем отслеживание закрытия формы
            trackFormClosure();
        }
    }

    function clickFilesMore() {
        let replyFormFind = document.querySelectorAll('[id^="divmain_mail_form_crm_act_email_reply"]');
        replyFormFind.forEach(form => {
            form.querySelectorAll('.ui-tile-uploader-item-more')
                .forEach(btn => btn.click());
        });
    }

    function initObserver(doc) {
        if (doc._mailFixObserver) return;
        const observer = new MutationObserver(mutations => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (!node || node.nodeType !== 1) return;

                    if (node.classList.contains('ui-tile-uploader-items') || node.querySelector('.ui-tile-uploader-items')) {
                        clickFilesMore();
                        removeAllFiles(observer);
                    }

                    if (node.tagName === 'IFRAME' && node.classList.contains('side-panel-iframe')) {
                        handleIframe(node);
                    }
                });
            });
        });
        observer.observe(doc.body, { childList: true, subtree: true });
        doc._mailFixObserver = observer;
        log('Start', doc._mailFixObserver);
    }

    function handleIframe(iframe) {
        if (iframe._mailFixInitialized) return;
        function init() {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                if (!doc) return;
                clickFilesMore();
                removeAllFiles(); // для iframe можно не передавать observer
                initObserver(doc);
                iframe._mailFixInitialized = true;
            } catch(e){}
        }
        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
            init();
        } else {
            iframe.addEventListener('load', init);
        }
    }

    function trackFormClosure() {
        function attachObserverToDocument(documentToObserve) {
            if (!documentToObserve) return;
            const observer = new MutationObserver(mutations => {
                mutations.forEach(m => {
                    m.removedNodes.forEach(node => {
                        if (!node || node.nodeType !== 1) return;
                        // если удалена форма ответа
                        // console.log(documentToObserve._mailFixObserver);
                        // console.log('node.matches ', node.matches);
                        // console.log('node.matches-----> ', node.matches('[id^="crm_act_email_reply"]'));
                        // console.log('node.id.startsWith', node.id.startsWith('crm_act_email_reply'));
                        // console.log('node.id', node.id);
                        if (node.matches && node.matches('[id^="crm_act_email_reply"]')) {
                            log('Reply form closed, observer ready');
                            documentToObserve._mailFixObserver = null;
                            initObserver(documentToObserve);
                            observer.disconnect(); // отключаем этот наблюдатель после срабатывания
                        }
                    });
                });
            });
            observer.observe(documentToObserve.body, { childList: true, subtree: true });
        }

        // основной документ
        attachObserverToDocument(document);

        // все iframe на странице
        document.querySelectorAll('iframe.side-panel-iframe, iframe').forEach(iframeEl => {
            try {
                const idoc = iframeEl.contentDocument || (iframeEl.contentWindow && iframeEl.contentWindow.document);
                if (idoc) attachObserverToDocument(idoc);
            } catch(e) {
                // cross-origin игнорируем
            }
        });
    }


    BX.ready(function() {
        clickFilesMore();
        removeAllFiles();
        initObserver(document);
        document.querySelectorAll('iframe.side-panel-iframe').forEach(handleIframe);

        window.clearMailAttachments = function() {
            clickFilesMore();
            removeAllFiles();
            document.querySelectorAll('iframe.side-panel-iframe').forEach(handleIframe);
        };
    });
})();
