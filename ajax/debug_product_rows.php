<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';
require_once $_SERVER['DOCUMENT_ROOT'] . '/local/ajax/crest/crest.php';

header('Content-Type: application/json; charset=utf-8');

if (!$USER->IsAuthorized()) { die(json_encode(['error' => 'Unauthorized'])); }

$dealId = (int)($_GET['dealId'] ?? 0);
if (!$dealId) { die(json_encode(['error' => 'Pass ?dealId=XXX'])); }

// 1. Получаем текущие строки товаров
$getResult = CRest::call('crm.deal.productrows.get', ['id' => $dealId]);

// 2. Получаем поля самой сделки (сумма, валюта)
$dealResult = CRest::call('crm.deal.get', ['id' => $dealId]);

echo json_encode([
    'productrows_get'    => $getResult,
    'deal_opportunity'   => $dealResult['result']['OPPORTUNITY'] ?? null,
    'deal_currency'      => $dealResult['result']['CURRENCY_ID'] ?? null,
    'deal_category'      => $dealResult['result']['CATEGORY_ID'] ?? null,
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
