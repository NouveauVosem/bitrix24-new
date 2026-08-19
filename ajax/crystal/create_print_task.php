<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

// ID по умолчанию — Лиля (используется если responsibleId не передан)
define('DEFAULT_RESPONSIBLE_ID', 53);

if (!CModule::IncludeModule('tasks')) {
    echo json_encode(['status' => 'error', 'message' => 'Tasks module not available']);
    die();
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];

$printJobId      = trim($input['printJobId'] ?? '');
$sourceTaskId    = (int)($input['taskId'] ?? 0);
$dealId          = (int)($input['dealId'] ?? 0);
$client          = trim($input['client'] ?? '');
$fileName        = trim($input['fileName'] ?? '');
$settingsSummary = trim($input['settingsSummary'] ?? '');
$responsibleId   = (int)($input['responsibleId'] ?? DEFAULT_RESPONSIBLE_ID);

if (!$printJobId) {
    echo json_encode(['status' => 'error', 'message' => 'printJobId required']);
    die();
}

$baseUrl = (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];
$taskLink = $sourceTaskId ? $baseUrl . '/company/personal/user/0/tasks/task/view/' . $sourceTaskId . '/' : '';

$title = 'Печать' . ($fileName ? ': ' . $fileName : '') . ($client ? ' / ' . $client : '');

$descParts = [];
if ($sourceTaskId) {
    $descParts[] = 'Задача-источник: [URL=' . $taskLink . ']#' . $sourceTaskId . '[/URL]';
}
if ($dealId) {
    $descParts[] = 'Сделка: [URL=' . $baseUrl . '/crm/deal/details/' . $dealId . '/]#' . $dealId . '[/URL]';
}
$descParts[] = 'PrintJob ID: ' . $printJobId;
if ($settingsSummary) {
    $descParts[] = '[B]Настройки печати:[/B]' . "\n" . $settingsSummary;
}
$descParts[] = '[I]Откройте задачу-источник → чип "Печати" → скачайте файл и подтвердите выполнение.[/I]';

$description = implode("\n\n", $descParts);

$arFields = [
    'TITLE'           => $title,
    'DESCRIPTION'     => $description,
    'RESPONSIBLE_ID'  => $responsibleId,
    'CREATED_BY'      => $GLOBALS['USER']->GetID(),
    'PRIORITY'        => 1,
];

if ($sourceTaskId) {
    $arFields['UF_CRM_TASK'] = ['T_' . $sourceTaskId];
}
if ($dealId) {
    $arFields['UF_CRM_TASK'] = array_merge($arFields['UF_CRM_TASK'] ?? [], ['D_' . $dealId]);
}

$task = new CTaskItem(0, $GLOBALS['USER']->GetID());
$result = CTaskItem::add($arFields, $GLOBALS['USER']->GetID());

if (!$result || !is_object($result)) {
    echo json_encode(['status' => 'error', 'message' => 'Failed to create task']);
    die();
}

$newTaskId = $result->getId();

echo json_encode([
    'status'     => 'success',
    'taskId'     => $newTaskId,
    'taskUrl'    => $baseUrl . '/company/personal/user/0/tasks/task/view/' . $newTaskId . '/',
], JSON_UNESCAPED_UNICODE);
