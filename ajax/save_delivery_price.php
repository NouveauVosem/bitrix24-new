<?php
define('NOT_CHECK_PERMISSIONS', true);
define('NO_KEEP_STATISTIC', true);
define('BX_SECURITY_SESSION_READONLY', true);
require_once($_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include.php');
\Bitrix\Main\Loader::includeModule('crm');

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

$data   = json_decode(file_get_contents('php://input'), true);
$dealId = intval($data['dealId'] ?? 0);
$price  = $data['price'] ?? null;
$secret = $data['secret'] ?? '';
$field  = $data['field'] ?? 'UF_CRM_1774000644830'; // по умолчанию Rhenus

$allowedFields = [
    'UF_CRM_1774000644830', // Rhenus
    'UF_CRM_1774000685589', // Schenker
    'UF_CRM_1774000702384', // Raben
];
if (!in_array($field, $allowedFields, true)) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid field']);
    exit;
}

// Проверяем секретный ключ — только alvla.services может сюда писать
$expectedSecret = 'crm_alvla_secret_2026';
if ($secret !== $expectedSecret) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit;
}

if (!$dealId || $price === null) {
    echo json_encode(['status' => 'error', 'message' => 'Missing dealId or price']);
    exit;
}

$fields = [$field => $price];
$deal = new \CCrmDeal(false);
$result = $deal->Update($dealId, $fields);

$log = date('Y-m-d H:i:s') . " dealId=$dealId price=$price result=" . ($result ? 'true' : 'false') . " errors=" . implode('; ', $deal->LAST_ERROR ?? []) . "\n";
file_put_contents(__DIR__ . '/save_delivery_log.txt', $log, FILE_APPEND);

if ($result) {
    echo json_encode(['status' => 'success', 'message' => 'Saved']);
} else {
    echo json_encode(['status' => 'error', 'message' => 'Failed to update deal']);
}
