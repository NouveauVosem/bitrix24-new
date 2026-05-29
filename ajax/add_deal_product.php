<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';
require_once $_SERVER['DOCUMENT_ROOT'] . '/local/ajax/crest/crest.php';

header('Content-Type: application/json; charset=utf-8');

if (!$USER->IsAuthorized()) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    die;
}

$dealId      = (int)($_POST['dealId']     ?? 0);
$productName = trim($_POST['productName'] ?? '');
$quantity    = (float)($_POST['quantity'] ?? 1);
$price       = (float)($_POST['price']    ?? 0);
$article     = trim($_POST['article']     ?? '');

if (!$dealId || !$productName) {
    echo json_encode(['status' => 'error', 'message' => 'dealId and productName are required']);
    die;
}

// Пробуем найти товар в каталоге по артикулу (начало названия)
$productId = 0;
if ($article) {
    \CModule::IncludeModule('iblock');
    $connection = \Bitrix\Main\Application::getConnection();
    $safe       = $connection->getSqlHelper()->forSql($article);
    $res        = $connection->query(
        "SELECT ID FROM b_iblock_element
         WHERE IBLOCK_ID = 14 AND ACTIVE = 'Y'
         AND (NAME = '$safe' OR NAME LIKE '$safe %')
         LIMIT 1"
    );
    if ($row = $res->Fetch()) {
        $productId = (int)$row['ID'];
    }
}

// Получаем текущие строки товаров сделки через REST
$existing = CRest::call('crm.deal.productrows.get', ['id' => $dealId]);
$rows     = $existing['result'] ?? [];

// Добавляем новую строку
// PRODUCT_ID = 0 — допустимо в Битрикс (произвольный товар без привязки к каталогу)
$rows[] = [
    'PRODUCT_ID'   => $productId,
    'PRODUCT_NAME' => $productName,
    'QUANTITY'     => $quantity,
    'PRICE'        => $price,
];

$setResult = CRest::call('crm.deal.productrows.set', [
    'id'   => $dealId,
    'rows' => $rows,
]);

if (!empty($setResult['error'])) {
    echo json_encode([
        'status'  => 'error',
        'message' => $setResult['error_description'] ?? 'CRest error',
        'debug'   => $setResult,
    ]);
    die;
}

echo json_encode(['status' => 'success', 'productId' => $productId]);
