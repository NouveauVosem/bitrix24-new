(function () {
    'use strict';

    var CRYSTAL_BASE = 'https://crystal.alvla.tools';
    var API_KEY = 'legenda';
    var BTN_ID = 'crystal-catalog-btn';
    var MODAL_ID = 'crystal-catalog-modal';

    // ===== BUTTON =====

    function injectBtn() {
        if (document.getElementById(BTN_ID)) return;
        var btns = document.getElementById('cdh-header-btns');
        if (!btns) return;

        var btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.title = 'Каталог продуктов';
        btn.style.cssText = [
            'background:rgba(255,255,255,0.2);',
            'border:1px solid rgba(255,255,255,0.35);',
            'color:#fff;border-radius:3px;',
            'padding:1px 8px;cursor:pointer;',
            'font-size:13px;font-weight:600;line-height:1.4;'
        ].join('');
        btn.textContent = 'Кат.';
        btn.addEventListener('click', openCatalog);
        btns.appendChild(btn);
    }

    // ===== API =====

    function fetchProducts(search, callback) {
        var url = CRYSTAL_BASE + '/api/products/getAll?limit=200';
        if (search) url += '&search=' + encodeURIComponent(search);
        fetch(url, { headers: { 'X-Api-Key': API_KEY } })
            .then(function (r) { return r.json(); })
            .then(function (data) { callback(null, data); })
            .catch(function (err) { callback(err, null); });
    }

    // ===== MODAL =====

    function openCatalog() {
        if (document.getElementById(MODAL_ID)) return;

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

        var modal = document.createElement('div');
        modal.style.cssText = [
            'background:#f9fafb;border-radius:10px;',
            'width:720px;max-width:96vw;height:85vh;',
            'display:flex;flex-direction:column;',
            'box-shadow:0 8px 40px rgba(0,0,0,0.22);overflow:hidden;'
        ].join('');

        // Header
        var hdr = document.createElement('div');
        hdr.style.cssText = [
            'display:flex;align-items:center;gap:12px;',
            'padding:16px 20px;background:#fff;',
            'border-bottom:1px solid #e5e7eb;flex-shrink:0;'
        ].join('');

        var titleEl = document.createElement('span');
        titleEl.style.cssText = 'font-size:16px;font-weight:700;color:#111827;flex:1;';
        titleEl.textContent = 'Каталог продуктов';

        var searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Поиск...';
        searchInput.style.cssText = [
            'border:1px solid #d1d5db;border-radius:6px;',
            'padding:5px 10px;font-size:13px;width:200px;outline:none;'
        ].join('');

        var closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;color:#6b7280;padding:0 2px;';
        closeBtn.addEventListener('click', function () { overlay.remove(); });

        hdr.appendChild(titleEl);
        hdr.appendChild(searchInput);
        hdr.appendChild(closeBtn);

        // Body
        var body = document.createElement('div');
        body.style.cssText = 'flex:1;overflow-y:auto;padding:14px;';

        modal.appendChild(hdr);
        modal.appendChild(body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        loadProducts(body, '');

        var searchTimer = null;
        searchInput.addEventListener('input', function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                loadProducts(body, searchInput.value.trim());
            }, 300);
        });

        setTimeout(function () { searchInput.focus(); }, 50);
    }

    function loadProducts(body, search) {
        body.innerHTML = '<div style="color:#9ca3af;font-size:14px;padding:24px;text-align:center;">Загрузка...</div>';
        fetchProducts(search, function (err, data) {
            body.innerHTML = '';
            if (err || !data) {
                body.innerHTML = '<div style="color:#ef4444;font-size:14px;padding:24px;text-align:center;">Ошибка загрузки</div>';
                return;
            }
            var products = data.items || [];
            if (!products.length) {
                body.innerHTML = '<div style="color:#9ca3af;font-size:14px;padding:24px;text-align:center;">Ничего не найдено</div>';
                return;
            }
            products.forEach(function (product) {
                body.appendChild(buildProductCard(product));
            });
        });
    }

    // ===== PRODUCT CARD =====

    function localName(val) {
        if (!val) return '';
        if (typeof val === 'string') return val;
        return val.ru || val.en || val.cs || '';
    }

    function buildProductCard(product) {
        var variants = product.variants || [];

        var card = document.createElement('div');
        card.style.cssText = [
            'background:#fff;border:1px solid #e5e7eb;',
            'border-radius:8px;margin-bottom:8px;overflow:hidden;'
        ].join('');

        // Card header
        var cardHdr = document.createElement('div');
        cardHdr.style.cssText = [
            'display:flex;align-items:center;gap:8px;',
            'padding:10px 14px;cursor:pointer;user-select:none;'
        ].join('');
        cardHdr.addEventListener('mouseenter', function () { cardHdr.style.background = '#f8fafc'; });
        cardHdr.addEventListener('mouseleave', function () { if (!expanded) cardHdr.style.background = ''; });

        var arrow = document.createElement('span');
        arrow.textContent = '▶';
        arrow.style.cssText = 'font-size:10px;color:#6b7280;flex-shrink:0;transition:transform 0.15s;';

        var nameEl = document.createElement('span');
        nameEl.style.cssText = 'font-size:14px;font-weight:600;color:#111827;flex:1;';
        nameEl.textContent = localName(product.name) || '—';

        var countEl = document.createElement('span');
        countEl.style.cssText = 'font-size:12px;color:#9ca3af;flex-shrink:0;';
        countEl.textContent = variants.length + ' вар.';

        cardHdr.appendChild(arrow);
        cardHdr.appendChild(nameEl);
        cardHdr.appendChild(countEl);

        // Variants body
        var varBody = document.createElement('div');
        varBody.style.cssText = 'display:none;border-top:1px solid #f3f4f6;';
        variants.forEach(function (v) { varBody.appendChild(buildVariantRow(v)); });

        var expanded = false;
        cardHdr.addEventListener('click', function () {
            expanded = !expanded;
            varBody.style.display = expanded ? 'block' : 'none';
            arrow.style.transform = expanded ? 'rotate(90deg)' : '';
            cardHdr.style.background = expanded ? '#f0f4ff' : '';
        });

        card.appendChild(cardHdr);
        card.appendChild(varBody);
        return card;
    }

    // ===== VARIANT ROW =====

    function buildVariantRow(variant) {
        var row = document.createElement('div');
        row.style.cssText = [
            'display:flex;align-items:center;gap:10px;',
            'padding:7px 14px 7px 32px;',
            'border-bottom:1px solid #f9fafb;cursor:default;'
        ].join('');
        row.addEventListener('mouseenter', function () { row.style.background = '#f8fafc'; });
        row.addEventListener('mouseleave', function () { row.style.background = ''; });

        var articleEl = document.createElement('span');
        articleEl.style.cssText = 'font-size:12px;color:#6b7280;font-family:monospace;min-width:110px;flex-shrink:0;';
        articleEl.textContent = variant.article || '—';

        var nameEl = document.createElement('span');
        nameEl.style.cssText = 'font-size:13px;color:#374151;flex:1;';
        nameEl.textContent = localName(variant.name) || '';

        var statusEl = document.createElement('span');
        statusEl.style.cssText = 'font-size:11px;flex-shrink:0;';
        if (variant.isActive === false) {
            statusEl.textContent = 'неакт.';
            statusEl.style.color = '#d1d5db';
        } else {
            statusEl.textContent = 'акт.';
            statusEl.style.color = '#16a34a';
        }

        row.appendChild(articleEl);
        row.appendChild(nameEl);
        row.appendChild(statusEl);
        return row;
    }

    // ===== INIT =====

    BX.ready(function () {
        var observer = new MutationObserver(function () { injectBtn(); });
        observer.observe(document.body, { childList: true, subtree: true });
        injectBtn();
    });

})();
