<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

if (!CModule::IncludeModule('tasks') || !CModule::IncludeModule('crm')) {
    echo json_encode(['status' => 'error', 'message' => 'Tasks or CRM module not available']);
    die();
}

$taskId = (int)($_GET['taskId'] ?? $_POST['taskId'] ?? 0);
if (!$taskId) {
    echo json_encode(['status' => 'error', 'message' => 'taskId required']);
    die();
}

$res = \CTasks::GetList([], ['ID' => $taskId], ['ID', 'TITLE', 'UF_CRM_TASK']);
$task = $res->Fetch();
if (!$task) {
    echo json_encode(['status' => 'error', 'message' => 'Task not found']);
    die();
}

$dealId = null;
$ufCrmTask = $task['UF_CRM_TASK'] ?? [];
if (is_array($ufCrmTask)) {
    foreach ($ufCrmTask as $bind) {
        // формат "D_105" — сделка с ID 105
        if (preg_match('/^D_(\d+)$/', $bind, $m)) {
            $dealId = (int)$m[1];
            break;
        }
    }
}

$client = null;
if ($dealId) {
    $deal = CCrmDeal::GetByID($dealId);
    $companyId = (int)($deal['COMPANY_ID'] ?? 0);
    if ($companyId > 0) {
        $c = CCrmCompany::GetByID($companyId);
        if ($c) {
            $client = $c['TITLE'];
        }
    }
}

echo json_encode([
    'status' => 'success',
    'taskId' => $taskId,
    'taskTitle' => $task['TITLE'],
    'dealId' => $dealId,
    'client' => $client,
], JSON_UNESCAPED_UNICODE);
