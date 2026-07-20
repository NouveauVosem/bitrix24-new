(function () {
    'use strict';

    var OFFER_BTN_ID = 'crystal-offer-btn';
    var INVOICE_BTN_ID = 'crystal-invoice-btn';
    var MODAL_ID     = 'crystal-offer-modal';
    var AJAX_URL     = '/local/ajax/crystal/get_deal_for_offer.php';
    var INVOICE_PDF_URL = '/local/ajax/crystal/get_deal_invoice_pdf.php';

    var LATE_PAYMENT = window.OFFER_LATE_PAYMENT || {};
    var DOC_STRINGS  = window.OFFER_DOC_STRINGS  || {};
    var LANG_ORDER   = ['EN', 'DE', 'RU', 'CZ', 'FR', 'ES', 'PL', 'HU', 'IT', 'EL'];

    var CRYSTAL_BASE = 'https://crystal.alvla.tools';
    var CRYSTAL_KEY  = 'legenda';
    var _regionsCache = null;

    var AlvlaOfferGen = window.AlvlaOfferGen;

    function crystalGet(path) {
        return fetch(CRYSTAL_BASE + path, { headers: { 'X-Api-Key': CRYSTAL_KEY } })
            .then(function (r) { return r.ok ? r.json() : Promise.resolve(null); })
            .catch(function () { return null; });
    }

    crystalGet('/api/semantics/regions').then(function (regions) {
        if (!regions || !Array.isArray(regions)) return;
        _regionsCache = regions
            .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
            .map(function (r) { return REGION_TO_LANG[r.code.toLowerCase()] || r.code.toUpperCase(); })
            .filter(function (code) { return DOC_STRINGS[code]; });
    });

    var SELLERS = {
        'ALVLA, s.r.o.': {
            name:    'ALVLA, s.r.o.',
            ico:     '28168739',
            dic:     'CZ28168739',
            address: 'K zahrádkám 2605/5, Stodůlky (Praha 13), 155 00 Praha',
            country: 'Czech Republic'
        },
        'SAMARIT CZ s.r.o.': {
            name:    'SAMARIT CZ s.r.o.',
            ico:     '22797351',
            dic:     'CZ22797351',
            address: 'Nová kolonie 1451/3, Stodůlky (Praha 13), 155 00 Praha',
            country: 'Czech Republic'
        }
    };

    var DEFAULT_SELLER_KEY = 'ALVLA, s.r.o.';

    function resolveSellerKey(raw) {
        if (!raw) return DEFAULT_SELLER_KEY;
        if (SELLERS[raw]) return raw;
        var lower = String(raw).toLowerCase();
        var keys = Object.keys(SELLERS);
        for (var i = 0; i < keys.length; i++) {
            if (lower.indexOf(keys[i].toLowerCase()) !== -1 || keys[i].toLowerCase().indexOf(lower) !== -1) return keys[i];
        }
        return DEFAULT_SELLER_KEY;
    }

    function normalizeLang(code) {
        var c = String(code || '').toUpperCase().trim();
        return DOC_STRINGS[c] ? c : 'EN';
    }

    // region code (db) → DOC_STRINGS key (кнопка КП)
    var REGION_TO_LANG = { cs: 'CZ' };

    function getDealId() {
        var m = window.location.href.match(/crm\/deal\/details\/(\d+)/);
        return m ? m[1] : null;
    }

    // ===== BUTTON INJECTION =====

    function injectOfferBtn() {
        if (document.getElementById(OFFER_BTN_ID)) return;
        var btns = document.getElementById('cdh-header-btns');
        if (!btns) return;

        var btn = document.createElement('button');
        btn.id    = OFFER_BTN_ID;
        btn.title = 'Сгенерировать Коммерческое Предложение';
        btn.style.cssText = [
            'background:rgba(255,255,255,0.2);',
            'border:1px solid rgba(255,255,255,0.35);',
            'color:#fff;border-radius:3px;',
            'padding:1px 8px;cursor:pointer;',
            'font-size:13px;font-weight:600;line-height:1.4;'
        ].join('');
        btn.textContent = 'КП';
        btn.addEventListener('click', openModal);

        btns.appendChild(btn);
        injectInvoiceBtn(btns);
    }

    function injectInvoiceBtn(container) {
        if (document.getElementById(INVOICE_BTN_ID)) return;
        var dealId = getDealId();
        if (!dealId) return;

        fetch(INVOICE_PDF_URL + '?dealId=' + encodeURIComponent(dealId))
            .then(function (r) { return r.json(); })
            .then(function (resp) {
                if (resp.status !== 'success' || !resp.url) return;
                if (document.getElementById(INVOICE_BTN_ID)) return;

                var btn = document.createElement('a');
                btn.id    = INVOICE_BTN_ID;
                btn.href  = resp.url;
                btn.title = resp.filename || 'Скачать фактуру';
                btn.setAttribute('download', resp.filename || 'invoice.pdf');
                btn.style.cssText = [
                    'background:rgba(255,255,255,0.2);',
                    'border:1px solid rgba(255,255,255,0.35);',
                    'color:#fff;border-radius:3px;',
                    'padding:1px 8px;cursor:pointer;',
                    'font-size:13px;font-weight:600;line-height:1.4;',
                    'text-decoration:none;display:inline-block;'
                ].join('');
                btn.textContent = 'Фактура';

                container.appendChild(btn);
            })
            .catch(function () {});
    }

    // ===== DATA LOADING =====

    function loadDealData(dealId, callback) {
        fetch(AJAX_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:    'dealId=' + encodeURIComponent(dealId)
        })
        .then(function (r) { return r.json(); })
        .then(function (resp) { callback(null, resp); })
        .catch(function (err) { callback(err, null); });
    }

    // ===== DOM ADDRESS READER =====

    function readDeliveryAddressFromDom() {
        function txt(cid) {
            var el = document.querySelector('[data-cid="' + cid + '"] .field-item');
            return el ? el.textContent.trim() : '';
        }
        var street  = txt('UF_CRM_1720604937540');
        var house   = txt('UF_CRM_1720604951910');
        var city    = txt('UF_CRM_1720604913416');
        var zip     = txt('UF_CRM_1720604926030');
        var country = txt('UF_CRM_67BF208ADD735');

        var streetLine = street + (house ? ', ' + house : '');
        var cityLine   = zip ? zip + ' ' + city : city;
        var line = [streetLine, cityLine, country].filter(Boolean).join(', ');

        console.log('[КП] address from DOM:', { street: streetLine, city: city, zip: zip, country: country, line: line });
        return line;
    }

    // ===== MODAL =====

    function openModal() {
        if (document.getElementById(MODAL_ID)) return;
        var dealId = getDealId();
        if (!dealId) { alert('Не удалось определить ID сделки'); return; }

        var overlay = buildOverlay();
        var modal   = buildModalShell(overlay);
        document.body.appendChild(overlay);

        setBodyLoading(modal.body);

        loadDealData(dealId, function (err, resp) {
            if (err || !resp || resp.status !== 'success') {
                setBodyError(modal.body);
                return;
            }

            console.log('[КП] full response:', resp);

            var dealData     = resp.deal;
            var companyData  = resp.company  || {};
            var contactData  = resp.contact  || {};
            var deliveryData = resp.delivery || {};

            var items = resp.items || [];
            console.log('[КП] deal.seller raw:', dealData.seller);
            console.log('[КП] deal.lang:', dealData.lang);
            console.log('[КП] items (' + items.length + '):', items);

            renderForm(modal, dealData, companyData, contactData, deliveryData, items);
        });
    }

    function buildOverlay() {
        var overlay = document.createElement('div');
        overlay.id = MODAL_ID;
        overlay.style.cssText = [
            'position:fixed;top:0;left:0;right:0;bottom:0;',
            'background:rgba(0,0,0,0.45);z-index:99999;',
            'display:flex;align-items:center;justify-content:center;'
        ].join('');
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });
        return overlay;
    }

    function buildModalShell(overlay) {
        var modal = document.createElement('div');
        modal.style.cssText = [
            'background:#f9fafb;border-radius:10px;',
            'width:680px;max-width:96vw;',
            'height:85vh;max-height:85vh;',
            'display:flex;flex-direction:column;',
            'box-shadow:0 8px 40px rgba(0,0,0,0.22);',
            'overflow:hidden;'
        ].join('');

        // Header
        var hdr = document.createElement('div');
        hdr.style.cssText = [
            'display:flex;align-items:center;',
            'padding:16px 22px;',
            'background:#fff;',
            'border-bottom:1px solid #e5e7eb;',
            'flex-shrink:0;'
        ].join('');
        var titleEl = document.createElement('span');
        titleEl.style.cssText = 'font-size:16px;font-weight:700;color:#111827;flex:1;';
        titleEl.textContent = 'Генерация КП';
        var closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'background:#f3f4f6;border:none;border-radius:5px;width:28px;height:28px;cursor:pointer;font-size:16px;color:#6b7280;line-height:1;';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', function () { overlay.remove(); });
        hdr.appendChild(titleEl);
        hdr.appendChild(closeBtn);

        // Body (scrollable)
        var body = document.createElement('div');
        body.style.cssText = 'flex:1;overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column;gap:14px;';

        // Footer (sticky)
        var footer = document.createElement('div');
        footer.style.cssText = [
            'display:flex;align-items:center;justify-content:flex-end;gap:8px;',
            'padding:14px 22px;',
            'background:#fff;',
            'border-top:1px solid #e5e7eb;',
            'flex-shrink:0;'
        ].join('');

        var cancelBtn = makeBtn('Отмена', '#fff', '#374151', '#D1D5DB');
        cancelBtn.addEventListener('click', function () { overlay.remove(); });

        var previewBtn = makeBtn('👁 Предпросмотр', '#f3f4f6', '#374151', '#D1D5DB');
        previewBtn.id = 'offer-preview-btn';

        var generateBtn = makeBtn('Сгенерировать КП →', '#2563EB', '#fff', '#2563EB');
        generateBtn.id = 'offer-generate-btn';
        generateBtn.style.fontWeight = '700';

        footer.appendChild(cancelBtn);
        footer.appendChild(previewBtn);
        footer.appendChild(generateBtn);

        modal.appendChild(hdr);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        return { modal: modal, body: body, footer: footer, previewBtn: previewBtn, generateBtn: generateBtn };
    }

    function makeBtn(label, bg, color, borderColor) {
        var btn = document.createElement('button');
        btn.style.cssText = [
            'padding:8px 16px;border-radius:6px;cursor:pointer;',
            'font-size:13px;font-family:inherit;',
            'background:' + bg + ';color:' + color + ';',
            'border:1px solid ' + borderColor + ';'
        ].join('');
        btn.textContent = label;
        return btn;
    }

    function setBodyLoading(body) {
        body.innerHTML = '<div style="padding:60px;text-align:center;color:#9CA3AF;font-size:14px;">Загрузка данных сделки...</div>';
    }

    function setBodyError(body) {
        body.innerHTML = '<div style="padding:60px;text-align:center;color:#dc2626;font-size:14px;">Ошибка загрузки данных сделки.</div>';
    }

    // ===== FORM RENDERING =====

    function renderForm(modal, deal, company, contact, delivery, rawItems) {
        var body = modal.body;
        body.innerHTML = '';

        var address = readDeliveryAddressFromDom() || delivery.line || company.address || '';
        var lang    = normalizeLang(deal.lang);

        var formState = {
            lang:              lang,
            currency:          deal.currency || 'EUR',
            sellerKey:         resolveSellerKey(deal.seller),
            buyerName:         company.name          || '',
            buyerContact:      contact.name          || '',
            buyerAddress:      address,
            buyerLegalAddress: company.legal_address || '',
            buyerPhone:        company.phone         || '',
            buyerEmail:        company.email         || '',
            buyerVat:          company.vat           || '',
            notes:             '',
            validUntil:        defaultValidUntil(),
            leadTime:          deal.leadTime || '',
            includeSpecs:      true,
            latePayment:       false,
            items: rawItems.map(function (it) {
                return {
                    id:         it.id,
                    name:       it.nameEn || it.name,   // modal display name (EN fallback)
                    nameEn:     it.nameEn  || '',
                    nameCz:     it.nameCz  || '',
                    nameRu:     it.name    || '',
                    article:    it.article || '',
                    bitrixId:   it.bitrixId || null,
                    qty:        it.qty   || 1,
                    price:      it.price || 0,
                    included:   true,
                    specs:      it.specs    || [],
                    physical:   it.physical || null,
                    media:         it.media    || [],
                    mediaSelected: (it.media || []).map(function(_, i) { return i === 0; }),
                    slotSnapshot: it.slotSnapshot || [],
                    components: (it.components || []).map(function (c) {
                        return {
                            name:     c.name     || '',
                            nameEn:   c.nameEn   || c.name || '',
                            nameCz:   c.nameCz   || '',
                            nameRu:   c.name     || '',
                            article:  c.article  || '',
                            baseQty:  c.baseQty  || c.qty || 1,
                            slotName: c.slotName || null
                        };
                    })
                };
            })
        };

        // ── Section 1: Покупатель ────────────────────────────
        body.appendChild(buildSection('ПОКУПАТЕЛЬ', buildBuyerFields(formState)));

        // ── Section 2: Состав заказа ─────────────────────────
        body.appendChild(buildSection('СОСТАВ ЗАКАЗА', buildItemsTable(formState)));

        // ── Section 3: Настройки ─────────────────────────────
        body.appendChild(buildSection('НАСТРОЙКИ', buildSettings(formState)));

        // ── Footer actions ───────────────────────────────────
        modal.previewBtn.onclick = function () {
            var html = AlvlaOfferGen.generateHTML(deal, formState);
            var win = window.open('', '_blank');
            win.document.open();
            win.document.write(html);
            win.document.close();
        };

        modal.generateBtn.onclick = function () {
            var html = AlvlaOfferGen.generateHTML(deal, formState);
            var win = window.open('', '_blank');
            win.document.open();
            win.document.write(html);
            win.document.close();
            setTimeout(function () { win.print(); }, 800);
        };
    }

    function defaultValidUntil() {
        var d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
    }

    function buildSection(label, content) {
        var sec = document.createElement('div');
        sec.style.cssText = 'background:#fff;border-radius:8px;border:1px solid #e5e7eb;';

        var head = document.createElement('div');
        head.style.cssText = 'padding:8px 14px;border-bottom:1px solid #f3f4f6;';
        head.innerHTML = '<span style="font-size:11px;font-weight:700;letter-spacing:0.7px;color:#9CA3AF;">' + label + '</span>';

        sec.appendChild(head);
        sec.appendChild(content);
        return sec;
    }

    function fieldRow(labelText, inputEl) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid #f9fafb;';
        var lbl = document.createElement('span');
        lbl.style.cssText = 'width:90px;flex-shrink:0;font-size:13px;color:#6b7280;';
        lbl.textContent = labelText;
        row.appendChild(lbl);
        row.appendChild(inputEl);
        return row;
    }

    function textInput(value, onChange) {
        var inp = document.createElement('input');
        inp.type  = 'text';
        inp.value = value;
        inp.style.cssText = 'flex:1;padding:6px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;font-family:inherit;color:#111827;background:#f9fafb;outline:none;';
        inp.addEventListener('input', function () { onChange(inp.value); });
        inp.addEventListener('focus', function () { inp.style.borderColor = '#3b82f6'; inp.style.background = '#fff'; });
        inp.addEventListener('blur',  function () { inp.style.borderColor = '#d1d5db'; inp.style.background = '#f9fafb'; });
        return inp;
    }

    function buildBuyerFields(state) {
        var wrap = document.createElement('div');
        wrap.appendChild(fieldRow('Компания',       textInput(state.buyerName,         function (v) { state.buyerName         = v; })));
        if (state.buyerContact) {
            wrap.appendChild(fieldRow('Контакт',    textInput(state.buyerContact,      function (v) { state.buyerContact      = v; })));
        }
        if (state.buyerLegalAddress) {
            wrap.appendChild(fieldRow('Юр. адрес',  textInput(state.buyerLegalAddress, function (v) { state.buyerLegalAddress = v; })));
        }
        wrap.appendChild(fieldRow('Адрес доставки', textInput(state.buyerAddress,      function (v) { state.buyerAddress      = v; })));
        if (state.buyerPhone) {
            wrap.appendChild(fieldRow('Телефон',    textInput(state.buyerPhone,        function (v) { state.buyerPhone        = v; })));
        }
        if (state.buyerEmail) {
            wrap.appendChild(fieldRow('Email',      textInput(state.buyerEmail,        function (v) { state.buyerEmail        = v; })));
        }
        if (state.buyerVat) {
            wrap.appendChild(fieldRow('VAT №',      textInput(state.buyerVat,          function (v) { state.buyerVat          = v; })));
        }
        return wrap;
    }

    function buildItemsTable(state) {
        var wrap = document.createElement('div');

        var thead = document.createElement('div');
        thead.style.cssText = 'display:flex;align-items:center;padding:6px 14px;background:#f3f4f6;gap:0;';
        [['', 24], ['Название', 0], ['Кол-во', 52], ['Цена', 76], ['Сумма', 80]].forEach(function (col) {
            var th = document.createElement('span');
            th.style.cssText = 'font-size:11px;font-weight:700;color:#6b7280;' + (col[1] ? 'width:' + col[1] + 'px;flex-shrink:0;' : 'flex:1;');
            th.textContent = col[0];
            thead.appendChild(th);
        });
        wrap.appendChild(thead);

        state.items.forEach(function (item, idx) {
            wrap.appendChild(buildItemRow(item, idx, state));
            if (item.media && item.media.length) {
                wrap.appendChild(buildItemMediaRow(item));
            }
            (item.components || []).forEach(function (c) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;padding:3px 14px 3px 38px;border-top:1px solid #f3f4f6;'
                    + (item.included ? '' : 'opacity:0.45;');
                var nameEl = document.createElement('span');
                nameEl.style.cssText = 'flex:1;font-size:12px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                nameEl.textContent = '· ' + (c.article ? c.article + '  ' : '') + c.name;
                var qtyEl = document.createElement('span');
                qtyEl.style.cssText = 'font-size:12px;color:#111827;flex-shrink:0;margin-left:8px;';
                qtyEl.textContent = '×' + c.baseQty + '/set';
                row.appendChild(nameEl);
                row.appendChild(qtyEl);
                wrap.appendChild(row);
            });
        });

        return wrap;
    }

    function buildItemRow(item, idx, state) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:0;padding:7px 14px;border-top:1px solid #f3f4f6;' + (item.included ? '' : 'opacity:0.45;');

        var chk = document.createElement('input');
        chk.type    = 'checkbox';
        chk.checked = item.included;
        chk.style.cssText = 'width:16px;height:16px;margin-right:8px;cursor:pointer;accent-color:#2563EB;flex-shrink:0;';
        chk.addEventListener('change', function () {
            item.included = chk.checked;
            row.style.opacity = chk.checked ? '1' : '0.45';
        });

        var nameEl = item.bitrixId ? document.createElement('a') : document.createElement('span');
        if (item.bitrixId) {
            nameEl.href   = '/crm/catalog/14/product/' + item.bitrixId + '/';
            nameEl.target = '_blank';
        }
        nameEl.style.cssText = 'flex:1;font-size:13px;color:' + (item.bitrixId ? '#2563EB' : '#111827') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:8px;text-decoration:none;';
        nameEl.textContent   = item.name;
        nameEl.title         = item.bitrixId ? 'Открыть карточку товара' : item.name;

        var qtyEl = document.createElement('span');
        qtyEl.style.cssText  = 'width:52px;font-size:13px;color:#374151;flex-shrink:0;';
        qtyEl.textContent    = item.qty + ' шт';

        var priceEl = document.createElement('span');
        priceEl.style.cssText = 'width:76px;font-size:13px;color:#374151;flex-shrink:0;';
        priceEl.textContent   = AlvlaOfferGen.formatMoney(item.price) + ' ' + (state.currency || 'EUR');

        var totalEl = document.createElement('span');
        totalEl.style.cssText = 'width:80px;font-size:13px;font-weight:600;color:#111827;flex-shrink:0;text-align:right;';
        totalEl.textContent   = AlvlaOfferGen.formatMoney(item.price * item.qty) + ' ' + (state.currency || 'EUR');
        totalEl.setAttribute('data-offer-total-' + idx, '1');

        row.appendChild(chk);
        row.appendChild(nameEl);
        row.appendChild(qtyEl);
        row.appendChild(priceEl);
        row.appendChild(totalEl);
        return row;
    }

    function buildItemMediaRow(item) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 14px 7px 38px;border-top:1px solid #f3f4f6;background:#f9fafb;';

        var lbl = document.createElement('span');
        lbl.style.cssText = 'font-size:11px;color:#9ca3af;flex-shrink:0;';
        lbl.textContent = 'Фото:';
        row.appendChild(lbl);

        var thumbsWrap = document.createElement('div');
        thumbsWrap.style.cssText = 'display:flex;gap:5px;';

        item.media.forEach(function(url, i) {
            var thumb = document.createElement('div');
            thumb.style.cssText = 'position:relative;cursor:pointer;border-radius:4px;overflow:hidden;flex-shrink:0;'
                + 'border:2px solid ' + (item.mediaSelected[i] ? '#2563EB' : '#d1d5db') + ';';
            thumb.title = item.mediaSelected[i] ? 'Включено в КП' : 'Не включено';

            var img = document.createElement('img');
            img.src = url;
            img.style.cssText = 'width:50px;height:50px;object-fit:cover;display:block;'
                + 'opacity:' + (item.mediaSelected[i] ? '1' : '0.3') + ';';
            thumb.appendChild(img);

            var dot = document.createElement('div');
            dot.style.cssText = 'position:absolute;bottom:2px;right:2px;width:14px;height:14px;border-radius:50%;'
                + 'display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;line-height:1;'
                + 'background:' + (item.mediaSelected[i] ? '#2563EB' : '#9ca3af') + ';'
                + 'opacity:' + (item.mediaSelected[i] ? '1' : '0.5') + ';';
            dot.textContent = '✓';
            thumb.appendChild(dot);

            thumb.addEventListener('click', function() {
                item.mediaSelected[i] = !item.mediaSelected[i];
                var sel = item.mediaSelected[i];
                thumb.style.borderColor = sel ? '#2563EB' : '#d1d5db';
                img.style.opacity       = sel ? '1' : '0.3';
                dot.style.background    = sel ? '#2563EB' : '#9ca3af';
                dot.style.opacity       = sel ? '1' : '0.5';
                thumb.title             = sel ? 'Включено в КП' : 'Не включено';
            });

            thumbsWrap.appendChild(thumb);
        });

        row.appendChild(thumbsWrap);
        return row;
    }

    function buildSettings(state) {
        var wrap = document.createElement('div');

        // ── Language selector ────────────────────────────────
        var langRow = document.createElement('div');
        langRow.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid #f9fafb;';
        var langLbl = document.createElement('span');
        langLbl.style.cssText = 'width:90px;flex-shrink:0;font-size:13px;color:#6b7280;';
        langLbl.textContent = 'Язык КП';
        var langBtns = document.createElement('div');
        langBtns.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';

        function styleLangBtn(b, active) {
            b.style.background  = active ? '#2563EB' : '#f9fafb';
            b.style.color       = active ? '#fff'    : '#374151';
            b.style.borderColor = active ? '#2563EB' : '#d1d5db';
            b.style.fontWeight  = active ? '600'     : '400';
        }

        (_regionsCache || LANG_ORDER.filter(function (l) { return DOC_STRINGS[l]; })).forEach(function (lang) {
            var btn = document.createElement('button');
            btn.style.cssText = 'padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid #d1d5db;font-family:inherit;';
            btn.textContent   = lang;
            btn.dataset.lang  = lang;
            styleLangBtn(btn, state.lang === lang);
            btn.addEventListener('click', function () {
                state.lang = lang;
                langBtns.querySelectorAll('button').forEach(function (b) {
                    styleLangBtn(b, b.dataset.lang === lang);
                });
            });
            langBtns.appendChild(btn);
        });

        langRow.appendChild(langLbl);
        langRow.appendChild(langBtns);
        wrap.appendChild(langRow);

        // ── Seller selector ──────────────────────────────────
        var sellerRow = document.createElement('div');
        sellerRow.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid #f9fafb;';
        var sellerLbl = document.createElement('span');
        sellerLbl.style.cssText = 'width:90px;flex-shrink:0;font-size:13px;color:#6b7280;';
        sellerLbl.textContent = 'Продавец';
        var sellerBtns = document.createElement('div');
        sellerBtns.style.cssText = 'display:flex;gap:6px;';
        function styleSellerBtn(b, active) {
            b.style.background  = active ? '#2563EB' : '#f9fafb';
            b.style.color       = active ? '#fff'    : '#374151';
            b.style.borderColor = active ? '#2563EB' : '#d1d5db';
            b.style.fontWeight  = active ? '600'     : '400';
        }
        Object.keys(SELLERS).forEach(function (key) {
            var btn = document.createElement('button');
            btn.style.cssText = 'padding:4px 10px;border-radius:5px;font-size:12px;cursor:pointer;border:1px solid #d1d5db;font-family:inherit;transition:background 0.1s;';
            btn.textContent    = SELLERS[key].name;
            btn.dataset.seller = key;
            styleSellerBtn(btn, state.sellerKey === key);
            btn.addEventListener('click', function () {
                state.sellerKey = key;
                sellerBtns.querySelectorAll('button').forEach(function (b) {
                    styleSellerBtn(b, b.dataset.seller === key);
                });
            });
            sellerBtns.appendChild(btn);
        });
        sellerRow.appendChild(sellerLbl);
        sellerRow.appendChild(sellerBtns);
        wrap.appendChild(sellerRow);

        // ── Valid until ──────────────────────────────────────
        var dateInp = document.createElement('input');
        dateInp.type  = 'date';
        dateInp.value = state.validUntil;
        dateInp.style.cssText = 'padding:6px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;font-family:inherit;color:#111827;background:#f9fafb;';
        dateInp.addEventListener('change', function () { state.validUntil = dateInp.value; });
        wrap.appendChild(fieldRow('Действительно до', dateInp));

        // ── Technical Specifications toggle ──────────────────
        var hasSpecs = state.items.some(function (it) { return it.specs && it.specs.length; });
        if (hasSpecs) {
            var specsToggleRow = document.createElement('div');
            specsToggleRow.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid #f9fafb;';
            var specsToggleLbl = document.createElement('label');
            specsToggleLbl.style.cssText = 'flex:1;font-size:13px;color:#374151;cursor:pointer;display:flex;align-items:center;gap:8px;';
            var specsChk = document.createElement('input');
            specsChk.type = 'checkbox';
            specsChk.checked = state.includeSpecs;
            specsChk.style.cssText = 'width:15px;height:15px;accent-color:#2563EB;cursor:pointer;flex-shrink:0;';
            specsChk.addEventListener('change', function () { state.includeSpecs = specsChk.checked; });
            specsToggleLbl.appendChild(specsChk);
            specsToggleLbl.appendChild(document.createTextNode('Технические характеристики'));
            specsToggleRow.appendChild(specsToggleLbl);
            wrap.appendChild(specsToggleRow);
        }

        // ── Notes ────────────────────────────────────────────
        var noteRow = document.createElement('div');
        noteRow.style.cssText = 'display:flex;align-items:flex-start;gap:12px;padding:8px 14px;';
        var noteLbl = document.createElement('span');
        noteLbl.style.cssText = 'width:90px;flex-shrink:0;font-size:13px;color:#6b7280;padding-top:6px;';
        noteLbl.textContent = 'Примечание';
        var noteArea = document.createElement('textarea');
        noteArea.style.cssText = 'flex:1;padding:6px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;font-family:inherit;color:#111827;background:#f9fafb;resize:vertical;min-height:54px;outline:none;';
        noteArea.placeholder = 'Условия оплаты, сроки изготовления, прочее...';
        noteArea.addEventListener('input', function () { state.notes = noteArea.value; });
        noteRow.appendChild(noteLbl);
        noteRow.appendChild(noteArea);
        wrap.appendChild(noteRow);

        // ── Late Payment Clause ──────────────────────────────
        var lpRow = document.createElement('div');
        lpRow.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 14px;border-top:1px solid #f9fafb;';

        var lpLabel = document.createElement('label');
        lpLabel.style.cssText = 'font-size:13px;color:#374151;cursor:pointer;display:flex;align-items:center;gap:8px;';
        var lpChk = document.createElement('input');
        lpChk.type    = 'checkbox';
        lpChk.checked = state.latePayment;
        lpChk.style.cssText = 'width:15px;height:15px;accent-color:#2563EB;cursor:pointer;flex-shrink:0;';
        lpChk.addEventListener('change', function () { state.latePayment = lpChk.checked; });
        lpLabel.appendChild(lpChk);
        lpLabel.appendChild(document.createTextNode('Late Payment Clause'));
        lpRow.appendChild(lpLabel);

        wrap.appendChild(lpRow);

        return wrap;
    }

    // ===== INIT =====

    BX.ready(function () {
        if (!window.location.href.match(/crm\/deal\/details\/(\d+)/)) return;

        var observer = new MutationObserver(function () { injectOfferBtn(); });
        observer.observe(document.body, { childList: true, subtree: true });
        injectOfferBtn();
    });

})();
