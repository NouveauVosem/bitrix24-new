BX.ready(function () {

    var productMatch = window.location.href.match(/\/product\/(\d+)/);
    if (!productMatch) return;

    var BITRIX_PRODUCT_ID = parseInt(productMatch[1], 10);
    var PANEL_ID     = 'crystal-kit-profile-panel';
    var CRYSTAL_BASE = 'https://crystal.alvla.tools';
    var API_KEY      = 'legenda';
    var KITS_PAGE    = CRYSTAL_BASE + '/main/kits';

    // Артикул и название товара — один раз, через тот же эндпоинт, что и панель операций.
    var product = null;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function loadProduct() {
        if (product) return Promise.resolve(product);
        return fetch('/local/ajax/crystal/get_product_article.php?bitrixId=' + BITRIX_PRODUCT_ID, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (resp) {
                var article = resp && resp.article ? String(resp.article).trim() : '';
                var name    = resp && resp.name ? String(resp.name).trim() : '';
                // В листе название без артикула в начале: «11.1565.5 Стол» → «Стол».
                if (article && name.indexOf(article) === 0) name = name.slice(article.length).trim();
                product = { article: article, name: name };
                return product;
            });
    }

    // null — профиля нет (Crystal ищет сначала по Bitrix ID, потом по артикулу).
    function findProfile(p) {
        var qs = 'bitrixProductId=' + BITRIX_PRODUCT_ID + (p.article ? '&article=' + encodeURIComponent(p.article) : '');
        return fetch(CRYSTAL_BASE + '/api/kits/profiles/find?' + qs, { headers: { 'X-Api-Key': API_KEY } })
            .then(function (r) {
                if (r.status === 404) return null;
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            });
    }

    function newProfileUrl(p) {
        return KITS_PAGE + '?new=1&bitrixProductId=' + BITRIX_PRODUCT_ID
            + '&article=' + encodeURIComponent(p.article)
            + '&name=' + encodeURIComponent(p.name);
    }

    // ===== РЕНДЕР =====

    function render(body, p, profile) {
        var html;
        if (profile) {
            var count = profile.items ? profile.items.length : 0;
            // Профиль найден по артикулу, но без Bitrix ID — привязку стоит доделать в Кристале.
            var unbound = !profile.bitrixProductId
                ? '<div style="color:#b7791f;margin-top:2px;">Не привязан к Bitrix ID — найден по артикулу</div>'
                : '';
            html = '<div style="color:#2c9e4b;font-weight:600;">✓ Профиль комплектации есть</div>'
                + '<div style="color:#555;">' + esc(profile.name) + ' · ' + count + ' поз.</div>'
                + unbound
                + '<a class="ui-btn ui-btn-light-border ui-btn-xs" style="margin-top:6px;" target="_blank" href="'
                + KITS_PAGE + '?profile=' + profile.id + '">Открыть в Кристале</a>';
        } else {
            html = '<div style="color:#e53e3e;font-weight:600;">Нет профиля комплектации</div>'
                + (p.article ? '' : '<div style="color:#888;">Артикул не найден — заполните его в Кристале вручную</div>')
                + '<a class="ui-btn ui-btn-primary ui-btn-xs" style="margin-top:6px;" target="_blank" href="'
                + esc(newProfileUrl(p)) + '">Создать профиль в Кристале</a>';
        }
        body.innerHTML = html;
    }

    function refresh() {
        var body = document.querySelector('#' + PANEL_ID + ' .ckp-body');
        if (!body) return;
        body.innerHTML = '<div style="color:#888;">Загрузка…</div>';

        loadProduct()
            .then(function (p) {
                return findProfile(p).then(function (profile) { render(body, p, profile); });
            })
            .catch(function (err) {
                body.innerHTML = '<div style="color:#e53e3e;">Ошибка проверки профиля</div>';
                console.error('[KitProfile]', err);
            });
    }

    // ===== ВСТАВКА ПАНЕЛИ =====
    // Рядом с панелью «Операции» (product_panel.js) — над гридом вариаций.

    function tryMount() {
        if (document.getElementById(PANEL_ID)) return true;
        var variationGrid = document.querySelector('.catalog-variation-grid');
        var container = variationGrid && variationGrid.parentElement;
        if (!container) return false;

        var panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.cssText = 'background:#fff;border:1px solid #dfe0e3;border-radius:8px;margin-bottom:16px;'
            + 'padding:10px 14px;font-size:13px;line-height:1.6;';
        panel.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'
            + '<span style="font-weight:600;color:#333;">Комплектация</span>'
            + '<button type="button" class="ckp-refresh" style="font-size:11px;padding:2px 8px;cursor:pointer;'
            + 'border:1px solid #ccc;background:#fff;border-radius:3px;color:#555;">↻ Обновить</button>'
            + '</div>'
            + '<div class="ckp-body"></div>';

        panel.querySelector('.ckp-refresh').addEventListener('click', refresh);
        container.insertBefore(panel, container.firstChild);
        refresh();
        return true;
    }

    // Вернулись из Кристала после создания профиля — статус обновится сам.
    window.addEventListener('focus', function () {
        if (document.getElementById(PANEL_ID)) refresh();
    });

    if (!tryMount()) {
        var observer = new MutationObserver(function () {
            if (tryMount()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(function () { observer.disconnect(); }, 15000);
    }

});
