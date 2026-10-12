<?php
/**
 * Перегляд логів Messenger\OpenLinesHandler у браузері (лише адміністратори).
 * /local/ajax/crystal/messenger/logs.php            — список файлів
 * /local/ajax/crystal/messenger/logs.php?date=Y-m-d — вміст логу за дату
 */
define('NO_KEEP_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', false);

require($_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php');

header('Content-Type: text/html; charset=utf-8');

global $USER;
if (!$USER->IsAuthorized() || !$USER->IsAdmin()) {
	http_response_code(403);
	echo 'Access denied';
	die();
}

$dir = $_SERVER['DOCUMENT_ROOT'] . '/local/logs/messenger/';
$date = (string)($_GET['date'] ?? '');

echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Messenger logs</title>'
	. '<style>body{font-family:sans-serif;margin:16px}pre{background:#f4f4f4;padding:12px;white-space:pre-wrap;word-break:break-word}</style>'
	. '</head><body>';

if ($date === '') {
	$files = is_dir($dir) ? glob($dir . 'openlines_*.php') : [];
	rsort($files);

	echo '<h3>Логи відкритих ліній</h3>';
	if (!$files) {
		echo '<p>Логів ще немає.</p>';
	}
	foreach ($files as $file) {
		if (preg_match('/openlines_(\d{4}-\d{2}-\d{2})\.php$/', $file, $m)) {
			echo '<div><a href="?date=' . $m[1] . '">' . $m[1] . '</a> (' . round(filesize($file) / 1024, 1) . ' KB)</div>';
		}
	}
} else {
	// Дата лише у форматі Y-m-d — захист від path traversal
	if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
		echo 'Invalid date';
		die();
	}

	$file = $dir . 'openlines_' . $date . '.php';
	echo '<p><a href="?">&larr; до списку</a></p><h3>' . $date . '</h3>';

	if (!file_exists($file)) {
		echo '<p>Файл не знайдено.</p>';
	} else {
		// Перший рядок — захисний php exit, прибираємо його з виводу
		$content = preg_replace('/^[^\n]*\n/', '', file_get_contents($file));
		echo '<pre>' . htmlspecialchars($content) . '</pre>';
	}
}

echo '</body></html>';
