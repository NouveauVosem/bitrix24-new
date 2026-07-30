<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', true);
require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

\Bitrix\Main\Loader::includeModule("crm");

// ── Авторизация ──────────────────────────────────────────────────────────────
define('CRYSTAL_API_TOKEN', 'Legenda');

$token = $_SERVER['HTTP_X_API_TOKEN'] ?? $_GET['token'] ?? $_POST['token'] ?? '';
if ($token !== CRYSTAL_API_TOKEN) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Unauthorized']);
    die();
}

// ── Входные данные ────────────────────────────────────────────────────────────
$dealId = (int)($_GET['deal_id'] ?? $_POST['deal_id'] ?? 0);
if ($dealId <= 0) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'deal_id is required']);
    die();
}

// ── Получить исходную сделку → COMPANY_ID ─────────────────────────────────────
$sourceDeal = \Bitrix\Crm\DealTable::getList([
    'filter' => ['=ID' => $dealId],
    'select' => ['ID', 'COMPANY_ID', 'CONTACT_ID'],
])->fetch();

if (!$sourceDeal) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Deal not found']);
    die();
}

$companyId = (int)$sourceDeal['COMPANY_ID'];
$contactId = (int)$sourceDeal['CONTACT_ID'];

if ($companyId <= 0 && $contactId <= 0) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'No company or contact on this deal', 'deals' => [], 'last_products' => []]);
    die();
}

// ── Стадии с принятой ценой ───────────────────────────────────────────────────
$acceptedStages = [
    // Воронка 0
    'UC_MFKCTZ', 'UC_TB1B18', 'UC_L8JVGQ', 'UC_3S4WFS',
    'UC_KPW8X6', 'UC_WR1KV9', 'UC_HOG6VO', 'UC_V8FMSP', 'WON',
    // Воронка 1
    'C1:UC_GI474N', 'C1:PREPARATION', 'C1:UC_3M0L0N', 'C1:UC_XELH19',
    'C1:UC_2DPXDX', 'C1:UC_2ZNGV3', 'C1:UC_1ZW3BW', 'C1:WON',
];

// ── Фильтр: по компании или контакту ─────────────────────────────────────────
$dealFilter = [
    '@STAGE_ID'  => $acceptedStages,
    '!=ID'       => $dealId, // исключаем текущую сделку
];
if ($companyId > 0) {
    $dealFilter['=COMPANY_ID'] = $companyId;
} else {
    $dealFilter['=CONTACT_ID'] = $contactId;
}

// ── Найти сделки клиента ──────────────────────────────────────────────────────
$dealsRaw = \Bitrix\Crm\DealTable::getList([
    'filter' => $dealFilter,
    'select' => [
        'ID', 'TITLE', 'DATE_CREATE', 'STAGE_ID', 'CURRENCY_ID', 'COMMENTS',
        'UF_CRM_1718024604516', // Базис поставки (Инкотермс)
        'UF_CRM_1713986412118', // Ранее выданная цена EXW Прага
        'UF_CRM_1717099845566', // Целевая цена EXW Прага
    ],
    'order' => ['DATE_CREATE' => 'DESC'],
])->fetchAll();

if (empty($dealsRaw)) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'company_id'    => $companyId,
        'contact_id'    => $contactId,
        'deals'         => [],
        'last_products' => [],
    ]);
    die();
}

$dealIds = array_column($dealsRaw, 'ID');

// ── Получить товарные позиции всех сделок одним запросом ─────────────────────
$productRowsRaw = \Bitrix\Crm\ProductRowTable::getList([
    'filter' => [
        '=ENTITY_TYPE_ID' => \CCrmOwnerType::Deal,
        '@ENTITY_ID'      => $dealIds,
        '>PRICE'          => 0,
    ],
    'select' => [
        'ENTITY_ID', 'PRODUCT_NAME', 'PRODUCT_ID',
        'PRICE', 'PRICE_EXCLUSIVE', 'QUANTITY',
    ],
])->fetchAll();

// Группируем товары по deal ID
$productsByDeal = [];
foreach ($productRowsRaw as $row) {
    $productsByDeal[$row['ENTITY_ID']][] = [
        'product_id'   => $row['PRODUCT_ID'],
        'name'         => $row['PRODUCT_NAME'],
        'price'        => $row['PRICE'],
        'quantity'     => $row['QUANTITY'],
    ];
}

// ── Собрать ответ по сделкам ──────────────────────────────────────────────────
$deals = [];
$allProductsFlat = []; // для last_products

foreach ($dealsRaw as $d) {
    $products = $productsByDeal[$d['ID']] ?? [];

    $deals[] = [
        'id'           => $d['ID'],
        'title'        => $d['TITLE'],
        'date'         => $d['DATE_CREATE'] ? (string)$d['DATE_CREATE'] : null,
        'stage_id'     => $d['STAGE_ID'],
        'currency'     => $d['CURRENCY_ID'],
        'incoterms'    => $d['UF_CRM_1718024604516'],
        'prev_price_exw'   => $d['UF_CRM_1713986412118'],
        'target_price_exw' => $d['UF_CRM_1717099845566'],
        'comments'     => $d['COMMENTS'],
        'products'     => $products,
    ];

    // Добавляем дату сделки в каждый продукт для сортировки
    foreach ($products as $p) {
        $p['deal_id']   = $d['ID'];
        $p['deal_date'] = $d['DATE_CREATE'] ? (string)$d['DATE_CREATE'] : '';
        $allProductsFlat[] = $p;
    }
}

// ── Последние 10 товарных позиций (уже отсортированы т.к. сделки DESC) ────────
$lastProducts = array_slice($allProductsFlat, 0, 10);

// ── Ответ ─────────────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'company_id'    => $companyId,
    'contact_id'    => $contactId,
    'deals'         => $deals,
    'last_products' => $lastProducts,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
die();
