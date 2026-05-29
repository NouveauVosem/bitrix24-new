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

$dealId    = (int)($_POST['dealId']    ?? 0);
$productId = (int)($_POST['productId'] ?? 0);
$price     = (float)($_POST['price']   ?? 0);
$quantity  = (float)($_POST['quantity'] ?? 1);

if (!$dealId || !$productId) {
    echo json_encode(['status' => 'error', 'message' => 'dealId and productId are required']);
    die;
}

$rows   = \CCrmDeal::LoadProductRows($dealId) ?: [];
$found  = false;

foreach ($rows as &$row) {
    if ((int)$row['PRODUCT_ID'] === $productId) {
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
    echo json_encode(['status' => 'error', 'message' => 'Product row not found in deal']);
    die;
}

\CCrmDeal::SaveProductRows($dealId, $rows);

echo json_encode(['status' => 'success']);
