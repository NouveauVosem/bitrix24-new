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

$sections = [];
$res = CIBlockSection::GetList(
    ['LEFT_MARGIN' => 'ASC'],
    ['IBLOCK_ID' => 14, 'ACTIVE' => 'Y'],
    false,
    ['ID', 'NAME', 'DEPTH_LEVEL', 'IBLOCK_SECTION_ID']
);

while ($section = $res->Fetch()) {
    $sections[] = [
        'id'       => (int)$section['ID'],
        'name'     => $section['NAME'],
        'depth'    => (int)$section['DEPTH_LEVEL'],
        'parentId' => (int)$section['IBLOCK_SECTION_ID'],
    ];
}

echo json_encode($sections, JSON_UNESCAPED_UNICODE);
