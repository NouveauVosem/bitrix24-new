<?php
// Динамика продаж по периодам для ИИ-чата Кристала.
// Параметры: from, to (обязательны), manager_id, company_id (необязательно, можно
// несколько через запятую — тогда разбивка по клиентам), group=month|quarter|year (month).
// Периоды без сделок отдаются строкой с нулями (по каждому клиенту, если по
// клиентам). Правила отбора сделок — в _common.php.
require __DIR__ . '/_common.php';

$period     = crystalStatsPeriod(true);
$manager    = crystalStatsManager();
$companyIds = crystalStatsIdList('company_id');

$group = crystalStatsParam('group') ?: 'month';
if (!in_array($group, ['month', 'quarter', 'year'], true)) {
    crystalStatsError("неверный group: «{$group}», допустимо month, quarter, year");
}

$companies = [];
if (!empty($companyIds)) {
    $companies = crystalStatsCompanies($companyIds);
    $missing = array_diff($companyIds, array_keys($companies));
    if (!empty($missing)) {
        crystalStatsError('клиент не найден: company_id=' . implode(',', $missing));
    }
}

$filter = crystalStatsDealFilter($period, $manager['id'], CRYSTAL_STATS_CLOSED_STAGES);
if (!empty($companyIds)) {
    $filter['@COMPANY_ID'] = $companyIds;
}

$deals = \Bitrix\Crm\DealTable::getList([
    'filter' => $filter,
    'select' => crystalStatsDealSelect(),
]);

$periodLabel = function (\DateTimeInterface $date) use ($group) {
    switch ($group) {
        case 'year':    return $date->format('Y');
        case 'quarter': return $date->format('Y') . '-Q' . (int)ceil($date->format('n') / 3);
        default:        return $date->format('Y-m');
    }
};

// Строка = период (+ клиент, если просили по клиентам) + валюта.
$byCompany = !empty($companyIds);
$groups = [];
$dealsWithoutPass = 0;
while ($d = $deals->fetch()) {
    if (!$d['CLOSEDATE']) continue;
    $label = $periodLabel(new \DateTime($d['CLOSEDATE']->format('Y-m-d')));
    $companyId = (int)$d['COMPANY_ID'];
    $pass = crystalStatsPass($d);
    if ($pass === null) $dealsWithoutPass++;

    $key = $label . '|' . ($byCompany ? $companyId : '') . '|' . $d['CURRENCY_ID'];
    if (!isset($groups[$key])) {
        $groups[$key] = ['period' => $label];
        if ($byCompany) $groups[$key]['company_id'] = $companyId;
        $groups[$key] += ['pass' => 0.0, 'amount' => 0.0, 'currency' => $d['CURRENCY_ID'], 'deals' => 0];
    }
    $groups[$key]['pass']   += (float)$pass;
    $groups[$key]['amount'] += crystalStatsAmount($d);
    $groups[$key]['deals']++;
}

// Пустые периоды — строки с нулями. Валюта нулевой строки — та, что чаще всего у
// этого клиента (или во всём ответе) за период, иначе базовая валюта портала:
// ноль в любой валюте — ноль, а Кристалу проще, когда валюта есть в каждой строке.
$allLabels = [];
$cursor = new \DateTime($period['from']);
$cursor->modify('first day of this month');
$end = new \DateTime($period['to']);
while ($cursor <= $end) {
    $allLabels[$periodLabel($cursor)] = true;
    $cursor->modify('+1 month');
}

$baseCurrency = \CCrmCurrency::GetBaseCurrencyID();
$currencyCount = [];
$filled = [];
foreach ($groups as $g) {
    $series = $byCompany ? $g['company_id'] : '';
    $currencyCount[$series][$g['currency']] = ($currencyCount[$series][$g['currency']] ?? 0) + $g['deals'];
    $filled[$g['period'] . '|' . $series] = true;
}
foreach ($byCompany ? $companyIds : [''] as $series) {
    $currency = $baseCurrency;
    if (!empty($currencyCount[$series])) {
        arsort($currencyCount[$series]);
        $currency = array_key_first($currencyCount[$series]);
    }
    foreach (array_keys($allLabels) as $label) {
        if (isset($filled[$label . '|' . $series])) continue;
        $row = ['period' => $label];
        if ($byCompany) $row['company_id'] = $series;
        $row += ['pass' => 0.0, 'amount' => 0.0, 'currency' => $currency, 'deals' => 0];
        $groups[$label . '|' . $series . '|' . $currency] = $row;
    }
}

ksort($groups);
$rows = [];
foreach ($groups as $g) {
    $g['pass']   = round($g['pass'], 2);
    $g['amount'] = round($g['amount'], 2);
    $rows[] = $g;
}

$response = [
    'period'        => $period,
    'manager'       => $manager,
    'group'         => $group,
    'pass_currency' => CRYSTAL_STATS_PASS_CURRENCY,
];
if ($byCompany) {
    // Названия один раз, а не в каждой строке — ответ короче.
    $response['companies'] = [];
    foreach ($companyIds as $id) {
        $response['companies'][] = ['company_id' => $id] + $companies[$id];
    }
}
$response['rows'] = $rows;
$response['deals_without_pass'] = $dealsWithoutPass;

crystalStatsRespond($response);
