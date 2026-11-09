<?php
// Топ клиентов за период для ИИ-чата Кристала.
// Параметры: from, to (обязательны), manager_id, limit (20, не больше 50), sort=pass|amount|deals.
// sort=amount: суммы в разных валютах, сравнить их может только Кристал (у него
// курсы), поэтому limit не применяется — отдаём все строки (не больше 500), Кристал
// сам пересчитывает, сортирует и режет. Правила отбора сделок — в _common.php.
require __DIR__ . '/_common.php';

$period  = crystalStatsPeriod(true);
$manager = crystalStatsManager();
$limit   = crystalStatsLimit(20, 50);

$sort = crystalStatsParam('sort') ?: 'pass';
if (!in_array($sort, ['pass', 'amount', 'deals'], true)) {
    crystalStatsError("неверный sort: «{$sort}», допустимо pass, amount, deals");
}

$deals = \Bitrix\Crm\DealTable::getList([
    'filter' => crystalStatsDealFilter($period, $manager['id'], CRYSTAL_STATS_CLOSED_STAGES),
    'select' => crystalStatsDealSelect(),
]);

// Строка = клиент + валюта: суммы в разных валютах не складываем.
$groups = [];
$dealsWithoutCompany = 0;
$dealsWithoutPass = 0;
while ($d = $deals->fetch()) {
    $companyId = (int)$d['COMPANY_ID'];
    if ($companyId <= 0) {
        $dealsWithoutCompany++;
        continue;
    }
    $pass = crystalStatsPass($d);
    if ($pass === null) $dealsWithoutPass++;

    $key = $companyId . '|' . $d['CURRENCY_ID'];
    if (!isset($groups[$key])) {
        $groups[$key] = [
            'company_id'     => $companyId,
            'pass'           => 0.0,
            'amount'         => 0.0,
            'currency'       => $d['CURRENCY_ID'],
            'deals'          => 0,
            'last_deal_date' => null,
        ];
    }
    $g = &$groups[$key];
    $g['pass']   += (float)$pass;
    $g['amount'] += crystalStatsAmount($d);
    $g['deals']++;
    $date = crystalStatsDate($d['CLOSEDATE']);
    if ($date > $g['last_deal_date']) $g['last_deal_date'] = $date;
    unset($g);
}

$totalClients = count(array_unique(array_column($groups, 'company_id')));

$totalRows = count($groups);
if ($sort === 'amount') {
    // Сравнивать суммы можно только внутри одной валюты. Если строк больше
    // запаса, оставляем лучшие N в каждой валюте: тогда лучшие строки после
    // пересчёта в Кристале точно не потеряются.
    usort($groups, function ($a, $b) {
        return [$a['currency'], $b['amount'], $b['pass']] <=> [$b['currency'], $a['amount'], $a['pass']];
    });
    if ($totalRows > CRYSTAL_STATS_AMOUNT_ROWS_MAX) {
        $rank = [];          // место строки внутри своей валюты
        $perCurrency = [];
        foreach ($groups as $i => $g) {
            $rank[$i] = $perCurrency[$g['currency']] = ($perCurrency[$g['currency']] ?? 0) + 1;
        }
        $order = array_keys($groups);
        usort($order, function ($a, $b) use ($rank) {
            return [$rank[$a], $a] <=> [$rank[$b], $b];
        });
        $keep = array_flip(array_slice($order, 0, CRYSTAL_STATS_AMOUNT_ROWS_MAX));
        $groups = array_values(array_intersect_key($groups, $keep));
    }
} else {
    usort($groups, function ($a, $b) use ($sort) {
        return [$b[$sort], $b['pass'], $b['amount']] <=> [$a[$sort], $a['pass'], $a['amount']];
    });
    $groups = array_slice($groups, 0, $limit);
}

$companies = crystalStatsCompanies(array_column($groups, 'company_id'));
$rows = [];
foreach ($groups as $g) {
    $c = $companies[$g['company_id']] ?? ['company' => null, 'country' => null];
    $rows[] = [
        'company_id'     => $g['company_id'],
        'company'        => $c['company'],
        'country'        => $c['country'],
        'pass'           => round($g['pass'], 2),
        'amount'         => round($g['amount'], 2),
        'currency'       => $g['currency'],
        'deals'          => $g['deals'],
        'last_deal_date' => $g['last_deal_date'],
    ];
}

crystalStatsRespond([
    'period'                => $period,
    'manager'               => $manager,
    'sort'                  => $sort,
    'pass_currency'         => CRYSTAL_STATS_PASS_CURRENCY,
    'rows'                  => $rows,
    'total_rows'            => $totalRows,
    'total_clients'         => $totalClients,
    'deals_without_pass'    => $dealsWithoutPass,
    'deals_without_company' => $dealsWithoutCompany,
]);
