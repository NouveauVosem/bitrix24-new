<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

if (!$USER->IsAuthorized()) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    die;
}

\CModule::IncludeModule('crm');

$dealId = (int)($_POST['dealId'] ?? 0);
$rowId  = (int)($_POST['rowId']  ?? 0);

if (!$dealId || !$rowId) {
    echo json_encode(['status' => 'error', 'message' => 'dealId and rowId are required']);
    die;
}

$rows     = \CCrmDeal::LoadProductRows($dealId) ?: [];
$filtered = [];
$found    = false;

foreach ($rows as $row) {
    if (!$found && (int)$row['ID'] === $rowId) {
        $found = true;
        continue;
    }
    $filtered[] = $row;
}

if (!$found) {
    echo json_encode(['status' => 'error', 'message' => 'Row not found', 'rowId' => $rowId]);
    die;
}

\CCrmDeal::SaveProductRows($dealId, $filtered);
echo json_encode(['status' => 'success']);
