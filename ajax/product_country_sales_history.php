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
$productBitrixId = (int)($_GET['product_bitrix_id'] ?? $_POST['product_bitrix_id'] ?? 0);
$dealId          = (int)($_GET['deal_id'] ?? $_POST['deal_id'] ?? 0);

if ($productBitrixId <= 0) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'product_bitrix_id is required']);
    die();
}
if ($dealId <= 0) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'deal_id is required']);
    die();
}

// ── Получить компанию текущей сделки ─────────────────────────────────────────
$sourceDeal = \Bitrix\Crm\DealTable::getList([
    'filter' => ['=ID' => $dealId],
    'select' => ['ID', 'COMPANY_ID'],
])->fetch();

if (!$sourceDeal) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Deal not found']);
    die();
}

$companyId = (int)$sourceDeal['COMPANY_ID'];

// ── Страна из карточки компании ───────────────────────────────────────────────
$companyCountry = null;
if ($companyId > 0) {
    $company = \Bitrix\Crm\CompanyTable::getList([
        'filter' => ['=ID' => $companyId],
        'select' => ['UF_CRM_1717094712004'],
    ])->fetch();
    if ($company) {
        $companyCountry = $company['UF_CRM_1717094712004'];
    }
}

if (!$companyCountry) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'product_bitrix_id' => $productBitrixId,
        'company_country'   => null,
        'last_products'     => [],
        'note'              => 'Country not set for this company',
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    die();
}

// ── Найти все компании с той же страной ───────────────────────────────────────
$companiesRaw = \Bitrix\Crm\CompanyTable::getList([
    'filter' => ['=UF_CRM_1717094712004' => $companyCountry],
    'select' => ['ID'],
])->fetchAll();

$countryCompanyIds = array_column($companiesRaw, 'ID');

if (empty($countryCompanyIds)) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'product_bitrix_id' => $productBitrixId,
        'company_country'   => $companyCountry,
        'last_products'     => [],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
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

// ── Найти строки товара во всех сделках ───────────────────────────────────────
$productRowsRaw = \Bitrix\Crm\ProductRowTable::getList([
    'filter' => [
        '=PRODUCT_ID' => $productBitrixId,
        '=OWNER_TYPE' => 'D',
        '>PRICE'      => 0,
    ],
    'select' => ['OWNER_ID', 'PRODUCT_NAME', 'PRODUCT_ID', 'PRICE', 'PRICE_EXCLUSIVE', 'QUANTITY'],
])->fetchAll();

if (empty($productRowsRaw)) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'product_bitrix_id' => $productBitrixId,
        'company_country'   => $companyCountry,
        'last_products'     => [],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    die();
}

$dealIdsFromProducts = array_unique(array_column($productRowsRaw, 'OWNER_ID'));

// ── Найти сделки по стране на принятых стадиях (исключить текущую) ───────────
$dealsRaw = \Bitrix\Crm\DealTable::getList([
    'filter' => [
        '@ID'         => $dealIdsFromProducts,
        '@STAGE_ID'   => $acceptedStages,
        '@COMPANY_ID' => $countryCompanyIds,
        '!=ID'        => $dealId,
    ],
    'select' => [
        'ID', 'TITLE', 'DATE_CREATE', 'STAGE_ID', 'CURRENCY_ID', 'COMMENTS',
        'COMPANY_ID',
        'UF_CRM_1718024604516', // Базис поставки (Инкотермс)
        'UF_CRM_1713986412118', // Ранее выданная цена EXW Прага
        'UF_CRM_1717099845566', // Целевая цена EXW Прага
        'UF_CRM_1718027018701', // Валюта сделки
    ],
    'order' => ['DATE_CREATE' => 'DESC'],
])->fetchAll();

$lastProducts = [];

if (!empty($dealsRaw)) {
    $productsByDeal = [];
    foreach ($productRowsRaw as $row) {
        $productsByDeal[$row['OWNER_ID']][] = $row;
    }

    $allProductsFlat = [];
    foreach ($dealsRaw as $d) {
        $products = $productsByDeal[$d['ID']] ?? [];

        foreach ($products as $p) {
            $allProductsFlat[] = [
                'product_id'            => $p['PRODUCT_ID'],
                'name'                  => $p['PRODUCT_NAME'],
                'price'                 => $p['PRICE_EXCLUSIVE'],
                'quantity'              => $p['QUANTITY'],
                'deal_id'               => $d['ID'],
                'deal_title'            => $d['TITLE'],
                'deal_date'             => $d['DATE_CREATE'] ? (string)$d['DATE_CREATE'] : '',
                'deal_stage_id'         => $d['STAGE_ID'],
                'deal_company_id'       => $d['COMPANY_ID'],
                'deal_currency'         => $d['UF_CRM_1718027018701'],
                'deal_incoterms'        => $d['UF_CRM_1718024604516'],
                'deal_prev_price_exw'   => $d['UF_CRM_1713986412118'],
                'deal_target_price_exw' => $d['UF_CRM_1717099845566'],
                'deal_comments'         => $d['COMMENTS'],
            ];
        }
    }

    $lastProducts = array_slice($allProductsFlat, 0, 20);
}

// ── Ответ ─────────────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'product_bitrix_id' => $productBitrixId,
    'company_country'   => $companyCountry,
    'last_products'     => $lastProducts,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
die();
