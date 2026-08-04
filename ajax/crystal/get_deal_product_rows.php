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

// DEBUG: dump keys of first row to see real field names
if (!empty($rawRows) && isset($_POST['debug'])) {
    echo json_encode(['status' => 'debug', 'keys' => array_keys($rawRows[0]), 'first_row' => $rawRows[0]], JSON_UNESCAPED_UNICODE);
    die();
}

$rows = [];
foreach ($rawRows as $r) {
    $rows[] = [
        'rowId'       => (int)$r['ID'],
        'productId'   => (int)$r['PRODUCT_ID'],
        'productName' => $r['PRODUCT_NAME'],
        'property70'  => $r['PROPERTY_70'] ?? null,
    ];
}

echo json_encode(['status' => 'success', 'rows' => $rows], JSON_UNESCAPED_UNICODE);
