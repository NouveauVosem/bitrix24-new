<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

if (!$USER->IsAuthorized()) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    die;
}

\CModule::IncludeModule('crm');

$dealId      = (int)($_POST['dealId']      ?? 0);
$rowId       = (int)($_POST['rowId']       ?? 0);
$productName = trim($_POST['productName']  ?? '');
$price       = (float)($_POST['price']     ?? 0);
$quantity    = (float)($_POST['quantity']  ?? 1);

if (!$dealId || (!$rowId && !$productName)) {
    echo json_encode(['status' => 'error', 'message' => 'dealId and rowId or productName are required']);
    die;
}

$rows  = \CCrmDeal::LoadProductRows($dealId) ?: [];
$found = false;

foreach ($rows as &$row) {
    $match = $rowId
        ? ((int)$row['ID'] === $rowId)
        : (trim($row['PRODUCT_NAME']) === $productName);

    if ($match) {
        $row['PRICE']           = $price;
        $row['PRICE_EXCLUSIVE'] = $price;
        $row['PRICE_NETTO']     = $price;
        $row['PRICE_BRUTTO']    = $price;
        $row['QUANTITY']        = $quantity;
        $found = true;
        break;
    }
}
unset($row);

if (!$found) {
    echo json_encode(['status' => 'error', 'message' => 'Row not found', 'rowId' => $rowId, 'productName' => $productName]);
    die;
}

$ok = \CCrmDeal::SaveProductRows($dealId, $rows);
echo json_encode(['status' => $ok ? 'success' : 'error', 'rowId' => $rowId]);
