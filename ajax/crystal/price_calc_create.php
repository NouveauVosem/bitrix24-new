<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

if (!$USER->IsAuthorized()) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit;
}

$rawBody = file_get_contents('php://input');

$ch = curl_init('https://crystal.alvla.tools/api/price-calculations/crm/create');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $rawBody,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'X-Api-Key: legenda',
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 30,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    curl_close($ch);
    http_response_code(502);
    echo json_encode(['status' => 'error', 'message' => 'Ошибка соединения с Crystal API']);
    exit;
}

curl_close($ch);

http_response_code($httpCode);
echo $response;
