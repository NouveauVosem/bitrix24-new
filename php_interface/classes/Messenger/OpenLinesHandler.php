<?php

namespace Messenger;

/**
 * Мост "відкриті лінії Bitrix24 (WhatsApp через Twilio) -> Crystal".
 *
 * Етап 1: лише логування повідомлень відкритих ліній, щоб побачити
 * реальну структуру (ID конектора, лінії, чатів, PARAMS) перед відправкою в Crystal.
 */
class OpenLinesHandler
{
	// Вимикач логування без видалення обробника з events.php
	const LOG_ENABLED = true;

	const LOG_DIR = '/local/logs/messenger/';

	/**
	 * im / OnAfterMessagesAdd
	 * Викликається як ($messageId, $messageFields).
	 */
	public static function onAfterMessagesAdd($messageId, $messageFields = [])
	{
		if (!self::LOG_ENABLED) {
			return;
		}

		// Обробник не повинен ламати відправку повідомлень у чаті
		try {
			if (!self::isOpenLinesMessage($messageFields)) {
				return;
			}

			self::log([
				'MESSAGE_ID' => $messageId,
				'FIELDS'     => $messageFields,
			]);
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
