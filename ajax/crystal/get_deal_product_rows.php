<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

if (!CModule::IncludeModule('crm')) {
    echo json_encode(['status' => 'error', 'message' => 'CRM module not available']);
    die();
}

$dealId = (int)($_POST['dealId'] ?? 0);
if (!$dealId) {
    echo json_encode(['status' => 'error', 'message' => 'dealId required']);
    die();
}

// Источник правды по PRODUCT_ID строк сделки — сам Битрикс, а не DOM грида:
// скрытый input[data-name="PRODUCT_ID"] в таблице товаров рендерится не всегда,
// а LoadProductRows() отдаёт реальную привязку к каталогу без гадания.
$rawRows = \CCrmDeal::LoadProductRows($dealId) ?: [];

// Транспортные услуги (UF_CRM_1718026115207) — берём тут же, чтобы фронту не
// приходилось парсить это поле из DOM сайдбара сделки.
global $USER_FIELD_MANAGER;
$dealUfFields = $USER_FIELD_MANAGER->GetUserFields('CRM_DEAL', $dealId, LANGUAGE_ID);

$transportServicesField = $dealUfFields['UF_CRM_1718026115207'] ?? [];
$transportServices = '';
if (!empty($transportServicesField['VALUE'])) {
    if (($transportServicesField['USER_TYPE_ID'] ?? '') === 'enumeration') {
        $enumRes = \CUserFieldEnum::GetList([], ['ID' => $transportServicesField['VALUE']]);
        if ($enumRow = $enumRes->Fetch()) $transportServices = $enumRow['VALUE'];
    } else {
        $transportServices = (string)$transportServicesField['VALUE'];
    }
}

$rows = [];
$productIds = [];
foreach ($rawRows as $r) {
    if (!empty($r['PRODUCT_ID'])) {
        $productIds[] = (int)$r['PRODUCT_ID'];
    }
}

// Fetch PROPERTY_70 from iblock catalog for all product IDs at once
$property70Map = [];
if (!empty($productIds) && \CModule::IncludeModule('iblock')) {
    $res = \CIBlockElement::GetList(
        [],
        ['ID' => $productIds, 'ACTIVE' => 'Y'],
        false,
        false,
        ['ID', 'PROPERTY_70']
    );
    while ($el = $res->Fetch()) {
        $property70Map[(int)$el['ID']] = $el['PROPERTY_70_VALUE'] ?? $el['PROPERTY_70'] ?? null;
    }
}

foreach ($rawRows as $r) {
    $pid = (int)$r['PRODUCT_ID'];
    $rows[] = [
        'rowId'       => (int)$r['ID'],
        'productId'   => $pid,
        'productName' => $r['PRODUCT_NAME'],
        'property70'  => $property70Map[$pid] ?? null,
    ];
}

echo json_encode(['status' => 'success', 'rows' => $rows, 'transportServices' => $transportServices], JSON_UNESCAPED_UNICODE);
