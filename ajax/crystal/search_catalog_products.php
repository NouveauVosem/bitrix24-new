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

$connection = \Bitrix\Main\Application::getConnection();
$safe  = $connection->getSqlHelper()->forSql($q);
$limit = (int)$limit;

$res = $connection->query("
    SELECT ID, NAME
    FROM b_iblock_element
    WHERE IBLOCK_ID = 14
      AND ACTIVE = 'Y'
      AND NAME LIKE '%{$safe}%'
    ORDER BY NAME ASC
    LIMIT {$limit}
");

$items = [];
while ($row = $res->Fetch()) {
    $name    = $row['NAME'];
    $article = '';
    if (preg_match('/\d+\.\d+\.\d+/', $name, $m)) {
        $article = $m[0];
    }
    $items[] = [
        'id'      => (int)$row['ID'],
        'name'    => $name,
        'article' => $article,
    ];
}

echo json_encode($items, JSON_UNESCAPED_UNICODE);
