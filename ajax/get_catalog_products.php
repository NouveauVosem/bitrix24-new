<?php
define('NO_KEEP_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', false);

require($_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php');

header('Content-Type: application/json; charset=utf-8');

if (!$USER->IsAuthorized()) {
    echo json_encode(['error' => 'Unauthorized']);
    die;
}

CModule::IncludeModule('iblock');

$sectionId = (int)($_GET['sectionId'] ?? 0);
if (!$sectionId) {
    echo json_encode([]);
    die;
}

$products = [];
$res = CIBlockElement::GetList(
    ['NAME' => 'ASC'],
    [
        'IBLOCK_ID'           => 14,
        'ACTIVE'              => 'Y',
        'SECTION_ID'          => $sectionId,
        'INCLUDE_SUBSECTIONS' => 'Y',
    ],
    false,
    false,
    ['ID', 'NAME', 'PROPERTY_ARTNUMBER']
);

while ($el = $res->GetNextElement()) {
    $fields  = $el->GetFields();
    $props   = $el->GetProperties();
    $article = $props['ARTNUMBER']['VALUE'] ?? '';
    if ($article) {
        $products[] = [
            'id'      => (int)$fields['ID'],
            'name'    => $fields['NAME'],
            'article' => $article,
        ];
    }
}

echo json_encode($products, JSON_UNESCAPED_UNICODE);
