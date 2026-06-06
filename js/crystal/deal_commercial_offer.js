(function () {
    'use strict';

    var OFFER_BTN_ID = 'crystal-offer-btn';
    var MODAL_ID     = 'crystal-offer-modal';
    var AJAX_URL     = '/local/ajax/crystal/get_deal_for_offer.php';
    var LOGO_URL     = '/local/images/alvla-clear-820px-01.png';

    var LATE_PAYMENT = {
        EN: {
            title: 'Late Payment Clause',
            text:  'In case of payment delay exceeding 20 working days, the Buyer is obliged, in accordance with EU Directive 2011/7/EU, to pay late interest at the base rate of the European Central Bank plus 8 percentage points per annum, calculated daily from the due date until the date of actual payment. Additionally, the Buyer must pay a fixed compensation of 40 EUR to cover debt collection costs.'
        },
        RU: {
            title: 'Условие о просрочке платежа',
            text:  'В случае нарушения сроков оплаты более чем на 20 рабочих дней, Покупатель обязан в соответствии с Директивой ЕС 2011/7/EU уплатить проценты за просрочку в размере базовой ставки Европейского Центрального Банка плюс 8 процентных пунктов годовых, начисляемых ежедневно с даты наступления просрочки до даты фактической оплаты. Дополнительно, Покупатель обязан оплатить фиксированную компенсацию в размере 40 EUR в счёт покрытия расходов по взысканию долга.'
        },
        DE: {
            title: 'Klausel zum Zahlungsverzug',
            text:  'Bei Zahlungsverzug von mehr als 20 Werktagen ist der Käufer verpflichtet, gemäß EU-Richtlinie 2011/7/EU Verzugszinsen in Höhe des Basiszinssatzes der Europäischen Zentralbank zuzüglich 8 Prozentpunkte Jahreszinsen zu zahlen, die täglich ab dem Tag des Verzugs bis zum Tag der tatsächlichen Zahlung berechnet werden. Darüber hinaus ist der Käufer verpflichtet, eine pauschale Entschädigung in Höhe von 40 EUR zur Deckung der Inkassokosten zu zahlen.'
        },
        FR: {
            title: 'Clause de retard de paiement',
            text:  "En cas de retard du paiement de plus de 20 jours ouvrables, l'Acheteur est tenu, conformément à la Directive UE 2011/7/UE, de payer des intérêts de retard à hauteur du taux de base de la Banque Centrale Européenne majoré de 8 points de pourcentage par an, calculés quotidiennement à compter de la date du retard jusqu'à la date du paiement effectif. En outre, l'acheteur est tenu de payer une indemnité forfaitaire de 40 EUR pour couvrir les frais de recouvrement des créances."
        },
        ES: {
            title: 'Cláusula de mora en el pago',
            text:  'En caso de incumplimiento de los plazos de pago por más de 20 días hábiles, el Comprador estará obligado, de conformidad con la Directiva de la UE 2011/7/UE, a abonar intereses de demora equivalentes al tipo de interés básico del Banco Central Europeo más 8 puntos porcentuales anuales, calculados diariamente desde la fecha de vencimiento hasta la fecha del pago efectivo.'
        },
        PL: {
            title: 'Klauzula o opóźnieniu płatności',
            text:  'W przypadku opóźnienia w płatności przekraczającego 20 dni roboczych, Kupujący zobowiązany jest, zgodnie z Dyrektywą UE 2011/7/UE, do zapłaty odsetek za zwłokę w wysokości stopy bazowej Europejskiego Banku Centralnego powiększonej o 8 punktów procentowych rocznie, naliczanych codziennie od dnia opóźnienia do dnia faktycznej zapłaty. Dodatkowo Kupujący zobowiązany jest do zapłaty kwoty w wysokości 40 EUR na pokrycie kosztów windykacji.'
        },
        CS: {
            title: 'Doložka o prodlení s platbou',
            text:  'V případě prodlení s platbou delším než 20 pracovních dnů je Kupující povinen podle Směrnice EU 2011/7/EU zaplatit úroky z prodlení ve výši základní sazby Evropské centrální banky zvýšené o 8 procentních bodů ročně, počítané denně od data vzniku prodlení až do data skutečné úhrady. Kromě toho je Kupující povinen uhradit pevnou náhradu ve výši 40 EUR na pokrytí nákladů spojených s vymáháním pohledávky.'
        },
        HU: {
            title: 'Késedelmes fizetésre vonatkozó záradék',
            text:  'Ha a fizetési határidő több mint 20 munkanappal túllépődik, a Vevő köteles az EU 2011/7/EU irányelvnek megfelelően késedelmi kamatot fizetni az Európai Központi Bank alapkamatának plusz 8 százalékponttal növelt mértékében, amelyet naponta számítanak fel a késedelem bekövetkezésének napjától a tényleges fizetés napjáig. Ezen felül a Vevő köteles 40 euró összegű fix kártérítést fizetni a követelés behajtásával kapcsolatos költségek fedezésére.'
        },
        IT: {
            title: 'Clausola di ritardo nel pagamento',
            text:  "In caso di ritardo nel pagamento superiore a 20 giorni lavorativi, l'Acquirente è tenuto, conformemente alla Direttiva UE 2011/7/UE, a pagare gli interessi di mora pari al tasso base della Banca Centrale Europea più 8 punti percentuali annui, calcolati giornalmente dalla data di scadenza del pagamento fino alla data effettiva di saldo. Inoltre, l'Acquirente è obbligato a corrispondere un'indennità forfettaria di 40 EUR a copertura delle spese di recupero crediti."
        },
        EL: {
            title: 'Ρήτρα καθυστέρησης πληρωμής',
            text:  'Σε περίπτωση καθυστέρησης πληρωμής άνω των 20 εργάσιμων ημερών, ο Αγοραστής υποχρεούται, σύμφωνα με την Οδηγία 2011/7/ΕΕ, να καταβάλει τόκους καθυστέρησης ισοδύναμους με το βασικό επιτόκιο της Ευρωπαϊκής Κεντρικής Τράπεζας συν 8 ετήσια ποσοστιαία μονάδα, υπολογιζόμενους ημερησίως από την ημερομηνία λήξης μέχρι την ημερομηνία πραγματικής πληρωμής. Επιπλέον, ο Αγοραστής οφείλει να πληρώσει σταθερή αποζημίωση ύψους 40 ΕΥΡΩ για την κάλυψη δαπανών είσπραξης.'
        }
    };

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

        // DOM is the reliable source for delivery address
        var address = readDeliveryAddressFromDom() || delivery.line || company.address || '';

        var formState = {
            sellerKey:         resolveSellerKey(deal.seller),
            buyerName:         company.name          || '',
            buyerContact:      contact.name          || '',
            buyerAddress:      address,
            buyerLegalAddress: company.legal_address || '',
            buyerPhone:        company.phone         || '',
            buyerEmail:        company.email         || '',
            buyerVat:          company.vat           || '',
            notes:           '',
            validUntil:      defaultValidUntil(),
            includeSpecs:    true,
            latePayment:     false,
            latePaymentLang: (deal.lang && LATE_PAYMENT[deal.lang]) ? deal.lang : 'EN',
            items:        rawItems.map(function (it) {
                return {
                    id:         it.id,
                    name:       it.nameEn || it.name,
                    nameFull:   it.name,
                    article:    it.article || '',
                    bitrixId:   it.bitrixId || null,
                    qty:        it.qty   || 1,
                    price:      it.price || 0,
                    included:   true,
                    specs:      it.specs    || [],
                    physical:   it.physical || null,
                    components: (it.components || []).map(function (c) {
                        return {
                            name:    c.name    || '',
                            nameEn:  c.nameEn  || c.name || '',
                            article: c.article || '',
                            baseQty: c.baseQty || c.qty || 1
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
            var html = generateHTML(deal, formState);
            var win = window.open('', '_blank');
            win.document.open();
            win.document.write(html);
            win.document.close();
        };

        modal.generateBtn.onclick = function () {
            var html = generateHTML(deal, formState);
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

        // Table head
        var thead = document.createElement('div');
        thead.style.cssText = 'display:flex;align-items:center;padding:6px 14px;background:#f3f4f6;gap:0;';
        [['', 24], ['Название', 0], ['Кол-во', 52], ['Цена', 76], ['Сумма', 80]].forEach(function (col) {
            var th = document.createElement('span');
            th.style.cssText = 'font-size:11px;font-weight:700;color:#6b7280;' + (col[1] ? 'width:' + col[1] + 'px;flex-shrink:0;' : 'flex:1;');
            th.textContent = col[0];
            thead.appendChild(th);
        });
        wrap.appendChild(thead);

        // Rows
        state.items.forEach(function (item, idx) {
            wrap.appendChild(buildItemRow(item, idx, state));
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

        // Checkbox
        var chk = document.createElement('input');
        chk.type    = 'checkbox';
        chk.checked = item.included;
        chk.style.cssText = 'width:16px;height:16px;margin-right:8px;cursor:pointer;accent-color:#2563EB;flex-shrink:0;';
        chk.addEventListener('change', function () {
            item.included = chk.checked;
            row.style.opacity = chk.checked ? '1' : '0.45';
            updateTotals(state);
        });

        // Name
        var nameEl = item.bitrixId ? document.createElement('a') : document.createElement('span');
        if (item.bitrixId) {
            nameEl.href   = '/crm/catalog/14/product/' + item.bitrixId + '/';
            nameEl.target = '_blank';
        }
        nameEl.style.cssText = 'flex:1;font-size:13px;color:' + (item.bitrixId ? '#2563EB' : '#111827') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:8px;text-decoration:none;';
        nameEl.textContent   = item.name;
        nameEl.title         = item.bitrixId ? 'Открыть карточку товара' : item.name;

        // Qty
        var qtyEl = document.createElement('span');
        qtyEl.style.cssText  = 'width:52px;font-size:13px;color:#374151;flex-shrink:0;';
        qtyEl.textContent    = item.qty + ' шт';

        // Price
        var priceEl = document.createElement('span');
        priceEl.style.cssText = 'width:76px;font-size:13px;color:#374151;flex-shrink:0;';
        priceEl.textContent   = formatMoney(item.price);

        // Total
        var totalEl = document.createElement('span');
        totalEl.style.cssText = 'width:80px;font-size:13px;font-weight:600;color:#111827;flex-shrink:0;text-align:right;';
        totalEl.textContent   = formatMoney(item.price * item.qty);
        totalEl.setAttribute('data-offer-total-' + idx, '1');

        row.appendChild(chk);
        row.appendChild(nameEl);
        row.appendChild(qtyEl);
        row.appendChild(priceEl);
        row.appendChild(totalEl);
        return row;
    }

    function updateTotals() {
        // totals are recalculated at generation time; row subtotals are static display
    }

    function buildSettings(state) {
        var wrap = document.createElement('div');

        // Seller selector
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

        // Valid until
        var dateInp = document.createElement('input');
        dateInp.type  = 'date';
        dateInp.value = state.validUntil;
        dateInp.style.cssText = 'padding:6px 10px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;font-family:inherit;color:#111827;background:#f9fafb;';
        dateInp.addEventListener('change', function () { state.validUntil = dateInp.value; });
        wrap.appendChild(fieldRow('Действительно до', dateInp));

        // Include Technical Specifications toggle
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
            specsToggleLbl.appendChild(document.createTextNode('Technical Specifications'));
            specsToggleRow.appendChild(specsToggleLbl);
            wrap.appendChild(specsToggleRow);
        }

        // Notes
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

        // Late Payment Clause toggle + language selector
        var lpRow = document.createElement('div');
        lpRow.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 14px;border-top:1px solid #f9fafb;flex-wrap:wrap;';

        var lpLabel = document.createElement('label');
        lpLabel.style.cssText = 'font-size:13px;color:#374151;cursor:pointer;display:flex;align-items:center;gap:8px;flex-shrink:0;';
        var lpChk = document.createElement('input');
        lpChk.type    = 'checkbox';
        lpChk.checked = state.latePayment;
        lpChk.style.cssText = 'width:15px;height:15px;accent-color:#2563EB;cursor:pointer;flex-shrink:0;';
        lpLabel.appendChild(lpChk);
        lpLabel.appendChild(document.createTextNode('Late Payment Clause'));
        lpRow.appendChild(lpLabel);

        var lpLangSel = document.createElement('select');
        lpLangSel.style.cssText = 'padding:4px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;font-family:inherit;color:#374151;background:#f9fafb;cursor:pointer;';
        Object.keys(LATE_PAYMENT).forEach(function (lang) {
            var opt = document.createElement('option');
            opt.value       = lang;
            opt.textContent = lang;
            opt.selected    = lang === state.latePaymentLang;
            lpLangSel.appendChild(opt);
        });
        lpLangSel.style.display = state.latePayment ? '' : 'none';
        lpRow.appendChild(lpLangSel);

        lpChk.addEventListener('change', function () {
            state.latePayment         = lpChk.checked;
            lpLangSel.style.display   = lpChk.checked ? '' : 'none';
        });
        lpLangSel.addEventListener('change', function () { state.latePaymentLang = lpLangSel.value; });

        wrap.appendChild(lpRow);

        return wrap;
    }

    // ===== HTML GENERATOR =====

    function buildLatePaymentHtml(state) {
        if (!state.latePayment) return '';
        var lp = LATE_PAYMENT[state.latePaymentLang] || LATE_PAYMENT['EN'];
        return '<div style="margin-top:20px;page-break-inside:avoid;">'
            + '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;'
            + 'color:#9ca3af;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">'
            + esc(lp.title) + '</div>'
            + '<p style="font-size:8.5pt;color:#374151;line-height:1.55;">' + esc(lp.text) + '</p>'
            + '</div>';
    }

    function buildSpecsHtml(includedItems, state) {
        if (!state.includeSpecs) return '';
        var itemsWithData = includedItems.filter(function (it) {
            return (it.specs && it.specs.length) || it.physical;
        });
        if (!itemsWithData.length) return '';

        var html = '<div style="margin-top:28px;page-break-inside:avoid;">';
        html += '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;'
              + 'color:#9ca3af;margin-bottom:14px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">'
              + 'Technical Specifications</div>';

        var labelTd = 'padding:2px 14px 2px 0;font-size:8.5pt;color:#6b7280;width:46%;vertical-align:top;';
        var valueTd = 'padding:2px 0;font-size:8.5pt;color:#1f2937;font-weight:500;';

        function dimStr(d) {
            var parts = [];
            if (d.width)  parts.push(d.width);
            if (d.depth)  parts.push(d.depth);
            if (d.height) parts.push(d.height);
            return parts.length ? parts.join(' × ') + ' mm' : '';
        }

        itemsWithData.forEach(function (it) {
            var itemNo = includedItems.indexOf(it) + 1;
            html += '<div style="margin-bottom:16px;page-break-inside:avoid;">';
            html += '<div style="font-size:9.5pt;font-weight:700;color:#1e40af;margin-bottom:6px;">'
                  + itemNo + '. ' + esc(it.name) + '</div>';
            html += '<table style="width:56%;border-collapse:collapse;">';

            // Technical specs rows
            (it.specs || []).forEach(function (spec) {
                html += '<tr>'
                    + '<td style="' + labelTd + '">' + esc(spec.label) + '</td>'
                    + '<td style="' + valueTd + '">' + esc(spec.value) + '</td>'
                    + '</tr>';
            });

            // Physical params rows
            var phys = it.physical;
            if (phys) {
                var physRows = '';
                if (phys.dimensions) {
                    var ext = phys.dimensions.external;
                    var inn = phys.dimensions.internal;
                    if (ext) { var s = dimStr(ext); if (s) physRows += '<tr><td style="' + labelTd + '">External dimensions (W×D×H)</td><td style="' + valueTd + '">' + s + '</td></tr>'; }
                    if (inn) { var s = dimStr(inn); if (s) physRows += '<tr><td style="' + labelTd + '">Internal dimensions (W×D×H)</td><td style="' + valueTd + '">' + s + '</td></tr>'; }
                }
                if (phys.weight !== null && phys.weight !== undefined) {
                    physRows += '<tr><td style="' + labelTd + '">Net weight</td><td style="' + valueTd + '">' + phys.weight + ' kg</td></tr>';
                }
                if (physRows) {
                    if (it.specs && it.specs.length) {
                        html += '<tr><td colspan="2" style="padding:5px 0 3px;font-size:8pt;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.4px;">Physical Parameters</td></tr>';
                    }
                    html += physRows;
                }
            }

            html += '</table></div>';
        });

        html += '</div>';
        return html;
    }

    function formatMoney(val) {
        var n = parseFloat(val) || 0;
        return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    function formatDateDisplay(iso) {
        if (!iso) return '';
        var parts = iso.split('-');
        return parts.length === 3 ? parts[2] + '.' + parts[1] + '.' + parts[0] : iso;
    }

    function todayDisplay() {
        return formatDateDisplay(new Date().toISOString().slice(0, 10));
    }

    function generateHTML(deal, state) {
        var seller = SELLERS[state.sellerKey] || SELLERS[DEFAULT_SELLER_KEY];
        var includedItems = state.items.filter(function (it) { return it.included; });
        var currency      = deal.currency || 'EUR';

        var subtotal = 0;
        includedItems.forEach(function (it) { subtotal += (it.price || 0) * (it.qty || 1); });

        var rowsHtml = includedItems.map(function (it, i) {
            var total = (it.price || 0) * (it.qty || 1);
            var bg    = i % 2 === 1 ? '#f9fafb' : '#fff';
            var compRows = (it.components || []).map(function (c) {
                return [
                    '<tr style="background:' + bg + ';">',
                    '<td style="' + tdStyle('center') + 'border-top:none;"></td>',
                    '<td style="' + tdStyle('left') + 'border-top:none;padding-left:22px;font-size:9pt;" colspan="5">',
                    '&middot;&nbsp;',
                    (c.article ? '<span style="font-weight:600;margin-right:6px;">' + esc(c.article) + '</span>' : ''),
                    esc(c.nameEn || c.name),
                    '&nbsp;&nbsp;&times;' + c.baseQty + '/set',
                    '</td>',
                    '</tr>'
                ].join('');
            }).join('');
            return [
                '<tr style="background:' + bg + ';">',
                '<td style="' + tdStyle('center') + '">' + (i + 1) + '</td>',
                '<td style="' + tdStyle('left') + '">'
                    + (it.article ? '<span style="font-size:9pt;color:#9ca3af;margin-right:6px;">' + esc(it.article) + '</span>' : '')
                    + esc(it.name) + '</td>',
                '<td style="' + tdStyle('center') + '">' + it.qty + '</td>',
                '<td style="' + tdStyle('right') + '">' + formatMoney(it.price) + '</td>',
                '<td style="' + tdStyle('center') + '">0%</td>',
                '<td style="' + tdStyle('right') + 'font-weight:600;">' + formatMoney(total) + '</td>',
                '</tr>',
                compRows
            ].join('');
        }).join('');

        var vatNote = '<p style="font-size:8.5pt;color:#6b7280;margin:4px 0 0;">VAT 0% &ndash; Reverse charge mechanism applies (Article 196, Council Directive 2006/112/EC)</p>';

        var notesHtml = state.notes
            ? '<div style="margin-top:20px;padding:12px 14px;background:#f9fafb;border-left:3px solid #2563EB;border-radius:3px;font-size:9.5pt;color:#374151;">' + esc(state.notes).replace(/\n/g, '<br>') + '</div>'
            : '';

        var vatRow = state.buyerVat
            ? '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">VAT No.: </span>' + esc(state.buyerVat) + '</p>'
            : '';

        return '<!DOCTYPE html>\n<html lang="en">\n<head>\n'
            + '<meta charset="UTF-8">\n'
            + '<title>Commercial Offer — ' + esc(state.buyerName || deal.title) + '</title>\n'
            + '<style>\n'
            + '* { box-sizing: border-box; margin: 0; padding: 0; }\n'
            + 'body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #1f2937; background: #fff; }\n'
            + '@page { size: A4; margin: 14mm 14mm 18mm 14mm; }\n'
            + '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } }\n'
            + '.page { max-width: 760px; margin: 0 auto; padding: 20px 0; }\n'
            + 'table { border-collapse: collapse; width: 100%; }\n'
            + '</style>\n</head>\n<body>\n<div class="page">\n'

            // Print button (hidden on print)
            + '<div class="no-print" style="text-align:right;margin-bottom:16px;">'
            + '<button onclick="window.print()" style="padding:8px 20px;background:#2563EB;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:700;">Печать / Сохранить PDF</button>'
            + '</div>\n'

            // Header
            + '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #1e40af;margin-bottom:20px;">\n'
            + '<img src="' + LOGO_URL + '" alt="ALVLA" style="max-height:52px;max-width:160px;">\n'
            + '<div style="text-align:right;">'
            + '<div style="font-size:18pt;font-weight:700;color:#1e40af;letter-spacing:-0.5px;">Commercial Offer</div>'
            + '<div style="font-size:10pt;color:#6b7280;margin-top:4px;">No. CO-' + String(deal.id).padStart(4, '0') + '&nbsp;&nbsp;&middot;&nbsp;&nbsp;' + todayDisplay() + '</div>'
            + '<div style="font-size:10pt;color:#6b7280;margin-top:2px;">Valid until: ' + formatDateDisplay(state.validUntil) + '</div>'
            + '</div>\n</div>\n'

            // Parties
            + '<div style="display:flex;gap:30px;margin-bottom:22px;">\n'
            + '<div style="flex:1;">'
            + '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-bottom:7px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">Seller</div>'
            + '<p style="font-weight:700;font-size:10pt;margin-bottom:4px;">' + esc(seller.name) + '</p>'
            + '<p style="margin:3px 0;font-size:10pt;color:#374151;">' + esc(seller.address) + '</p>'
            + '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">IČO: </span>' + seller.ico + '</p>'
            + '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">DIČ: </span>' + seller.dic + '</p>'
            + '</div>\n'
            + '<div style="flex:1;">'
            + '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-bottom:7px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">Buyer</div>'
            + '<p style="font-weight:700;font-size:10pt;margin-bottom:4px;">' + esc(state.buyerName) + '</p>'
            + (state.buyerContact      ? '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">Attn.: </span>' + esc(state.buyerContact) + '</p>' : '')
            + (state.buyerLegalAddress ? '<p style="margin:3px 0;font-size:10pt;color:#374151;">' + esc(state.buyerLegalAddress) + '</p>' : '')
            + (state.buyerAddress && state.buyerAddress !== state.buyerLegalAddress ? '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">Delivery: </span>' + esc(state.buyerAddress) + '</p>' : '')
            + (state.buyerPhone        ? '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">Tel.: </span>' + esc(state.buyerPhone) + '</p>' : '')
            + (state.buyerEmail        ? '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">Email: </span>' + esc(state.buyerEmail) + '</p>' : '')
            + vatRow
            + '</div>\n</div>\n'

            // Table
            + '<table>\n'
            + '<thead>\n<tr style="background:#1e40af;">\n'
            + thCell('No.',         'center', '34px')
            + thCell('Description', 'left',   '')
            + thCell('Qty',         'center', '48px')
            + thCell('Unit Price',  'right',  '90px')
            + thCell('VAT',         'center', '48px')
            + thCell('Total',       'right',  '90px')
            + '</tr>\n</thead>\n<tbody>\n'
            + rowsHtml
            + '</tbody>\n</table>\n'

            // Totals
            + '<div style="display:flex;justify-content:flex-end;margin-top:12px;">\n'
            + '<table style="width:320px;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;">\n'
            + '<tr><td style="padding:7px 12px;font-size:10pt;border-bottom:1px solid #e5e7eb;">Subtotal (excl. VAT)</td>'
            + '<td style="padding:7px 12px;font-size:10pt;text-align:right;font-weight:600;border-bottom:1px solid #e5e7eb;">' + formatMoney(subtotal) + ' ' + currency + '</td></tr>\n'
            + '<tr><td style="padding:7px 12px;font-size:10pt;color:#6b7280;border-bottom:1px solid #e5e7eb;">VAT (0%)</td>'
            + '<td style="padding:7px 12px;font-size:10pt;text-align:right;color:#6b7280;border-bottom:1px solid #e5e7eb;">0.00 ' + currency + '</td></tr>\n'
            + '<tr style="background:#1e40af;"><td style="padding:9px 12px;font-size:11pt;font-weight:700;color:#fff;">TOTAL</td>'
            + '<td style="padding:9px 12px;font-size:11pt;font-weight:700;color:#fff;text-align:right;">' + formatMoney(subtotal) + ' ' + currency + '</td></tr>\n'
            + '</table>\n</div>\n'

            + vatNote
            + notesHtml
            + buildLatePaymentHtml(state)
            + buildSpecsHtml(includedItems, state)

            // Footer
            + '<div style="margin-top:30px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">'
            + '<span style="font-size:8.5pt;color:#9ca3af;">' + esc(seller.name) + ' &nbsp;&middot;&nbsp; ' + esc(seller.address) + '</span>'
            + '<img src="' + LOGO_URL + '" alt="ALVLA" style="max-height:24px;opacity:0.5;">'
            + '</div>\n'

            + '</div>\n</body>\n</html>';
    }

    function thCell(label, align, width) {
        return '<th style="padding:8px 10px;font-size:9pt;font-weight:700;color:#fff;text-align:' + align + ';'
            + (width ? 'width:' + width + ';' : '') + '">' + label + '</th>\n';
    }

    function tdStyle(align) {
        return 'padding:7px 10px;font-size:10pt;vertical-align:middle;border-bottom:1px solid #e5e7eb;text-align:' + align + ';';
    }

    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ===== INIT =====

    BX.ready(function () {
        if (!window.location.href.match(/crm\/deal\/details\/(\d+)/)) return;

        var observer = new MutationObserver(function () { injectOfferBtn(); });
        observer.observe(document.body, { childList: true, subtree: true });
        injectOfferBtn();
    });

})();
