<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

$q     = trim($_GET['q'] ?? '');
$limit = min((int)($_GET['limit'] ?? 10), 20);

if (strlen($q) < 2) {
    echo json_encode([]);
    die();
}

\CModule::IncludeModule('iblock');

$res = \CIBlockElement::GetList(
    ['NAME' => 'ASC'],
    [
        'IBLOCK_ID' => 14,
        'ACTIVE'    => 'Y',
        '%NAME'     => $q,
    ],
    false,
    ['nTopCount' => $limit],
    ['ID', 'NAME', 'CODE', 'PROPERTY_ARTNUMBER']
);

$items = [];
while ($row = $res->GetNext()) {
    $article = $row['PROPERTY_ARTNUMBER_VALUE'] ?: $row['CODE'] ?: '';
    $items[] = [
        'id'      => (int)$row['ID'],
        'name'    => $row['NAME'],
        'article' => $article,
    ];
}

echo json_encode($items, JSON_UNESCAPED_UNICODE);
