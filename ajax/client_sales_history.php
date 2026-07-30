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

// ── Общие поля сделки ─────────────────────────────────────────────────────────
$dealSelect = [
    'ID', 'TITLE', 'DATE_CREATE', 'STAGE_ID', 'CURRENCY_ID', 'COMMENTS',
    'UF_CRM_1718024604516', // Базис поставки (Инкотермс)
    'UF_CRM_1713986412118', // Ранее выданная цена EXW Прага
    'UF_CRM_1717099845566', // Целевая цена EXW Прага
    'UF_CRM_1718027018701', // Валюта сделки
];

// ── Получить текущую сделку (без фильтра по стадии) ──────────────────────────
$sourceDeal = \Bitrix\Crm\DealTable::getList([
    'filter' => ['=ID' => $dealId],
    'select' => array_merge($dealSelect, ['COMPANY_ID', 'CONTACT_ID']),
])->fetch();

if (!$sourceDeal) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Deal not found']);
    die();
}

$companyId = (int)$sourceDeal['COMPANY_ID'];
$contactId = (int)$sourceDeal['CONTACT_ID'];

// ── Товары текущей сделки ─────────────────────────────────────────────────────
$currentDealProducts = [];
$currentProductRows = \Bitrix\Crm\ProductRowTable::getList([
    'filter' => [
        '=OWNER_ID'    => $dealId,
        '>PRICE'       => 0,
        '!=PRODUCT_ID' => 521,
    ],
    'select' => ['OWNER_ID', 'PRODUCT_NAME', 'PRODUCT_ID', 'PRICE', 'PRICE_EXCLUSIVE', 'QUANTITY'],
])->fetchAll();
foreach ($currentProductRows as $row) {
    $currentDealProducts[] = [
        'product_id' => $row['PRODUCT_ID'],
        'name'       => $row['PRODUCT_NAME'],
        'price'      => $row['PRICE'],
        'quantity'   => $row['QUANTITY'],
    ];
}

$currentDeal = [
    'id'               => $sourceDeal['ID'],
    'title'            => $sourceDeal['TITLE'],
    'date'             => $sourceDeal['DATE_CREATE'] ? (string)$sourceDeal['DATE_CREATE'] : null,
    'stage_id'         => $sourceDeal['STAGE_ID'],
    'currency'         => $sourceDeal['CURRENCY_ID'],
    'deal_currency'    => $sourceDeal['UF_CRM_1718027018701'],
    'incoterms'        => $sourceDeal['UF_CRM_1718024604516'],
    'prev_price_exw'   => $sourceDeal['UF_CRM_1713986412118'],
    'target_price_exw' => $sourceDeal['UF_CRM_1717099845566'],
    'comments'         => $sourceDeal['COMMENTS'],
    'products'         => $currentDealProducts,
];

// ── Страна клиента из карточки компании ──────────────────────────────────────
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
    '@STAGE_ID' => $acceptedStages,
    '!=ID'      => $dealId,
];
if ($companyId > 0) {
    $dealFilter['=COMPANY_ID'] = $companyId;
} else {
    $dealFilter['=CONTACT_ID'] = $contactId;
}

// ── Найти сделки клиента ──────────────────────────────────────────────────────
$dealsRaw = \Bitrix\Crm\DealTable::getList([
    'filter' => $dealFilter,
    'select' => $dealSelect,
    'order'  => ['DATE_CREATE' => 'DESC'],
])->fetchAll();

$lastProducts = [];

if (!empty($dealsRaw)) {
    $dealIds = array_column($dealsRaw, 'ID');

    // ── Товары всех найденных сделок одним запросом ───────────────────────────
    $productRowsRaw = \Bitrix\Crm\ProductRowTable::getList([
        'filter' => [
            '@OWNER_ID'    => $dealIds,
            '>PRICE'       => 0,
            '!=PRODUCT_ID' => 521,
        ],
        'select' => ['OWNER_ID', 'PRODUCT_NAME', 'PRODUCT_ID', 'PRICE', 'PRICE_EXCLUSIVE', 'QUANTITY'],
    ])->fetchAll();

    $productsByDeal = [];
    foreach ($productRowsRaw as $row) {
        $productsByDeal[$row['OWNER_ID']][] = [
            'product_id' => $row['PRODUCT_ID'],
            'name'       => $row['PRODUCT_NAME'],
            'price'      => $row['PRICE'],
            'quantity'   => $row['QUANTITY'],
        ];
    }

    $allProductsFlat = [];
    foreach ($dealsRaw as $d) {
        $products = $productsByDeal[$d['ID']] ?? [];

        foreach ($products as $p) {
            $p['deal_currency']         = $d['UF_CRM_1718027018701'];
            $p['deal_id']               = $d['ID'];
            $p['deal_title']            = $d['TITLE'];
            $p['deal_date']             = $d['DATE_CREATE'] ? (string)$d['DATE_CREATE'] : '';
            $p['deal_stage_id']         = $d['STAGE_ID'];
            $p['deal_incoterms']        = $d['UF_CRM_1718024604516'];
            $p['deal_prev_price_exw']   = $d['UF_CRM_1713986412118'];
            $p['deal_target_price_exw'] = $d['UF_CRM_1717099845566'];
            $p['deal_comments']         = $d['COMMENTS'];
            $allProductsFlat[] = $p;
        }
    }

    $lastProducts = array_slice($allProductsFlat, 0, 10);
}

// ── Ответ ─────────────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'company_id'      => $companyId,
    'contact_id'      => $contactId,
    'company_country' => $companyCountry,
    'current_deal'    => $currentDeal,
    'last_products'   => $lastProducts,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
die();
