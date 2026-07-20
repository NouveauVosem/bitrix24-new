<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

if (!CModule::IncludeModule('crm')) {
    echo json_encode(['status' => 'error']);
    die();
}

$dealId = (int)($_GET['dealId'] ?? 0);
if (!$dealId) {
    echo json_encode(['status' => 'error']);
    die();
}

global $USER_FIELD_MANAGER;
$ufFields = $USER_FIELD_MANAGER->GetUserFields('CRM_DEAL', $dealId, LANGUAGE_ID);

$fileId = $ufFields['UF_CRM_1718262714695']['VALUE'] ?? null;
if (!$fileId) {
    echo json_encode(['status' => 'empty']);
    die();
}

$fileArr = \CFile::GetFileArray($fileId);
if (!$fileArr) {
    echo json_encode(['status' => 'empty']);
    die();
}

echo json_encode([
    'status'   => 'success',
    'url'      => $fileArr['SRC'],
    'filename' => $fileArr['ORIGINAL_NAME'] ?: $fileArr['FILE_NAME'],
]);
