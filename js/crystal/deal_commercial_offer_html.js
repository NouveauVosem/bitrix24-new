(function () {
    'use strict';

    var LATE_PAYMENT = window.OFFER_LATE_PAYMENT || {};
    var DOC_STRINGS  = window.OFFER_DOC_STRINGS  || {};

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
    var LOGO_URL    = '/local/images/alvla-clear-820px-01.png';
    var LANG_ALIASES = { cz: 'cs' };

    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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

    function thCell(label, align, width) {
        return '<th style="padding:8px 10px;font-size:9pt;font-weight:700;color:#fff;text-align:' + align + ';'
            + (width ? 'width:' + width + ';' : '') + '">' + label + '</th>\n';
    }

    function tdStyle(align) {
        return 'padding:7px 10px;font-size:10pt;vertical-align:middle;border-bottom:1px solid #e5e7eb;text-align:' + align + ';';
    }

    function resolveLang(val, lang) {
        if (!val || typeof val !== 'object') return String(val || '');
        var l = lang.toLowerCase();
        var lAlias = LANG_ALIASES[l] || l;
        return val[lAlias] || val[l] || val.en || val.ru || '';
    }

    function resolveItemName(item, lang) {
        if (lang === 'CZ' && item.nameCz) return item.nameCz;
        if (lang === 'RU' && item.nameRu) return item.nameRu;
        return item.nameEn || item.nameRu || item.name || '';
    }

    function buildLatePaymentHtml(state) {
        if (!state.latePayment) return '';
        var lp = LATE_PAYMENT[state.lang] || LATE_PAYMENT['EN'];
        return '<div style="margin-top:20px;page-break-inside:avoid;">'
            + '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;'
            + 'color:#9ca3af;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">'
            + esc(lp.title) + '</div>'
            + '<p style="font-size:8.5pt;color:#374151;line-height:1.55;">' + esc(lp.text) + '</p>'
            + '</div>';
    }

    function buildSpecsHtml(includedItems, state) {
        if (!state.includeSpecs) return '';
        var s = DOC_STRINGS[state.lang] || DOC_STRINGS['EN'] || {};
        var itemsWithData = includedItems.filter(function (it) {
            return (it.specs && it.specs.length) || it.physical || (it.components && it.components.length);
        });
        if (!itemsWithData.length) return '';

        var html = '<div style="margin-top:28px;page-break-inside:avoid;">';
        html += '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;'
              + 'color:#9ca3af;margin-bottom:14px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">'
              + esc(s.techSpecs || 'Technical Specifications') + '</div>';

        var labelTd = 'padding:2px 14px 2px 0;font-size:8.5pt;color:#6b7280;width:46%;vertical-align:top;';
        var valueTd = 'padding:2px 0;font-size:8.5pt;color:#1f2937;font-weight:500;';

        function dimStr(d) {
            var parts = [];
            if (d.width)  parts.push(d.width);
            if (d.depth)  parts.push(d.depth);
            if (d.height) parts.push(d.height);
            return parts.length ? parts.join(' × ') + ' mm' : '';
        }

        itemsWithData.forEach(function (it, itIdx) {
            var itemNo = includedItems.indexOf(it) + 1;
            var sep = itIdx > 0 ? 'border-top:2px solid #e5e7eb;padding-top:18px;margin-top:4px;' : '';
            html += '<div style="margin-bottom:20px;page-break-inside:avoid;' + sep + '">';
            html += '<div style="font-size:9.5pt;font-weight:700;color:#1e40af;margin-bottom:6px;">'
                  + itemNo + '. ' + esc(resolveItemName(it, state.lang)) + '</div>';
            html += '<div style="display:flex;gap:16px;align-items:flex-start;">';
            html += '<table style="width:56%;border-collapse:collapse;flex-shrink:0;">';

            (it.specs || []).forEach(function (spec) {
                html += '<tr>'
                    + '<td style="' + labelTd + '">' + esc(resolveLang(spec.label, state.lang)) + '</td>'
                    + '<td style="' + valueTd + '">' + esc(resolveLang(spec.value, state.lang)) + '</td>'
                    + '</tr>';
            });

            var phys = it.physical;
            if (phys) {
                var physRows = '';
                if (phys.dimensions) {
                    var ext = phys.dimensions.external;
                    var inn = phys.dimensions.internal;
                    if (ext) { var se = dimStr(ext); if (se) physRows += '<tr><td style="' + labelTd + '">' + esc(s.extDim || 'External dimensions (W×D×H)') + '</td><td style="' + valueTd + '">' + se + '</td></tr>'; }
                    if (inn) { var si = dimStr(inn); if (si) physRows += '<tr><td style="' + labelTd + '">' + esc(s.intDim || 'Internal dimensions (W×D×H)') + '</td><td style="' + valueTd + '">' + si + '</td></tr>'; }
                }
                if (phys.weight !== null && phys.weight !== undefined) {
                    physRows += '<tr><td style="' + labelTd + '">' + esc(s.netWeight || 'Net weight') + '</td><td style="' + valueTd + '">' + phys.weight + ' kg</td></tr>';
                }
                if (physRows) {
                    if (it.specs && it.specs.length) {
                        html += '<tr><td colspan="2" style="padding:5px 0 3px;font-size:8pt;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.4px;">' + esc(s.physParams || 'Physical Parameters') + '</td></tr>';
                    }
                    html += physRows;
                }
            }

            if (it.components && it.components.length) {
                html += '<tr><td colspan="2" style="padding:6px 0 3px;font-size:8pt;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.4px;">'
                      + esc(s.configuration || 'Configuration') + '</td></tr>';
                var slotByArticle = {};
                (it.slotSnapshot || []).forEach(function (snap) {
                    var article = snap.optionName ? snap.optionName.split(' ')[0] : null;
                    if (article) slotByArticle[article] = snap.slotName;
                });
                it.components.forEach(function (c) {
                    var rawSlot = c.slotName || slotByArticle[c.article];
                    var slotTitle = rawSlot ? resolveLang(rawSlot, state.lang) : '';
                    var compName = (slotTitle ? '<span style="color:#374151;font-weight:600;margin-right:4px;">' + esc(slotTitle) + '</span><span style="color:#9ca3af;margin-right:4px;">—</span>' : '')
                                 + (c.article ? '<span style="color:#9ca3af;margin-right:5px;">' + esc(c.article) + '</span>' : '')
                                 + esc(resolveItemName(c, state.lang));
                    html += '<tr>'
                        + '<td style="' + labelTd + '">' + compName + '</td>'
                        + '<td style="' + valueTd + '">&times;' + c.baseQty + '</td>'
                        + '</tr>';
                });
            }

            html += '</table>';

            var selectedMedia = (it.media || []).filter(function(url, i) {
                return it.mediaSelected ? it.mediaSelected[i] : false;
            });
            if (selectedMedia.length) {
                html += '<div style="display:flex;flex-direction:column;gap:6px;flex:1;">';
                selectedMedia.forEach(function (url) {
                    html += '<img src="' + esc(url) + '" style="max-width:100%;max-height:320px;object-fit:contain;border:1px solid #e5e7eb;border-radius:4px;display:block;">';
                });
                html += '</div>';
            }

            html += '</div></div>';
        });

        html += '</div>';
        return html;
    }

    function generateHTML(deal, state) {
        var s        = DOC_STRINGS[state.lang] || DOC_STRINGS['EN'] || {};
        var seller   = SELLERS[state.sellerKey] || SELLERS[DEFAULT_SELLER_KEY];
        var currency = deal.currency || 'EUR';

        var includedItems = state.items.filter(function (it) { return it.included; });

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
                    esc(resolveItemName(c, state.lang)),
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
                    + esc(resolveItemName(it, state.lang)) + '</td>',
                '<td style="' + tdStyle('center') + '">' + it.qty + '</td>',
                '<td style="' + tdStyle('right') + '">' + formatMoney(it.price) + '</td>',
                '<td style="' + tdStyle('center') + '">0%</td>',
                '<td style="' + tdStyle('right') + 'font-weight:600;">' + formatMoney(total) + '</td>',
                '</tr>',
                compRows
            ].join('');
        }).join('');

        var leadTimeHtml = state.leadTime
            ? '<p style="font-size:9.5pt;margin:10px 0 0;">'
              + '<span style="color:#6b7280;">' + esc(s.leadTimeLabel || 'Lead time: ') + '</span>'
              + '<strong>' + esc(state.leadTime) + ' ' + esc(s.leadTimeWeeks || 'weeks') + '</strong>'
              + '</p>'
            : '';

        var vatNote = '<p style="font-size:8.5pt;color:#6b7280;margin:4px 0 0;">'
            + esc(s.vatNote || 'VAT 0% – Reverse charge mechanism applies (Article 196, Council Directive 2006/112/EC)')
            + '</p>';

        var notesHtml = state.notes
            ? '<div style="margin-top:20px;padding:12px 14px;background:#f9fafb;border-left:3px solid #2563EB;border-radius:3px;font-size:9.5pt;color:#374151;">' + esc(state.notes).replace(/\n/g, '<br>') + '</div>'
            : '';

        var vatRow = state.buyerVat
            ? '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">' + esc(s.vatNo || 'VAT No.: ') + '</span>' + esc(state.buyerVat) + '</p>'
            : '';

        return '<!DOCTYPE html>\n<html lang="' + state.lang.toLowerCase() + '">\n<head>\n'
            + '<meta charset="UTF-8">\n'
            + '<title>' + esc(s.docTitle || 'Commercial Offer') + ' — ' + esc(state.buyerName || deal.title) + '</title>\n'
            + '<style>\n'
            + '* { box-sizing: border-box; margin: 0; padding: 0; }\n'
            + 'body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #1f2937; background: #fff; }\n'
            + '@page { size: A4; margin: 14mm 14mm 18mm 14mm; }\n'
            + '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } }\n'
            + '.page { max-width: 760px; margin: 0 auto; padding: 20px 0; }\n'
            + 'table { border-collapse: collapse; width: 100%; }\n'
            + '</style>\n</head>\n<body>\n<div class="page">\n'

            // Print button
            + '<div class="no-print" style="text-align:right;margin-bottom:16px;">'
            + '<button onclick="window.print()" style="padding:8px 20px;background:#2563EB;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:700;">'
            + esc(s.printSave || 'Print / Save PDF')
            + '</button></div>\n'

            // Header
            + '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #1e40af;margin-bottom:20px;">\n'
            + '<img src="' + LOGO_URL + '" alt="ALVLA" style="max-height:52px;max-width:160px;">\n'
            + '<div style="text-align:right;">'
            + '<div style="font-size:18pt;font-weight:700;color:#1e40af;letter-spacing:-0.5px;">' + esc(s.docTitle || 'Commercial Offer') + '</div>'
            + '<div style="font-size:10pt;color:#6b7280;margin-top:4px;">'
            + esc(s.offerLabel || 'No. ') + 'CO-' + String(deal.id).padStart(4, '0')
            + '&nbsp;&nbsp;&middot;&nbsp;&nbsp;' + todayDisplay()
            + '</div>'
            + '<div style="font-size:10pt;color:#6b7280;margin-top:2px;">'
            + esc(s.validUntil || 'Valid until: ') + formatDateDisplay(state.validUntil)
            + '</div>'
            + '</div>\n</div>\n'

            // Parties
            + '<div style="display:flex;gap:30px;margin-bottom:22px;">\n'
            + '<div style="flex:1;">'
            + '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-bottom:7px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">' + esc(s.seller || 'Seller') + '</div>'
            + '<p style="font-weight:700;font-size:10pt;margin-bottom:4px;">' + esc(seller.name) + '</p>'
            + '<p style="margin:3px 0;font-size:10pt;color:#374151;">' + esc(seller.address) + '</p>'
            + '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">IČO: </span>' + seller.ico + '</p>'
            + '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">DIČ: </span>' + seller.dic + '</p>'
            + '</div>\n'
            + '<div style="flex:1;">'
            + '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-bottom:7px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">' + esc(s.buyer || 'Buyer') + '</div>'
            + '<p style="font-weight:700;font-size:10pt;margin-bottom:4px;">' + esc(state.buyerName) + '</p>'
            + (state.buyerContact      ? '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">' + esc(s.attn || 'Attn.: ') + '</span>' + esc(state.buyerContact) + '</p>' : '')
            + (state.buyerLegalAddress ? '<p style="margin:3px 0;font-size:10pt;color:#374151;">' + esc(state.buyerLegalAddress) + '</p>' : '')
            + (state.buyerAddress && state.buyerAddress !== state.buyerLegalAddress ? '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">' + esc(s.delivery || 'Delivery: ') + '</span>' + esc(state.buyerAddress) + '</p>' : '')
            + (state.buyerPhone        ? '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">' + esc(s.tel || 'Tel.: ') + '</span>' + esc(state.buyerPhone) + '</p>' : '')
            + (state.buyerEmail        ? '<p style="margin:3px 0;font-size:10pt;"><span style="color:#6b7280;">Email: </span>' + esc(state.buyerEmail) + '</p>' : '')
            + vatRow
            + '</div>\n</div>\n'

            // Table
            + '<table>\n'
            + '<thead>\n<tr style="background:#1e40af;">\n'
            + thCell(s.colNo    || 'No.',        'center', '34px')
            + thCell(s.colDesc  || 'Description','left',   '')
            + thCell(s.colQty   || 'Qty',        'center', '48px')
            + thCell(s.colPrice || 'Unit Price', 'right',  '90px')
            + thCell(s.colVat   || 'VAT',        'center', '48px')
            + thCell(s.colTotal || 'Total',      'right',  '90px')
            + '</tr>\n</thead>\n<tbody>\n'
            + rowsHtml
            + '</tbody>\n</table>\n'

            // Totals
            + '<div style="display:flex;justify-content:flex-end;margin-top:12px;">\n'
            + '<table style="width:320px;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;">\n'
            + '<tr><td style="padding:7px 12px;font-size:10pt;border-bottom:1px solid #e5e7eb;">' + esc(s.subtotal || 'Subtotal (excl. VAT)') + '</td>'
            + '<td style="padding:7px 12px;font-size:10pt;text-align:right;font-weight:600;border-bottom:1px solid #e5e7eb;">' + formatMoney(subtotal) + ' ' + currency + '</td></tr>\n'
            + '<tr><td style="padding:7px 12px;font-size:10pt;color:#6b7280;border-bottom:1px solid #e5e7eb;">' + esc(s.vatZero || 'VAT (0%)') + '</td>'
            + '<td style="padding:7px 12px;font-size:10pt;text-align:right;color:#6b7280;border-bottom:1px solid #e5e7eb;">0.00 ' + currency + '</td></tr>\n'
            + '<tr style="background:#1e40af;"><td style="padding:9px 12px;font-size:11pt;font-weight:700;color:#fff;">' + esc(s.total || 'TOTAL') + '</td>'
            + '<td style="padding:9px 12px;font-size:11pt;font-weight:700;color:#fff;text-align:right;">' + formatMoney(subtotal) + ' ' + currency + '</td></tr>\n'
            + '</table>\n</div>\n'

            + vatNote
            + leadTimeHtml
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

    window.AlvlaOfferGen = { generateHTML: generateHTML, formatMoney: formatMoney };
})();
