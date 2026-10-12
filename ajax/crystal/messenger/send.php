<?php
/**
 * Відправка повідомлення з Crystal у WhatsApp-чат відкритої лінії.
 *
 * Crystal (bitrix-sender.service) шле POST JSON:
 *   { chatId, text, crystalId, userId, ts }
 *   chatId    — CHAT_ID чату відкритої лінії (той, що прийшов у вебхуку);
 *   userId    — ID користувача Битрикса, від імені якого пишемо (User.bitrixId);
 *   crystalId — id повідомлення в Crystal, зберігається в PARAMS.CRYSTAL_ID;
 *   ts        — unix-час запиту, старіші за 5 хв відхиляються.
 * Заголовок X-Crystal-Signature: sha256=HMAC(body, secret) — той самий секрет,
 * що в Messenger/config.php для вебхука.
 *
 * Повідомлення додається в чат як від оператора — далі конектор відкритої
 * лінії (Twilio) сам відправляє його клієнту, а OpenLinesHandler віддає
 * в Crystal вебхук з crystalId (він приходить раніше за відповідь цього скрипта).
 *
 * Відповідь: { ok: true, messageId } або { error } з кодом 4xx/5xx.
 * Повтор з тим самим crystalId не дублює повідомлення — повертає вже додане.
 */
define('NO_KEEP_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', true);
define('NO_AGENT_CHECK', true);

require($_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php');

use Bitrix\Main\Loader;
use Messenger\OpenLinesHandler;

header('Content-Type: application/json; charset=utf-8');

function sendReply($status, $data)
{
	http_response_code($status);
	echo json_encode($data, JSON_UNESCAPED_UNICODE);
	die();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
	sendReply(405, ['error' => 'POST only']);
}

$config = OpenLinesHandler::config();
if (!$config) {
	sendReply(503, ['error' => 'Інтеграцію не налаштовано (Messenger/config.php)']);
}

$body = file_get_contents('php://input');
$signature = (string)($_SERVER['HTTP_X_CRYSTAL_SIGNATURE'] ?? '');
if (!hash_equals('sha256=' . hash_hmac('sha256', $body, $config['secret']), $signature)) {
	sendReply(401, ['error' => 'Підпис не збігся']);
}

$request = json_decode($body, true);
if (!is_array($request)) {
	sendReply(400, ['error' => 'Тіло — не JSON']);
}

if (abs(time() - (int)($request['ts'] ?? 0)) > 300) {
	sendReply(401, ['error' => 'Запит застарів — перевірте годинник сервера']);
}

$chatId = (int)($request['chatId'] ?? 0);
$userId = (int)($request['userId'] ?? 0);
$text = trim((string)($request['text'] ?? ''));
$crystalId = (string)($request['crystalId'] ?? '');

if ($chatId <= 0 || $userId <= 0 || $text === '' || !preg_match('/^[0-9a-f-]{36}$/i', $crystalId)) {
	sendReply(400, ['error' => 'Потрібні chatId, userId, text, crystalId']);
}

if (!Loader::includeModule('im')) {
	sendReply(500, ['error' => 'Модуль im недоступний']);
}

// Тільки WhatsApp-чати відкритої лінії — інші чати Битрикса Crystal не чіпає
$chat = \Bitrix\Im\Model\ChatTable::getList([
	'select' => ['ID', 'ENTITY_TYPE', 'ENTITY_ID'],
	'filter' => ['=ID' => $chatId],
])->fetch();
if (!$chat || $chat['ENTITY_TYPE'] !== 'LINES' || strpos((string)$chat['ENTITY_ID'], OpenLinesHandler::CONNECTOR . '|') !== 0) {
	sendReply(404, ['error' => 'Чат WhatsApp відкритої лінії не знайдено']);
}

// Повтор (Crystal не дочекався відповіді) — те саме повідомлення, без дубля
$existing = \Bitrix\Im\Model\MessageParamTable::getList([
	'select' => ['MESSAGE_ID'],
	'filter' => ['=PARAM_NAME' => 'CRYSTAL_ID', '=PARAM_VALUE' => $crystalId],
	'limit'  => 1,
])->fetch();
if ($existing) {
	sendReply(200, ['ok' => true, 'messageId' => (int)$existing['MESSAGE_ID'], 'duplicate' => true]);
}

$user = \CUser::GetByID($userId)->Fetch();
if (!$user || $user['ACTIVE'] !== 'Y') {
	sendReply(400, ['error' => 'Користувача Битрикса ' . $userId . ' не знайдено або він неактивний']);
}

// SKIP_USER_CHECK: писати може менеджер, якого немає в чаті (не відповідальний оператор)
$messageId = \CIMChat::AddMessage([
	'TO_CHAT_ID'      => $chatId,
	'FROM_USER_ID'    => $userId,
	'MESSAGE'         => $text,
	'PARAMS'          => ['CRYSTAL_ID' => $crystalId],
	'SKIP_USER_CHECK' => 'Y',
]);

if (!$messageId) {
	global $APPLICATION;
	$exception = $APPLICATION->GetException();
	$error = $exception ? $exception->GetString() : 'Битрикс не додав повідомлення';
	OpenLinesHandler::log(['SEND_FROM_CRYSTAL_FAILED' => $crystalId, 'CHAT_ID' => $chatId, 'ERROR' => $error]);
	sendReply(500, ['error' => $error]);
}

sendReply(200, ['ok' => true, 'messageId' => (int)$messageId]);
