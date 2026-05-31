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
    ['ID', 'NAME']
);

while ($row = $res->Fetch()) {
    $name = $row['NAME'];
    $article = '';

    if (preg_match('/\d+\.\d+\.\d+/', $name, $m)) {
        $article = $m[0];
    }

    $products[] = [
        'id'      => (int)$row['ID'],
        'name'    => $name,
        'article' => $article,
    ];
}

echo json_encode($products, JSON_UNESCAPED_UNICODE);
