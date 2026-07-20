BX.ready(function () {

    var url = window.location.href;
    if (!url.match(/crm\/deal\/details\/(\d+)/)) {
        return;
    }

    var BTN_ID = 'crystal-letter-btn';

    // Погрузка — фиксированный склад-отправитель для запросов на перевозку крупных грузов.
    var PICKUP = {
        company: 'SAMARIT CZ s.r.o.',
        street: 'Dubská 769',
        zipCity: '272 03 Kladno',
        contactName: 'Vladimír',
        contactPhone: '+420 775 741 800'
    };

    var SIGNATURE = { name: 'Pavlo Bilan', phone: 'mob.773030940' };

    var TEXT = {
        cz: {
            greeting: 'Dobrý den,',
            intro: 'prosím o cenovou nabídku na přepravu níže uvedené zásilky.',
            billing: 'Fakturace dopravy:',
            pickupTitle: 'Nakládka:',
            deliveryTitle: 'Vykládka:',
            contact: 'Kontaktní osoba:',
            tel: 'Tel.:',
            shipmentTitle: 'Zásilka:',
            totalWeight: 'Celková hmotnost:',
            closing: 'Prosím o sdělení ceny a nejbližšího možného termínu nakládky.',
            thanks: 'Děkuji předem za Vaši nabídku.',
            regards: 'S pozdravem,',
            unitWord: 'ks paleta',
            kg: 'kg',
            cm: 'cm',
            noCompany: '(společnost neuvedena)'
        },
        ru: {
            greeting: 'Добрый день,',
            intro: 'прошу предоставить расчёт стоимости перевозки указанного ниже груза.',
            billing: 'Плательщик за доставку:',
            pickupTitle: 'Загрузка:',
            deliveryTitle: 'Разгрузка:',
            contact: 'Контактное лицо:',
            tel: 'Тел.:',
            shipmentTitle: 'Груз:',
            totalWeight: 'Общий вес:',
            closing: 'Прошу сообщить стоимость и ближайшую возможную дату загрузки.',
            thanks: 'Заранее благодарю за предложение.',
            regards: 'С уважением,',
            unitWord: 'шт паллета',
            kg: 'кг',
            cm: 'см',
            noCompany: '(компания не указана)'
        }
    };

    function getDealId() {
        var m = url.match(/crm\/deal\/details\/(\d+)/);
        return m ? m[1] : null;
    }

    // Поле разгрузки заполняется вручную в формате "Имя, tel 602225280" — разбираем
    // на имя и телефон best-effort, менеджер может поправить текст перед отправкой.
    function parseContactField(raw) {
        raw = (raw || '').trim();
        if (!raw) return { name: '', phone: '' };

        var phoneMatch = raw.match(/tel\.?:?\s*([+\d][\d\s()+-]*)/i);
        if (phoneMatch) {
            var name = raw.slice(0, phoneMatch.index).replace(/,\s*$/, '').trim();
            return { name: name, phone: phoneMatch[1].trim() };
        }

        var parts = raw.split(',').map(function (p) { return p.trim(); }).filter(Boolean);
        return { name: parts[0] || '', phone: parts[1] || '' };
    }

    function getRecipientContactRaw() {
        var el = document.querySelector('[data-cid="UF_CRM_1744642285635"] .field-item');
        return el ? el.textContent.trim() : '';
    }

    function fetchCompanyPhone(dealId) {
        return fetch('/local/ajax/crystal/get_deal_company.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'dealId=' + encodeURIComponent(dealId)
        })
            .then(function (r) { return r.json(); })
            .then(function (resp) { return (resp && resp.company && resp.company.phone) ? resp.company.phone : ''; })
            .catch(function () { return ''; });
    }

    function formatNum(n) {
        if (n === null || n === undefined || isNaN(n)) return '';
        return (Math.round(n * 10) / 10).toString().replace('.', ',');
    }

    function unitLine(u, t) {
        var dims = (u.length && u.width)
            ? (u.length + ' × ' + u.width + (u.height ? ' × ' + u.height : ''))
            : '';
        return u.quantity + ' ' + t.unitWord + ' – ' + dims + ' ' + t.cm + ', ' + formatNum(u.weight) + ' ' + t.kg;
    }

    function generateLetter(lang, data) {
        var t = TEXT[lang];
        var billingCompany = data.billingCompany || 'ALVLA';

        var lines = [];
        lines.push(t.greeting, '', t.intro, '');
        lines.push(t.billing + ' ' + billingCompany, '');

        lines.push(t.pickupTitle);
        lines.push(PICKUP.company);
        lines.push(PICKUP.street);
        lines.push(PICKUP.zipCity);
        lines.push('');
        lines.push(t.contact + ' ' + PICKUP.contactName);
        lines.push(t.tel + ' ' + PICKUP.contactPhone);
        lines.push('');

        lines.push(t.deliveryTitle);
        lines.push(data.dealCompanyName || t.noCompany);
        if (data.to.street) lines.push(data.to.street);
        var zipCity = [data.to.zipcode, data.to.city].filter(Boolean).join(' ');
        if (zipCity) lines.push(zipCity);
        if (data.to.country) lines.push(data.to.country);
        lines.push('');
        lines.push(t.contact + ' ' + (data.contact.name || '') + (data.contact.phone ? ' ' + data.contact.phone : ''));
        lines.push('');

        lines.push(t.shipmentTitle, '');
        data.units.forEach(function (u) { lines.push(unitLine(u, t)); });
        if (data.totalWeight) lines.push(t.totalWeight + ' ' + formatNum(data.totalWeight) + ' ' + t.kg);
        lines.push('');

        lines.push(t.closing, '', t.thanks, '');
        lines.push(t.regards, '', SIGNATURE.name, SIGNATURE.phone);

        return lines.join('\n');
    }

    function openPopup() {
        var api = window.CrystalDeal;
        var dealId = getDealId();
        var parsed = api ? api.parseDeliveryData() : null;
        if (!dealId || !parsed) {
            alert('Нет данных доставки на сделке');
            return;
        }

        var contact = parseContactField(getRecipientContactRaw());

        // Попап пересоздаётся на каждый вызов и полностью уничтожается после закрытия —
        // при переиспользовании инстанса BX.PopupWindow по тому же id второе открытие
        // подхватывало старый (уже отсоединённый) DOM, и письмо оказывалось пустым.
        var popupId = 'crystal-letter-popup';
        var existing = BX.PopupWindowManager.getPopupById(popupId);
        if (existing) existing.destroy();

        var popup = new BX.PopupWindow(popupId, null, {
            titleBar: 'Письмо перевозчику',
            content: '<div style="min-width:480px;">'
                + '<div style="margin-bottom:8px;display:flex;gap:12px;align-items:center;">'
                + '<label style="cursor:pointer;"><input type="radio" name="crystal-letter-lang" value="cz" checked> CZ</label>'
                + '<label style="cursor:pointer;"><input type="radio" name="crystal-letter-lang" value="ru"> RU</label>'
                + '</div>'
                + '<textarea id="crystal-letter-text" style="width:100%;height:380px;font-family:monospace;font-size:12px;box-sizing:border-box;" spellcheck="false"></textarea>'
                + '<div style="margin-top:8px;display:flex;justify-content:flex-end;gap:8px;">'
                + '<button id="crystal-letter-copy" style="padding:6px 14px;border:none;border-radius:4px;background:#2d6cdf;color:#fff;cursor:pointer;">Копировать</button>'
                + '</div>'
                + '</div>',
            closeByEsc: true,
            autoHide: false,
            overlay: true,
            closeIcon: { show: true },
            buttons: [],
            events: {
                onPopupClose: function () { this.destroy(); }
            }
        });

        popup.show();

        var textarea = document.getElementById('crystal-letter-text');

        function render() {
            var lang = document.querySelector('input[name="crystal-letter-lang"]:checked').value;
            textarea.value = generateLetter(lang, {
                billingCompany: parsed.billingCompany,
                dealCompanyName: api.getDealCompanyName(),
                to: parsed.to,
                units: parsed.units,
                totalWeight: parsed.totalWeight,
                contact: contact
            });
        }

        render();

        Array.prototype.forEach.call(document.querySelectorAll('input[name="crystal-letter-lang"]'), function (r) {
            r.addEventListener('change', render);
        });

        document.getElementById('crystal-letter-copy').addEventListener('click', function () {
            textarea.select();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(textarea.value).catch(function () { document.execCommand('copy'); });
            } else {
                document.execCommand('copy');
            }
        });

        // В поле разгрузки не указан телефон — подтягиваем хотя бы телефон компании-заказчика.
        if (!contact.phone) {
            fetchCompanyPhone(dealId).then(function (phone) {
                if (phone) {
                    contact.phone = phone;
                    render();
                }
            });
        }
    }

    function insertButton() {
        if (document.getElementById(BTN_ID)) return;

        var container = window.CrystalDeal && window.CrystalDeal.getPanelContent();
        if (!container) return;

        var btn = document.createElement('div');
        btn.id = BTN_ID;
        btn.textContent = '✉ Письмо перевозчику';
        btn.style.cssText = 'cursor:pointer;text-align:center;padding:6px;margin-top:8px;background:#334155;color:#fff;border-radius:4px;font-size:12px;user-select:none;';
        btn.addEventListener('click', openPopup);
        container.appendChild(btn);
    }

    var observer = new MutationObserver(insertButton);
    observer.observe(document.body, { childList: true, subtree: true });

    insertButton();
});
