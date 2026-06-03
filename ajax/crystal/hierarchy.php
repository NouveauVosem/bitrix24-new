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

    // Resolve missing bitrixId via Crystal API
    foreach ($items as &$item) {
        if (!empty($item['bitrixId'])) continue;
        $normId = $item['normId'] ?? null;
        if (!$normId) continue;
        $ctx = stream_context_create(['http' => [
            'method'  => 'GET',
            'header'  => 'X-Api-Key: legenda' . "\r\n",
            'timeout' => 5,
        ]]);
        $raw = @file_get_contents('https://crystal.alvla.tools/api/product-form-norms/' . urlencode($normId), false, $ctx);
        if ($raw) {
            $norm = json_decode($raw, true);
            $bid  = (int)($norm['template']['bitrixId'] ?? 0);
            if ($bid) $item['bitrixId'] = $bid;
        }
    }
    unset($item);

    // Enrich with English name (PROPERTY_74) from catalog
    $bitrixIds = array_values(array_unique(array_filter(
        array_map(function ($i) { return (int)($i['bitrixId'] ?? 0); }, $items)
    )));
    if (!empty($bitrixIds)) {
        \CModule::IncludeModule('iblock');
        $nameMap = [];
        $dbEl = \CIBlockElement::GetList([], ['ID' => $bitrixIds, 'IBLOCK_ID' => 14], false, false, ['ID', 'PROPERTY_74']);
        while ($el = $dbEl->GetNext()) {
            $nameMap[(int)$el['ID']] = $el['PROPERTY_74_VALUE'] ?? '';
        }
        foreach ($items as &$item) {
            $bid = (int)($item['bitrixId'] ?? 0);
            if ($bid && !empty($nameMap[$bid])) {
                $item['nameEn'] = $nameMap[$bid];
            }
        }
        unset($item);
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
