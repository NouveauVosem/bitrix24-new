<?php
use Bitrix\Main\Loader;
use Bitrix\Main\Page\Asset;
use CUtil;

spl_autoload_register(function ($className) {
    $classesDir = __DIR__ . '/classes/';
    $classFile = $classesDir . str_replace('\\', '/', $className) . '.php';
    if (file_exists($classFile)) {
        require_once $classFile;
    }
});
include_once $_SERVER['DOCUMENT_ROOT'].'/local/php_interface/events.php';

AddEventHandler("main", "OnProlog", "addCustomAssets");

function addCustomAssets() {

    $asset = Asset::getInstance();

    $asset->addJs("/local/js/custom.js");
    //$asset->addJs("/local/js/add_to_grid_menu.js");
    $asset->addJs("/local/js/mail_disable_attachments/mail_disable_attachments.js");
    $asset->addJs("/local/js/main_email_templates/main_email_templates.js");
	
	$asset->addJs("/local/grid_documents/menu.js");
	$asset->addJs("/local/js/deal_crystal_btn.js");
	$asset->addCss("/local/js/deal_crystal_btn.css");

}

// Видаляємо дублікати куків (встановлені на кількох доменах одночасно)
//це тимчасове рішення, згодом можна видалити
\Bitrix\Main\EventManager::getInstance()->AddEventHandler(
    'main',
    'OnProlog',
    function () {

        $raw = $_SERVER['HTTP_COOKIE'] ?? '';

        $counts = [];
        foreach (explode(';', $raw) as $pair) {
            $name = trim(explode('=', $pair, 2)[0]);
            if ($name !== '') {
                $counts[$name] = ($counts[$name] ?? 0) + 1;
            }
        }
        $duplicates = array_keys(array_filter($counts, fn($c) => $c > 1));

        if (empty($duplicates)) {
            return;
        }

        $host = ltrim($_SERVER['HTTP_HOST'] ?? '', '.');
        $parts = explode('.', $host);
        $parentDomain = count($parts) > 2 ? implode('.', array_slice($parts, 1)) : '';

        $domainsToTry = array_filter([
            $host,
            '.' . $host,
            $parentDomain ? '.' . $parentDomain : null,
            '',              // без домену (браузерний дефолт)
        ], fn($d) => $d !== null);

        $past = time() - 3600;
        foreach ($duplicates as $name) {
            foreach ($domainsToTry as $domain) {
                setcookie($name, '', $past, '/', $domain);
            }
        }
    }
);