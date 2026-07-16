<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

// Пользователи, которым разрешено бронировать реальную доставку у перевозчиков.
// Список правится прямо здесь — изменения применяются сразу, без деплоя фронтенда.
const ALLOWED_ORDER_USER_IDS = [19, 8];

// Реальные адреса перевозчиков — не раскрываются на фронтенде, только это соответствие.
const ORDER_ENDPOINTS = [
    'dsv' => 'https://alvla.services/api/dsvorder',
];

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Accel-Buffering: no');

function sendSseErrorAndExit(string $message): void
{
    echo "event: error\n";
    echo 'data: ' . json_encode(['error' => $message], JSON_UNESCAPED_UNICODE) . "\n\n";
    if (function_exists('flush')) {
        flush();
    }
    exit;
}

if (!$USER->IsAuthorized()) {
    http_response_code(401);
    sendSseErrorAndExit('Unauthorized');
}

if (!in_array((int)$USER->GetID(), ALLOWED_ORDER_USER_IDS, true)) {
    http_response_code(403);
    sendSseErrorAndExit('Недостаточно прав для заказа доставки');
}

$carrierKey = isset($_GET['carrier']) ? strtolower(trim((string)$_GET['carrier'])) : '';
if (!isset(ORDER_ENDPOINTS[$carrierKey])) {
    http_response_code(400);
    sendSseErrorAndExit('Неизвестный или неподключённый перевозчик');
}

$rawBody = file_get_contents('php://input');

$ch = curl_init(ORDER_ENDPOINTS[$carrierKey]);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $rawBody,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_TIMEOUT => 300,
    CURLOPT_WRITEFUNCTION => function ($handle, $chunk) {
        echo $chunk;
        if (function_exists('flush')) {
            flush();
        }
        return strlen($chunk);
    },
]);

curl_exec($ch);

if (curl_errno($ch)) {
    curl_close($ch);
    sendSseErrorAndExit('Ошибка соединения с сервисом перевозчика');
}

curl_close($ch);
