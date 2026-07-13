<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

if (!CModule::IncludeModule('crm')) {
    echo json_encode(['status' => 'error', 'message' => 'CRM module not available']);
    die();
}

$dealId = (int)($_POST['dealId'] ?? 0);
if (!$dealId) {
    echo json_encode(['status' => 'error', 'message' => 'dealId required']);
    die();
}

$deal = CCrmDeal::GetByID($dealId);
if (!$deal) {
    echo json_encode(['status' => 'error', 'message' => 'Deal not found']);
    die();
}

$companyId = (int)($deal['COMPANY_ID'] ?? 0);
$company   = null;
if ($companyId > 0) {
    $c = CCrmCompany::GetByID($companyId);
    if ($c) {
        $company = ['id' => (int)$c['ID'], 'name' => $c['TITLE']];
    }
}

echo json_encode(['status' => 'success', 'company' => $company], JSON_UNESCAPED_UNICODE);
