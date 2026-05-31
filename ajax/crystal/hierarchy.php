<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

$action = $_POST['action'] ?? '';
$dealId = (int)($_POST['dealId'] ?? 0);

if (!$dealId) {
    echo json_encode(['status' => 'error', 'message' => 'No dealId']);
    die();
}

$connection = \Bitrix\Main\Application::getConnection();

$connection->query("CREATE TABLE IF NOT EXISTS `crm_deal_hierarchy` (
    `ID` int(11) NOT NULL AUTO_INCREMENT,
    `DEAL_ID` int(11) NOT NULL,
    `ITEMS` mediumtext NOT NULL,
    `DATE_UPDATE` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`ID`),
    UNIQUE KEY `uidx_deal_id` (`DEAL_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

if ($action === 'get') {

    $res   = $connection->query("SELECT ITEMS FROM crm_deal_hierarchy WHERE DEAL_ID = " . $dealId);
    $row   = $res->fetch();
    $items = $row ? json_decode($row['ITEMS'], true) : [];

    // Грузим строки Битрикс только если есть элементы без rowId
    $bitrixRows = [];
    $needsSync  = !empty(array_filter($items, function ($i) { return empty($i['rowId']); }));
    if ($needsSync) {
        \CModule::IncludeModule('crm');
        foreach ((\CCrmDeal::LoadProductRows($dealId) ?: []) as $r) {
            $bitrixRows[] = [
                'rowId'       => (int)$r['ID'],
                'productId'   => (int)$r['PRODUCT_ID'],
                'productName' => $r['PRODUCT_NAME'],
            ];
        }
    }

    echo json_encode([
        'status'     => 'success',
        'items'      => $items,
        'bitrixRows' => $bitrixRows,
    ]);

} elseif ($action === 'save') {

    $items = json_decode($_POST['items'] ?? '[]', true);
    if ($items === null) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
        die();
    }
    $safe = $connection->getSqlHelper()->forSql(json_encode($items, JSON_UNESCAPED_UNICODE));
    $connection->query(
        "INSERT INTO crm_deal_hierarchy (DEAL_ID, ITEMS) VALUES ($dealId, '$safe')
         ON DUPLICATE KEY UPDATE ITEMS = '$safe', DATE_UPDATE = NOW()"
    );
    echo json_encode(['status' => 'success']);

} elseif ($action === 'resolve_articles') {

    $articles = json_decode($_POST['articles'] ?? '[]', true) ?: [];
    $map = [];

    if (!empty($articles)) {
        foreach ($articles as $article) {
            $article = trim((string)$article);
            if ($article === '') continue;
            $safe = $connection->getSqlHelper()->forSql($article);
            // Ищем по точному совпадению или "артикул + пробел + что-то" в названии
            $res = $connection->query(
                "SELECT ID FROM b_iblock_element
                 WHERE IBLOCK_ID = 14 AND ACTIVE = 'Y'
                 AND (NAME = '$safe' OR NAME LIKE '$safe %')
                 LIMIT 1"
            );
            if ($row = $res->Fetch()) {
                $map[$article] = (int)$row['ID'];
            }
        }
    }

    echo json_encode(['status' => 'success', 'map' => $map]);

}
