<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';
require_once $_SERVER['DOCUMENT_ROOT'] . '/local/ajax/crest/crest.php';

header('Content-Type: application/json; charset=utf-8');

if (!$USER->IsAuthorized()) { die(json_encode(['error' => 'Unauthorized'])); }

$dealId = (int)($_GET['dealId'] ?? 0);
if (!$dealId) { die(json_encode(['error' => 'Pass ?dealId=XXX'])); }

// Полный сырой ответ CRest
$rawGet  = CRest::call('crm.deal.productrows.get', ['id' => $dealId]);
$rawDeal = CRest::call('crm.deal.get', ['id' => $dealId]);

// Попробуем и через прямой ORM Битрикс без REST
\CModule::IncludeModule('crm');
$ormRows = \CCrmDeal::LoadProductRows($dealId);

echo json_encode([
    'crest_productrows_raw' => $rawGet,
    'crest_deal_raw'        => $rawDeal,
    'orm_product_rows'      => $ormRows,
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
