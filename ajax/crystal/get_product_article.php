<?php
define('NO_KEEP_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', false);

require($_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php');

header('Content-Type: application/json; charset=utf-8');

if (!$USER->IsAuthorized()) {
    echo json_encode(['found' => false, 'message' => 'Unauthorized']);
    die();
}

CModule::IncludeModule('iblock');

$bitrixId = (int)($_GET['bitrixId'] ?? 0);
if (!$bitrixId) {
    echo json_encode(['found' => false, 'message' => 'bitrixId required']);
    die();
}

$el   = CIBlockElement::GetByID($bitrixId);
$item = $el->GetNextElement();

if (!$item) {
    echo json_encode(['found' => false, 'message' => 'Товар не найден']);
    die();
}

$fields = $item->GetFields();
$props  = $item->GetProperties();
$name   = $fields['NAME'] ?? '';

// PROPERTY_ARTNUMBER часто пуст на уровне товара (iblock 14) — заполняется
// только на офферах/SKU. В этом случае как и в get_catalog_products.php /
// search_catalog_products.php парсим артикул из начала NAME.
$article = $props['ARTNUMBER']['VALUE'] ?? null;
if (!$article && preg_match('/\d+\.\d+\.\d+/', $name, $m)) {
    $article = $m[0];
}

echo json_encode([
    'found'   => true,
    'article' => $article,
    'name'    => $name,
], JSON_UNESCAPED_UNICODE);
