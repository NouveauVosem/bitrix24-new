<?php
// Поиск сделок для ИИ-чата Кристала.
// Параметры (все необязательны): from, to (по дате закрытия), manager_id,
// company_id (через запятую) или company (часть названия), stage (через запятую),
// limit (30, не больше 50). Без stage — все стадии воронки «Заказы», включая проигранные.
// Свежие сделки первыми. Правила — в _common.php.
require __DIR__ . '/_common.php';

$period  = crystalStatsPeriod(false);
$manager = crystalStatsManager();
$limit   = crystalStatsLimit(30, 50);

$stageNames = crystalStatsStageNames();
$stages = crystalStatsList('stage');
if (empty($stages)) {
    $stages = array_keys($stageNames);
} else {
    $unknown = array_diff($stages, array_keys($stageNames));
    if (!empty($unknown)) {
        $known = [];
        foreach ($stageNames as $id => $name) $known[] = "$id ($name)";
        crystalStatsError('неизвестная стадия: ' . implode(', ', $unknown) . '. Допустимые: ' . implode(', ', $known));
    }
}

$filter = crystalStatsDealFilter($period, $manager['id'], $stages);

$companyIds = crystalStatsIdList('company_id');
$companyQuery = crystalStatsParam('company');
if (empty($companyIds) && $companyQuery !== '') {
    $found = \Bitrix\Crm\CompanyTable::getList([
        'filter' => ['%TITLE' => $companyQuery],
        'select' => ['ID'],
        'limit'  => 200,
    ])->fetchAll();
    if (empty($found)) {
        crystalStatsError("клиент не найден: «{$companyQuery}»");
    }
    $companyIds = array_map('intval', array_column($found, 'ID'));
}
if (!empty($companyIds)) {
    $filter['@COMPANY_ID'] = $companyIds;
}

$result = \Bitrix\Crm\DealTable::getList([
    'filter'      => $filter,
    'select'      => crystalStatsDealSelect(),
    'order'       => ['CLOSEDATE' => 'DESC', 'ID' => 'DESC'],
    'limit'       => $limit,
    'count_total' => true,
]);
$deals = $result->fetchAll();
$total = $result->getCount();

$companies = crystalStatsCompanies(array_column($deals, 'COMPANY_ID'));
$managers  = crystalStatsUserNames(array_column($deals, 'ASSIGNED_BY_ID'));

$rows = [];
foreach ($deals as $d) {
    $companyId = (int)$d['COMPANY_ID'];
    $rows[] = [
        'deal_id'    => (int)$d['ID'],
        'title'      => $d['TITLE'],
        'company_id' => $companyId ?: null,
        'company'    => $companies[$companyId]['company'] ?? null,
        'manager'    => $managers[(int)$d['ASSIGNED_BY_ID']] ?? null,
        'stage_id'   => $d['STAGE_ID'],
        'stage'      => $stageNames[$d['STAGE_ID']] ?? null,
        'date'       => crystalStatsDate($d['CLOSEDATE']),
        'amount'     => crystalStatsAmount($d),
        'currency'   => $d['CURRENCY_ID'],
        'pass'       => crystalStatsPass($d),
    ];
}

crystalStatsRespond([
    'period'        => $period,
    'manager'       => $manager,
    'pass_currency' => CRYSTAL_STATS_PASS_CURRENCY,
    'rows'          => $rows,
    'total'         => $total,
]);
