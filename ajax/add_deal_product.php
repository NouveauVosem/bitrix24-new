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
\CModule::IncludeModule('iblock');

$dealId      = (int)($_POST['dealId']     ?? 0);
$productName = trim($_POST['productName'] ?? '');
$quantity    = (float)($_POST['quantity'] ?? 1);
$price       = (float)($_POST['price']    ?? 0);
$article     = trim($_POST['article']     ?? '');

if (!$dealId || !$productName) {
    echo json_encode(['status' => 'error', 'message' => 'dealId and productName are required']);
    die;
}

// Ищем товар в каталоге по артикулу (начало названия)
$productId = 0;
if ($article) {
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

// Загружаем существующие строки товаров через ORM
$existingRows = \CCrmDeal::LoadProductRows($dealId) ?: [];

// Вычисляем следующий SORT
$maxSort = 0;
foreach ($existingRows as $row) {
    if ((int)$row['SORT'] > $maxSort) $maxSort = (int)$row['SORT'];
}

// Добавляем новую строку
$existingRows[] = [
    'PRODUCT_ID'       => $productId,
    'PRODUCT_NAME'     => $productName,
    'PRICE'            => $price,
    'PRICE_EXCLUSIVE'  => $price,
    'PRICE_NETTO'      => $price,
    'PRICE_BRUTTO'     => $price,
    'QUANTITY'         => $quantity,
    'DISCOUNT_TYPE_ID' => 2,
    'DISCOUNT_RATE'    => 0,
    'DISCOUNT_SUM'     => 0,
    'TAX_RATE'         => null,
    'TAX_INCLUDED'     => 'N',
    'CUSTOMIZED'       => 'Y',
    'MEASURE_CODE'     => 796,
    'MEASURE_NAME'     => 'шт',
    'SORT'             => $maxSort + 10,
    'TYPE'             => 1,
    'STORE_ID'         => 1,
];

$result = \CCrmDeal::SaveProductRows($dealId, $existingRows);

echo json_encode([
    'status'    => $result ? 'success' : 'error',
    'productId' => $productId,
]);
