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

echo json_encode([
    'found'   => true,
    'article' => $props['ARTNUMBER']['VALUE'] ?? null,
    'name'    => $fields['NAME'] ?? null,
], JSON_UNESCAPED_UNICODE);
