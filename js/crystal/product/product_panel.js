BX.ready(function () {

    var productMatch = window.location.href.match(/\/product\/(\d+)/);
    if (!productMatch) return;

    var BITRIX_PRODUCT_ID = parseInt(productMatch[1], 10);
    var CRYSTAL_BASE = 'https://crystal.alvla.tools';
    var API_KEY = 'legenda';

    // ── state ────────────────────────────────────────────────────────────────
    var state = {
        profile:    null,   // WorkProfile | null
        operations: [],     // TextileOperation[] — full catalogue
        loading:    true,

        // picker filters
        activeGroups:    {},   // { groupName: true }
        activeSubgroups: {},   // { subgroupName: true }
        searchQuery:     '',
        pickerOpen:      false,
    };

    // ── helpers ──────────────────────────────────────────────────────────────

    function api(path, options) {
        var opts = options || {};
        opts.headers = Object.assign({ 'X-Api-Key': API_KEY }, opts.headers || {});
        return fetch(CRYSTAL_BASE + '/api' + path, opts).then(function (r) {
            if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || r.statusText); });
            if (r.status === 204) return null;
            return r.json();
        });
    }

    function esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function fmtSec(sec) {
        if (sec == null) return null;
        return sec + ' с';
    }

    function fmtTotal(sec) {
        if (!sec) return '';
        var m = Math.floor(sec / 60), s = sec % 60;
        var mins = m + ' мин' + (s ? ' ' + s + ' с' : '');
        return sec + ' с (' + mins + ')';
    }

    function addedMap() {
        var map = {};
        if (state.profile && state.profile.items) {
            state.profile.items.forEach(function (item) { map[item.operationId] = item; });
        }
        return map;
    }

    function totalSeconds() {
        if (!state.profile || !state.profile.items) return 0;
        return state.profile.items.reduce(function (sum, item) {
            var t = item.timeSecondsOverride != null
                ? item.timeSecondsOverride
                : (item.operation ? item.operation.timeSeconds : null);
            return sum + (t || 0);
        }, 0);
    }

    function uniqueGroups() {
        var seen = {};
        state.operations.forEach(function (op) { seen[op.group] = true; });
        return Object.keys(seen).sort();
    }

    function subgroupsForActiveGroups() {
        var groups = Object.keys(state.activeGroups);
        if (groups.length === 0) return [];
        var seen = {};
        state.operations.forEach(function (op) {
            if (state.activeGroups[op.group]) seen[op.subgroup] = true;
        });
        return Object.keys(seen).sort();
    }

    function filteredOps() {
        var activeGroups    = Object.keys(state.activeGroups);
        var activeSubgroups = Object.keys(state.activeSubgroups);
        var q = state.searchQuery.toLowerCase().trim();

        return state.operations.filter(function (op) {
            if (activeGroups.length && !state.activeGroups[op.group]) return false;
            if (activeSubgroups.length && !state.activeSubgroups[op.subgroup]) return false;
            if (q && (op.name + ' ' + op.group + ' ' + op.subgroup).toLowerCase().indexOf(q) === -1) return false;
            return true;
        });
    }

    // ── render ───────────────────────────────────────────────────────────────

    function render() {
        var panel = document.getElementById('cwp-panel');
        if (!panel) return;

        var total = totalSeconds();

        // header total
        var totalEl = panel.querySelector('.cwp-header-total');
        if (totalEl) {
            totalEl.innerHTML = total > 0 ? 'Итого: <strong>' + fmtTotal(total) + '</strong>' : '';
        }

        renderProfile(panel);
        renderPickerFilters(panel);
        renderPickerList(panel);
    }

    function renderProfile(panel) {
        var body = panel.querySelector('.cwp-profile');
        if (!body) return;

        if (state.loading) {
            body.innerHTML = '<div class="cwp-profile-empty">Загрузка...</div>';
            return;
        }

        var items = state.profile ? state.profile.items : [];
        if (!items || items.length === 0) {
            body.innerHTML = '<div class="cwp-profile-empty">Операции не добавлены</div>';
            return;
        }

        body.innerHTML = '';
        items.forEach(function (item) {
            var op = item.operation;
            if (!op) return;

            // Determine display value in seconds
            var isOverridden = item.timeSecondsOverride != null;
            var displaySec   = isOverridden ? item.timeSecondsOverride : op.timeSeconds;
            var isRange      = !isOverridden && op.timeSecondsMin != null && op.timeSecondsMax != null;

            var timeLabel;
            if (isOverridden) {
                timeLabel = displaySec + ' с ✎';
            } else if (isRange) {
                timeLabel = op.timeSecondsMin + '–' + op.timeSecondsMax + ' с';
            } else if (displaySec != null) {
                timeLabel = displaySec + ' с';
            } else {
                timeLabel = '—';
            }

            var timeCls = 'cwp-op-time cwp-time-edit' +
                (isOverridden ? ' --overridden' : '') +
                (isRange ? ' --range' : '') +
                (displaySec == null && !isRange ? ' --none' : '');

            // norm diff badge
            var normBadgeHtml = '';
            if (isOverridden && op.timeSeconds != null) {
                var diff = item.timeSecondsOverride - op.timeSeconds;
                if (diff !== 0) {
                    var absDiff = Math.abs(diff);
                    var badgeCls = diff < 0 ? 'cwp-norm-badge --less' : 'cwp-norm-badge --more';
                    var badgeText = diff < 0
                        ? 'меньше нормы на ' + absDiff + ' с'
                        : 'больше нормы на ' + absDiff + ' с';
                    normBadgeHtml = '<span class="' + badgeCls + '">' + esc(badgeText) + '</span>';
                } else {
                    normBadgeHtml = '<span class="cwp-norm-badge --norm">по норме</span>';
                }
            } else if (!isOverridden && displaySec != null) {
                normBadgeHtml = '<span class="cwp-norm-badge --norm">по норме</span>';
            }

            var row = document.createElement('div');
            row.className = 'cwp-op-row';
            row.innerHTML =
                '<span class="' + timeCls + '" ' +
                    'data-item-id="' + item.id + '" ' +
                    'data-op-id="' + item.operationId + '" ' +
                    'data-current="' + (displaySec != null ? displaySec : '') + '" ' +
                    'title="Нажмите чтобы изменить время">' +
                    esc(timeLabel) +
                '</span>' +
                normBadgeHtml +
                '<span class="cwp-op-name">' + esc(op.name) + '</span>' +
                '<span class="cwp-op-sub">' + esc(op.group) + ' — ' + esc(op.subgroup) + '</span>' +
                '<button class="cwp-remove-btn" data-op-id="' + item.operationId + '" title="Убрать">&times;</button>';

            body.appendChild(row);
        });

        // Remove
        body.querySelectorAll('.cwp-remove-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                removeOperation(parseInt(btn.getAttribute('data-op-id'), 10));
            });
        });

        // Inline time edit
        body.querySelectorAll('.cwp-time-edit').forEach(function (span) {
            span.addEventListener('click', function () {
                activateTimeInput(span);
            });
        });
    }

    function activateTimeInput(span) {
        if (span.querySelector('input')) return; // already editing

        var itemId  = parseInt(span.getAttribute('data-item-id'), 10);
        var current = span.getAttribute('data-current');
        var origText = span.textContent;

        var input = document.createElement('input');
        input.type = 'number';
        input.min  = '0';
        input.className = 'cwp-time-input';
        input.value = current || '';
        input.placeholder = 'сек';

        span.textContent = '';
        span.appendChild(input);
        input.focus();
        input.select();

        function commit() {
            var raw = input.value.trim();
            var val = raw === '' ? null : parseInt(raw, 10);
            if (val !== null && (isNaN(val) || val < 0)) {
                span.textContent = origText; // revert on bad input
                return;
            }
            saveTimeOverride(itemId, val, span, origText);
        }

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter')  { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { span.textContent = origText; }
        });
        input.addEventListener('blur', commit);
    }

    function saveTimeOverride(itemId, valueOrNull, span, origText) {
        api('/work-profiles/items/' + itemId + '/time', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeSecondsOverride: valueOrNull }),
        }).then(function () {
            // update local state
            if (state.profile && state.profile.items) {
                state.profile.items.forEach(function (item) {
                    if (item.id === itemId) item.timeSecondsOverride = valueOrNull;
                });
            }
            render();
        }).catch(function (err) {
            console.error('[WorkProfile] time override error:', err);
            if (span) span.textContent = origText;
        });
    }

    function renderPickerFilters(panel) {
        var groupWrap = panel.querySelector('.cwp-group-chips');
        var subWrap   = panel.querySelector('.cwp-subgroup-chips');
        if (!groupWrap || !subWrap) return;

        // groups
        var groups = uniqueGroups();
        groupWrap.innerHTML = '';
        groups.forEach(function (g) {
            var chip = document.createElement('span');
            chip.className = 'cwp-chip' + (state.activeGroups[g] ? ' --active' : '');
            chip.textContent = g;
            chip.addEventListener('click', function () {
                if (state.activeGroups[g]) {
                    delete state.activeGroups[g];
                    // remove subgroups that no longer have a parent group
                    pruneSubgroups();
                } else {
                    state.activeGroups[g] = true;
                }
                renderPickerFilters(panel);
                renderPickerList(panel);
            });
            groupWrap.appendChild(chip);
        });

        // subgroups
        var subs = subgroupsForActiveGroups();
        subWrap.innerHTML = '';
        if (subs.length === 0) {
            subWrap.style.display = 'none';
            return;
        }
        subWrap.style.display = 'flex';
        subs.forEach(function (s) {
            var chip = document.createElement('span');
            chip.className = 'cwp-chip' + (state.activeSubgroups[s] ? ' --active' : '');
            chip.textContent = s;
            chip.addEventListener('click', function () {
                if (state.activeSubgroups[s]) {
                    delete state.activeSubgroups[s];
                } else {
                    state.activeSubgroups[s] = true;
                }
                renderPickerList(panel);
                // re-render to update active state
                renderPickerFilters(panel);
            });
            subWrap.appendChild(chip);
        });
    }

    function pruneSubgroups() {
        var valid = {};
        subgroupsForActiveGroups().forEach(function (s) { valid[s] = true; });
        Object.keys(state.activeSubgroups).forEach(function (s) {
            if (!valid[s]) delete state.activeSubgroups[s];
        });
    }

    function renderPickerList(panel) {
        var list = panel.querySelector('.cwp-list');
        if (!list) return;

        var ops    = filteredOps();
        var added  = addedMap();

        if (ops.length === 0) {
            list.innerHTML = '<div class="cwp-list-empty">Ничего не найдено</div>';
            return;
        }

        // group by group → subgroup
        var grouped = {};
        ops.forEach(function (op) {
            var key = op.group + '////' + op.subgroup;
            if (!grouped[key]) grouped[key] = { group: op.group, subgroup: op.subgroup, ops: [] };
            grouped[key].ops.push(op);
        });

        list.innerHTML = '';
        Object.keys(grouped).sort().forEach(function (key) {
            var sec = grouped[key];

            var hdr = document.createElement('div');
            hdr.className = 'cwp-list-group-header';
            hdr.textContent = sec.group + ' — ' + sec.subgroup;
            list.appendChild(hdr);

            sec.ops.forEach(function (op) {
                var isAdded = !!added[op.id];

                var timeHtml;
                if (op.timeSecondsMin != null && op.timeSecondsMax != null) {
                    timeHtml = '<span class="cwp-list-time --range">' + op.timeSecondsMin + '–' + op.timeSecondsMax + ' с</span>';
                } else if (op.timeSeconds != null) {
                    timeHtml = '<span class="cwp-list-time">' + op.timeSeconds + ' с</span>';
                } else {
                    timeHtml = '<span class="cwp-list-time --none">—</span>';
                }

                var row = document.createElement('div');
                row.className = 'cwp-list-row' + (isAdded ? ' --added' : '');
                row.setAttribute('data-op-id', op.id);
                row.innerHTML =
                    '<span class="cwp-list-check">✓</span>' +
                    '<span class="cwp-list-name">' + esc(op.name) + '</span>' +
                    timeHtml;

                if (!isAdded) {
                    row.addEventListener('click', function () {
                        addOperation(op.id);
                    });
                } else {
                    row.addEventListener('click', function () {
                        removeOperation(op.id);
                    });
                }

                list.appendChild(row);
            });
        });
    }

    // ── panel DOM ─────────────────────────────────────────────────────────────

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
            '<div class="cwp-profile"></div>' +

            '<div class="cwp-picker-toggle">' +
                '<span class="cwp-picker-toggle-label">+ Добавить операцию</span>' +
                '<span class="cwp-picker-toggle-arrow">▼</span>' +
            '</div>' +

            '<div class="cwp-picker">' +
                '<div class="cwp-filters">' +
                    '<div class="cwp-filter-label">Группы</div>' +
                    '<div class="cwp-chips cwp-group-chips"></div>' +
                    '<div class="cwp-chips cwp-subgroup-chips" style="display:none"></div>' +
                '</div>' +
                '<div class="cwp-search"><input type="text" placeholder="Поиск операции..." /></div>' +
                '<div class="cwp-list"><div class="cwp-list-empty">Загрузка операций...</div></div>' +
            '</div>';

        // hide "Добавить вариацию"
        var addVariationBlock = document.querySelector('.catalog-variation-grid-add-block');
        if (addVariationBlock) addVariationBlock.style.display = 'none';

        container.insertBefore(panel, container.firstChild);

        // picker toggle
        var toggle     = panel.querySelector('.cwp-picker-toggle');
        var pickerEl   = panel.querySelector('.cwp-picker');
        var arrowEl    = panel.querySelector('.cwp-picker-toggle-arrow');
        toggle.addEventListener('click', function () {
            state.pickerOpen = !state.pickerOpen;
            pickerEl.classList.toggle('--open', state.pickerOpen);
            arrowEl.classList.toggle('--open', state.pickerOpen);
        });

        // search
        var searchInput = panel.querySelector('.cwp-search input');
        var searchTimer;
        searchInput.addEventListener('input', function () {
            clearTimeout(searchTimer);
            var q = searchInput.value;
            searchTimer = setTimeout(function () {
                state.searchQuery = q;
                renderPickerList(panel);
            }, 150);
        });
    }

    // ── API calls ─────────────────────────────────────────────────────────────

    function loadProfile() {
        state.loading = true;
        render();

        api('/work-profiles/byBitrixId/' + BITRIX_PRODUCT_ID)
            .then(function (profile) {
                state.profile = profile;
            })
            .catch(function (err) {
                if (err.message !== 'Not found') console.error('[WorkProfile] load error:', err);
                state.profile = null;
            })
            .then(function () {
                state.loading = false;
                render();
            });
    }

    function loadOperations() {
        api('/work-profiles/operations')
            .then(function (ops) {
                state.operations = ops;
                var panel = document.getElementById('cwp-panel');
                if (panel) {
                    renderPickerFilters(panel);
                    renderPickerList(panel);
                }
            })
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
            console.error('[WorkProfile] create profile error:', err);
        });
    }

    function addOperation(operationId) {
        ensureProfile(function (profile) {
            api('/work-profiles/' + profile.id + '/operations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operationId: operationId }),
            }).then(function () {
                return api('/work-profiles/byBitrixId/' + BITRIX_PRODUCT_ID);
            }).then(function (fresh) {
                state.profile = fresh;
                render();
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
            render();
        }).catch(function (err) {
            console.error('[WorkProfile] remove op error:', err);
        });
    }

    // ── mount ─────────────────────────────────────────────────────────────────

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

    if (!tryMount()) {
        var observer = new MutationObserver(function () {
            if (tryMount()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(function () { observer.disconnect(); }, 15000);
    }

});
