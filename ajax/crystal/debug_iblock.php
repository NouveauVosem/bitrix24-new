<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';
header('Content-Type: application/json; charset=utf-8');

\CModule::IncludeModule('iblock');

$ids = [411, 437, 440, 442, 414, 443];
$result = [];

$dbEl = \CIBlockElement::GetList([], ['ID' => $ids], false, false, ['ID', 'IBLOCK_ID', 'NAME', 'PROPERTY_73', 'PROPERTY_74']);
while ($el = $dbEl->GetNext()) {
    $result[] = [
        'id'       => $el['ID'],
        'iblock'   => $el['IBLOCK_ID'],
        'name'     => $el['NAME'],
        'prop73'   => $el['PROPERTY_73_VALUE'],
        'prop74'   => $el['PROPERTY_74_VALUE'],
    ];
}

echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
