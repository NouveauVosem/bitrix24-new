<?php

namespace Messenger;

/**
 * Мост "відкриті лінії Bitrix24 (WhatsApp через Twilio) -> Crystal".
 *
 * Кожне повідомлення WhatsApp-чату відкритої лінії (вхідне від клієнта,
 * відповідь оператора, автовідповідь) відправляється вебхуком у Crystal
 * (номер "WhatsApp (Битрикс)", /messengers/bitrix/webhook/<id>).
 * Адреса і секрет — у config.php поруч (не в git), його вміст береться
 * з екрана "Подключение" номера в Crystal.
 */
class OpenLinesHandler
{
	// Повний дамп кожного повідомлення відкритих ліній у лог — для налагодження
	const LOG_ENABLED = false;

	const LOG_DIR = '/local/logs/messenger/';

	const CONNECTOR = 'whatsappbytwilio';

	// Обробник виконується синхронно з відправкою повідомлення в чаті
	const HTTP_TIMEOUT = 3;

	/**
	 * im / OnAfterMessagesAdd
	 * Викликається як ($messageId, $messageFields).
	 */
	public static function onAfterMessagesAdd($messageId, $messageFields = [])
	{
		// Обробник не повинен ламати відправку повідомлень у чаті
		try {
			if (!self::isOpenLinesMessage($messageFields)) {
				return;
			}

			if (self::LOG_ENABLED) {
				self::log(['MESSAGE_ID' => $messageId, 'FIELDS' => $messageFields]);
			}

			$payload = self::buildPayload((int)$messageId, $messageFields);
			if ($payload) {
				self::send($payload);
			}
		} catch (\Throwable $e) {
			self::log(['ERROR' => $e->getMessage(), 'MESSAGE_ID' => $messageId]);
		}
	}

	private static function isOpenLinesMessage($fields)
	{
		if (!is_array($fields)) {
			return false;
		}

		return ($fields['MESSAGE_TYPE'] ?? '') === 'L'
			|| ($fields['CHAT_ENTITY_TYPE'] ?? '') === 'LINES';
	}

	/**
	 * Повідомлення -> вебхук Crystal; null — не наш чат або службове.
	 *
	 * CHAT_ENTITY_ID: "конектор|лінія|whatsapp:+номер|ID користувача-клієнта".
	 * Напрямок:
	 *   AUTHOR_ID = клієнт                       -> inbound;
	 *   AUTHOR_ID > 0                            -> outbound (оператор);
	 *   AUTHOR_ID = 0 і IMPORTANT_CONNECTOR = Y  -> outbound (автовідповідь пішла клієнту);
	 *   інакше                                   -> службове, клієнт його не бачить.
	 * Скритих повідомлень ("//...") у цього конектора немає — Twilio шле все.
	 */
	private static function buildPayload($messageId, $fields)
	{
		$parts = explode('|', (string)($fields['CHAT_ENTITY_ID'] ?? ''));
		if ($parts[0] !== self::CONNECTOR || count($parts) < 4) {
			return null;
		}
		$clientUserId = (int)$parts[3];
		$authorId = (int)($fields['AUTHOR_ID'] ?? 0);

		$auto = false;
		if ($authorId > 0 && $authorId === $clientUserId) {
			$direction = 'inbound';
		} elseif ($authorId > 0) {
			$direction = 'outbound';
		} elseif (($fields['IMPORTANT_CONNECTOR'] ?? 'N') === 'Y') {
			$direction = 'outbound';
			$auto = true;
		} else {
			return null;
		}

		$files = [];
		foreach ((array)($fields['FILES'] ?? []) as $file) {
			$files[] = [
				'id'   => (int)($file['id'] ?? 0),
				'name' => (string)($file['name'] ?? ''),
				'size' => (int)($file['size'] ?? 0),
				'type' => (string)($file['type'] ?? ''),
			];
		}

		return [
			'event'      => 'message',
			'messageId'  => $messageId,
			'chatId'     => (int)($fields['CHAT_ID'] ?? 0),
			'lineId'     => $parts[1],
			'phone'      => $parts[2],
			'clientName' => self::userName($clientUserId),
			'direction'  => $direction,
			'auto'       => $auto,
			'authorId'   => $authorId,
			'authorName' => $direction === 'outbound' && !$auto ? self::userName($authorId) : null,
			'text'       => (string)($fields['MESSAGE'] ?? ''),
			'sentAt'     => date('c'),
			'files'      => $files,
		];
	}

	private static function userName($userId)
	{
		if ($userId <= 0) {
			return null;
		}
		$user = \CUser::GetByID($userId)->Fetch();
		if (!$user) {
			return null;
		}
		$name = trim(($user['NAME'] ?? '') . ' ' . ($user['LAST_NAME'] ?? ''));

		return $name !== '' ? $name : null;
	}

	private static function send($payload)
	{
		$config = self::config();
		if (!$config) {
			return;
		}

		$body = json_encode($payload, JSON_UNESCAPED_UNICODE);

		$http = new \Bitrix\Main\Web\HttpClient([
			'socketTimeout'          => self::HTTP_TIMEOUT,
			'streamTimeout'          => self::HTTP_TIMEOUT,
			'waitResponse'           => true,
			'disableSslVerification' => false,
		]);
		$http->setHeader('Content-Type', 'application/json');
		$http->setHeader('X-Crystal-Signature', 'sha256=' . hash_hmac('sha256', $body, $config['secret']));

		$result = $http->post($config['webhook_url'], $body);
		$status = $http->getStatus();

		if ($result === false || $status !== 200) {
			// Повтору поки немає: повідомлення лишається тільки в Битриксі
			self::log([
				'SEND_FAILED' => $payload['messageId'],
				'STATUS'      => $status,
				'ERROR'       => $result === false ? $http->getError() : $result,
			]);
		}
	}

	/** config.php: ['webhook_url' => ..., 'secret' => ...]; null — інтеграцію не налаштовано */
	private static function config()
	{
		static $config = false;
		if ($config === false) {
			$file = __DIR__ . '/config.php';
			$loaded = file_exists($file) ? include $file : null;
			$config = is_array($loaded) && !empty($loaded['webhook_url']) && !empty($loaded['secret']) ? $loaded : null;
		}

		return $config;
	}

	private static function log($data)
	{
		$dir = $_SERVER['DOCUMENT_ROOT'] . self::LOG_DIR;
		if (!is_dir($dir)) {
			mkdir($dir, 0775, true);
		}

		// Файл .php з exit на початку: nginx віддає статику з /local напряму,
		// а в лозі персональні дані клієнтів
		$file = $dir . 'openlines_' . date('Y-m-d') . '.php';
		if (!file_exists($file)) {
			file_put_contents($file, "<?php exit; ?>\n");
		}

		$text = '==== ' . date('d.m.Y H:i:s') . " ====\n" . print_r($data, true) . "\n";
		file_put_contents($file, $text, FILE_APPEND | LOCK_EX);
	}
}
