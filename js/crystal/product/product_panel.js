BX.ready(function () {

    // Only on product pages: /shop/documents-catalog/14/product/3063/ or similar
    var productMatch = window.location.href.match(/\/product\/(\d+)/);
    if (!productMatch) return;

    var BITRIX_PRODUCT_ID = parseInt(productMatch[1], 10);
    var CRYSTAL_BASE = 'https://crystal.alvla.tools';
    var API_KEY = 'legenda';

    var state = {
        profile: null,      // WorkProfile | null
        operations: [],     // TextileOperation[] — full catalogue
        loading: true,
    };

    // ─── helpers ────────────────────────────────────────────────────────────

    function api(path, options) {
        var opts = options || {};
        opts.headers = Object.assign({ 'X-Api-Key': API_KEY }, opts.headers || {});
        return fetch(CRYSTAL_BASE + '/api' + path, opts).then(function (r) {
            if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || r.statusText); });
            if (r.status === 204) return null;
            return r.json();
        });
    }

    function fmtTime(sec) {
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        return m > 0 ? m + ' мин ' + (s > 0 ? s + ' с' : '') : sec + ' с';
    }

    function totalSeconds() {
        if (!state.profile || !state.profile.items) return 0;
        return state.profile.items.reduce(function (sum, item) {
            return sum + (item.operation ? item.operation.timeSeconds : 0);
        }, 0);
    }

    function addedOperationIds() {
        if (!state.profile || !state.profile.items) return {};
        var map = {};
        state.profile.items.forEach(function (item) { map[item.operationId] = true; });
        return map;
    }

    // ─── render panel ───────────────────────────────────────────────────────

    function renderPanel() {
        var panel = document.getElementById('cwp-panel');
        if (!panel) return;

        var total = totalSeconds();

        // header total
        var totalEl = panel.querySelector('.cwp-header-total');
        if (totalEl) {
            totalEl.innerHTML = total > 0
                ? 'Итого: <strong>' + fmtTime(total) + '</strong>'
                : '';
        }

        // body
        var body = panel.querySelector('.cwp-body');
        body.innerHTML = '';

        if (state.loading) {
            body.innerHTML = '<div class="cwp-loading">Загрузка...</div>';
            return;
        }

        var items = state.profile ? state.profile.items : [];
        if (!items || items.length === 0) {
            body.innerHTML = '<div class="cwp-empty">Операции не добавлены</div>';
            return;
        }

        items.forEach(function (item) {
            var op = item.operation;
            if (!op) return;
            var row = document.createElement('div');
            row.className = 'cwp-item';
            row.innerHTML =
                '<span class="cwp-item-name">' + escHtml(op.name) + '</span>' +
                '<span class="cwp-item-meta">' + escHtml(op.group) + ' / ' + escHtml(op.subgroup) + '</span>' +
                '<span class="cwp-item-time">' + fmtTime(op.timeSeconds) + '</span>' +
                '<button class="cwp-item-remove" title="Удалить">&times;</button>';
            row.querySelector('.cwp-item-remove').addEventListener('click', function () {
                removeOperation(item.operationId);
            });
            body.appendChild(row);
        });
    }

    function escHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ─── inject panel DOM ───────────────────────────────────────────────────

    function injectPanel(container) {
        if (document.getElementById('cwp-panel')) return;

        var panel = document.createElement('div');
        panel.id = 'cwp-panel';
        panel.className = 'cwp-panel';
        panel.innerHTML =
            '<div class="cwp-header">' +
                '<span class="cwp-header-title">Операции</span>' +
                '<span class="cwp-header-total"></span>' +
            '</div>' +
            '<div class="cwp-body"><div class="cwp-loading">Загрузка...</div></div>' +
            '<div class="cwp-footer">' +
                '<button class="cwp-add-btn">+ Добавить операцию</button>' +
            '</div>';

        // Hide "Добавить вариацию" button — nobody uses it
        var addVariationBlock = document.querySelector('.catalog-variation-grid-add-block');
        if (addVariationBlock) addVariationBlock.style.display = 'none';

        container.insertBefore(panel, container.firstChild);

        panel.querySelector('.cwp-add-btn').addEventListener('click', openModal);
    }

    // ─── API calls ──────────────────────────────────────────────────────────

    function loadProfile() {
        state.loading = true;
        renderPanel();

        api('/work-profiles/byBitrixId/' + BITRIX_PRODUCT_ID)
            .then(function (profile) {
                state.profile = profile;
                state.loading = false;
                renderPanel();
            })
            .catch(function (err) {
                if (err.message === 'Not found') {
                    // no profile yet — that's fine
                    state.profile = null;
                } else {
                    console.error('[WorkProfile] load error:', err);
                }
                state.loading = false;
                renderPanel();
            });
    }

    function loadOperations() {
        api('/work-profiles/operations')
            .then(function (ops) { state.operations = ops; })
            .catch(function (err) { console.error('[WorkProfile] ops load error:', err); });
    }

    function ensureProfile(callback) {
        if (state.profile) { callback(state.profile); return; }

        api('/work-profiles/findOrCreate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bitrixProductId: BITRIX_PRODUCT_ID }),
        }).then(function (result) {
            state.profile = result.profile;
            callback(state.profile);
        }).catch(function (err) {
            alert('Ошибка создания профиля: ' + err.message);
        });
    }

    function addOperation(operationId) {
        ensureProfile(function (profile) {
            api('/work-profiles/' + profile.id + '/operations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operationId: operationId }),
            }).then(function () {
                // reload full profile to get fresh items with operations
                return api('/work-profiles/byBitrixId/' + BITRIX_PRODUCT_ID);
            }).then(function (profile) {
                state.profile = profile;
                renderPanel();
                refreshModalAdded();
            }).catch(function (err) {
                console.error('[WorkProfile] add op error:', err);
            });
        });
    }

    function removeOperation(operationId) {
        if (!state.profile) return;
        api('/work-profiles/' + state.profile.id + '/operations/' + operationId, {
            method: 'DELETE',
        }).then(function () {
            state.profile.items = state.profile.items.filter(function (i) {
                return i.operationId !== operationId;
            });
            renderPanel();
            refreshModalAdded();
        }).catch(function (err) {
            console.error('[WorkProfile] remove op error:', err);
        });
    }

    // ─── modal ──────────────────────────────────────────────────────────────

    var modalEl = null;
    var modalSearchTimeout = null;

    function openModal() {
        if (modalEl) return;

        modalEl = document.createElement('div');
        modalEl.className = 'cwp-modal-overlay';
        modalEl.innerHTML =
            '<div class="cwp-modal">' +
                '<div class="cwp-modal-header">' +
                    '<span>Выбор операции</span>' +
                    '<button class="cwp-modal-close">&times;</button>' +
                '</div>' +
                '<div class="cwp-modal-search">' +
                    '<input type="text" placeholder="Поиск операции..." />' +
                '</div>' +
                '<div class="cwp-modal-body">Загрузка...</div>' +
            '</div>';

        document.body.appendChild(modalEl);

        modalEl.querySelector('.cwp-modal-close').addEventListener('click', closeModal);
        modalEl.addEventListener('click', function (e) {
            if (e.target === modalEl) closeModal();
        });

        var searchInput = modalEl.querySelector('input');
        searchInput.addEventListener('input', function () {
            clearTimeout(modalSearchTimeout);
            var q = searchInput.value;
            modalSearchTimeout = setTimeout(function () { renderModalList(q); }, 150);
        });

        renderModalList('');
        setTimeout(function () { searchInput.focus(); }, 50);
    }

    function closeModal() {
        if (modalEl) { modalEl.remove(); modalEl = null; }
    }

    function renderModalList(query) {
        var body = modalEl && modalEl.querySelector('.cwp-modal-body');
        if (!body) return;

        var q = (query || '').toLowerCase().trim();
        var added = addedOperationIds();

        var ops = state.operations.filter(function (op) {
            if (!q) return true;
            return (op.name + ' ' + op.group + ' ' + op.subgroup + ' ' + op.productionType)
                .toLowerCase().indexOf(q) !== -1;
        });

        if (ops.length === 0) {
            body.innerHTML = '<div class="cwp-empty">Ничего не найдено</div>';
            return;
        }

        // Group by group → subgroup
        var groups = {};
        ops.forEach(function (op) {
            if (!groups[op.group]) groups[op.group] = {};
            if (!groups[op.group][op.subgroup]) groups[op.group][op.subgroup] = [];
            groups[op.group][op.subgroup].push(op);
        });

        var html = '';
        Object.keys(groups).sort().forEach(function (grp) {
            html += '<div class="cwp-modal-group">' + escHtml(grp) + '</div>';
            Object.keys(groups[grp]).sort().forEach(function (sub) {
                html += '<div class="cwp-modal-subgroup">' + escHtml(sub) + '</div>';
                groups[grp][sub].forEach(function (op) {
                    var isAdded = !!added[op.id];
                    html +=
                        '<div class="cwp-modal-op' + (isAdded ? ' --added' : '') + '" data-op-id="' + op.id + '">' +
                            '<span class="cwp-modal-op-name">' + escHtml(op.name) + '</span>' +
                            '<span class="cwp-modal-op-time">' + fmtTime(op.timeSeconds) + '</span>' +
                            (isAdded
                                ? '<span style="font-size:11px;color:#aaa">добавлена</span>'
                                : '<button class="cwp-modal-op-add">+ Добавить</button>'
                            ) +
                        '</div>';
                });
            });
        });

        body.innerHTML = html;

        body.querySelectorAll('.cwp-modal-op:not(.--added)').forEach(function (row) {
            var btn = row.querySelector('.cwp-modal-op-add');
            if (!btn) return;
            btn.addEventListener('click', function () {
                var opId = parseInt(row.getAttribute('data-op-id'), 10);
                addOperation(opId);
            });
        });
    }

    function refreshModalAdded() {
        if (!modalEl) return;
        var searchInput = modalEl.querySelector('input');
        renderModalList(searchInput ? searchInput.value : '');
    }

    // ─── mount ──────────────────────────────────────────────────────────────

    function tryMount() {
        var variationGrid = document.querySelector('.catalog-variation-grid');
        if (!variationGrid) return false;

        var container = variationGrid.parentElement;
        if (!container) return false;

        injectPanel(container);
        loadProfile();
        loadOperations();
        return true;
    }

    // Wait for variation grid to appear
    if (!tryMount()) {
        var observer = new MutationObserver(function () {
            if (tryMount()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Stop observing after 15s to avoid memory leak
        setTimeout(function () { observer.disconnect(); }, 15000);
    }

});
