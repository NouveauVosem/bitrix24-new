<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', true);
require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

\Bitrix\Main\Loader::includeModule("crm");

$token = $_SERVER['HTTP_X_API_TOKEN'] ?? $_GET['token'] ?? '';
if ($token !== 'Legenda') {
    http_response_code(403);
    echo json_encode(['error' => 'Unauthorized']);
    die();
}

header('Content-Type: application/json; charset=utf-8');

$productBitrixId = (int)($_GET['product_bitrix_id'] ?? 396);
$checkDealId     = (int)($_GET['deal_id'] ?? 630);

// 1. Все строки товара без фильтра по типу (как в баге)
$allRows = \Bitrix\Crm\ProductRowTable::getList([
    'filter' => [
        '=PRODUCT_ID' => $productBitrixId,
        '>PRICE'      => 0,
    ],
    'select' => ['OWNER_ID', 'OWNER_TYPE', 'PRODUCT_NAME', 'PRODUCT_ID', 'PRICE', 'QUANTITY'],
])->fetchAll();

// 2. Только строки для сделок (OWNER_TYPE = Deal = 2)
$dealRows = \Bitrix\Crm\ProductRowTable::getList([
    'filter' => [
        '=PRODUCT_ID'  => $productBitrixId,
        '=OWNER_TYPE'  => \CCrmOwnerType::Deal,
        '>PRICE'       => 0,
    ],
    'select' => ['OWNER_ID', 'OWNER_TYPE', 'PRODUCT_NAME', 'PRODUCT_ID', 'PRICE', 'QUANTITY'],
])->fetchAll();

// 3. Проверяем конкретную сделку
$dealCheck = \Bitrix\Crm\DealTable::getList([
    'filter' => ['=ID' => $checkDealId],
    'select' => ['ID', 'TITLE', 'STAGE_ID', 'COMPANY_ID'],
])->fetch();

// Строки товара именно сделки $checkDealId
$rowsForDeal = \Bitrix\Crm\ProductRowTable::getList([
    'filter' => [
        '=OWNER_ID'   => $checkDealId,
        '=OWNER_TYPE' => \CCrmOwnerType::Deal,
    ],
    'select' => ['OWNER_ID', 'OWNER_TYPE', 'PRODUCT_NAME', 'PRODUCT_ID', 'PRICE', 'QUANTITY'],
])->fetchAll();

// Ищем: есть ли OWNER_ID=$checkDealId среди allRows с ДРУГИМ типом (не сделка)
$nonDealRowsWithSameId = array_filter($allRows, function($r) use ($checkDealId) {
    return (int)$r['OWNER_ID'] === $checkDealId && (int)$r['OWNER_TYPE'] !== \CCrmOwnerType::Deal;
});

echo json_encode([
    'product_bitrix_id'          => $productBitrixId,
    'check_deal_id'              => $checkDealId,
    'CCrmOwnerType_Deal_value'   => \CCrmOwnerType::Deal,

    // Все сущности, у которых есть этот товар (без фильтра по типу)
    'all_rows_count'             => count($allRows),
    'all_rows_owner_types'       => array_unique(array_column($allRows, 'OWNER_TYPE')),
    'all_rows_owner_ids'         => array_unique(array_column($allRows, 'OWNER_ID')),

    // Только из сделок
    'deal_rows_count'            => count($dealRows),
    'deal_rows_owner_ids'        => array_unique(array_column($dealRows, 'OWNER_ID')),

    // Данные проверяемой сделки
    'deal_info'                  => $dealCheck,

    // Товары именно этой сделки
    'products_in_deal'           => $rowsForDeal,

    // КЛЮЧЕВАЯ ПРОВЕРКА: есть ли OWNER_ID=$checkDealId в строках ДРУГОГО типа
    'non_deal_rows_with_same_id' => array_values($nonDealRowsWithSameId),

], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
die();
