<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', true);
require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

\Bitrix\Main\Loader::includeModule("crm");

// ── Авторизация ──────────────────────────────────────────────────────────────
define('CRYSTAL_API_TOKEN', 'Legenda');

$token = $_SERVER['HTTP_X_API_TOKEN'] ?? $_GET['token'] ?? $_POST['token'] ?? '';
if ($token !== CRYSTAL_API_TOKEN) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Unauthorized']);
    die();
}

// ── Публичные почтовые домены — совпадение по ним ни о чём не говорит ────────
$PUBLIC_EMAIL_DOMAINS = [
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.it', 'yahoo.fr',
    'hotmail.com', 'hotmail.it', 'outlook.com', 'live.com', 'icloud.com', 'me.com', 'aol.com',
    'protonmail.com', 'proton.me', 'zoho.com', 'gmx.com', 'gmx.de', 'gmx.net', 'mail.com',
    'web.de', 't-online.de', 'freenet.de',
    'seznam.cz', 'centrum.cz', 'email.cz',
    'wp.pl', 'onet.pl', 'interia.pl', 'o2.pl',
    'orange.fr', 'laposte.net', 'free.fr', 'wanadoo.fr',
    'libero.it', 'virgilio.it', 'alice.it', 'tiscali.it',
    'mail.ru', 'yandex.ru', 'yandex.com', 'rambler.ru',
    'ukr.net', 'i.ua', 'meta.ua',
    'qq.com', '163.com', '126.com', 'naver.com',
];

// ── Входные данные ────────────────────────────────────────────────────────────
$email = trim((string)($_GET['email'] ?? $_POST['email'] ?? ''));
$email = mb_strtolower($email);

$atPos = mb_strpos($email, '@');
if ($email === '' || $atPos === false) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'email is required']);
    die();
}

$strict = in_array(mb_strtolower((string)($_GET['strict'] ?? $_POST['strict'] ?? '')), ['1', 'true', 'yes'], true);

$limit = (int)($_GET['limit'] ?? $_POST['limit'] ?? 20);
if ($limit <= 0) $limit = 20;
if ($limit > 100) $limit = 100;

$domain = mb_substr($email, $atPos + 1);

// ── Поиск владельца email: сначала точное совпадение ─────────────────────────
$matchType = null;

$exactMatches = \Bitrix\Crm\FieldMultiTable::getList([
    'select' => ['ELEMENT_ID', 'ENTITY_ID'],
    'filter' => [
        '=TYPE_ID'   => 'EMAIL',
        '=VALUE'     => $email,
        '@ENTITY_ID' => ['CONTACT', 'COMPANY'],
    ],
])->fetchAll();

$matches = $exactMatches;
if (!empty($matches)) {
    $matchType = 'exact';
} elseif (!$strict && !in_array($domain, $PUBLIC_EMAIL_DOMAINS, true)) {
    // ── Фолбэк: поиск по домену (например angela@x.it не найден, но info@x.it есть) ──
    $domainCandidates = \Bitrix\Crm\FieldMultiTable::getList([
        'select' => ['ELEMENT_ID', 'ENTITY_ID', 'VALUE'],
        'filter' => [
            '=TYPE_ID'   => 'EMAIL',
            '%VALUE'     => '@' . $domain,
            '@ENTITY_ID' => ['CONTACT', 'COMPANY'],
        ],
    ])->fetchAll();

    // Уточняем LIKE-совпадение до строгого "заканчивается на @domain"
    $suffix = '@' . $domain;
    foreach ($domainCandidates as $row) {
        if (mb_substr(mb_strtolower($row['VALUE']), -mb_strlen($suffix)) === $suffix) {
            $matches[] = $row;
        }
    }

    if (!empty($matches)) {
        $matchType = 'domain';
    }
}

if (empty($matches)) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['found' => false, 'match_type' => null], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    die();
}

// ── Собираем найденных контактов/компании ────────────────────────────────────
$contactIds = [];
$companyIds = [];
foreach ($matches as $m) {
    if ($m['ENTITY_ID'] === 'CONTACT') $contactIds[] = (int)$m['ELEMENT_ID'];
    if ($m['ENTITY_ID'] === 'COMPANY') $companyIds[] = (int)$m['ELEMENT_ID'];
}
$contactIds = array_values(array_unique($contactIds));
$companyIds = array_values(array_unique($companyIds));

// Контакты — только базовые поля здесь, компанию подставим позже одной пачкой.
// Берём через ORM (ContactTable), а не CCrmContact::GetByID: легаси-API требует
// авторизованной сессии/прав пользователя и молча возвращает false при вызове
// без сессии (как раз наш случай — Кристал стучится без логина в Bitrix24).
$contactsRaw = [];
if (!empty($contactIds)) {
    $contactsFetched = \Bitrix\Crm\ContactTable::getList([
        'filter' => ['@ID' => $contactIds],
        'select' => ['ID', 'NAME', 'LAST_NAME', 'COMPANY_ID'],
    ])->fetchAll();
    foreach ($contactsFetched as $row) {
        $contactsRaw[$row['ID']] = $row;
    }
}

// ── Сделки найденных компаний/контактов ──────────────────────────────────────
$dealFilter = ['LOGIC' => 'OR'];
if (!empty($companyIds)) $dealFilter[] = ['@COMPANY_ID' => $companyIds];
if (!empty($contactIds)) $dealFilter[] = ['@CONTACT_ID' => $contactIds];

$dealSelect = [
    'ID', 'TITLE', 'DATE_CREATE', 'STAGE_ID', 'CURRENCY_ID', 'COMMENTS', 'COMPANY_ID', 'CONTACT_ID',
    'UF_CRM_1718024604516', // Базис поставки (Инкотермс)
    'UF_CRM_1718027018701', // Валюта сделки
    'UF_CRM_1741189617279', // Дата инвойса
];

$dealsRaw = \Bitrix\Crm\DealTable::getList([
    'filter' => $dealFilter,
    'select' => $dealSelect,
    'order'  => ['DATE_CREATE' => 'DESC'],
])->fetchAll();

$totalOrdersFound = count($dealsRaw);
$limitedDeals = array_slice($dealsRaw, 0, $limit);

// ── Компании: email-матчи + компании контактов + компании сделок — одной пачкой ──
// Так решается случай "у контакта несколько компаний": мы не гадаем, какая "главная",
// а подтягиваем название/страну под company_id, который реально стоит на каждом контакте/сделке.
$allCompanyIds = $companyIds;
foreach ($contactsRaw as $ct) {
    if (!empty($ct['COMPANY_ID'])) $allCompanyIds[] = (int)$ct['COMPANY_ID'];
}
foreach ($limitedDeals as $d) {
    if (!empty($d['COMPANY_ID'])) $allCompanyIds[] = (int)$d['COMPANY_ID'];
}
$allCompanyIds = array_values(array_unique($allCompanyIds));

// Берём через ORM (CompanyTable), а не CCrmCompany::GetByID — по той же причине,
// что и с контактами: легаси-API молча возвращает false без сессии пользователя.
$companyInfoMap = [];
if (!empty($allCompanyIds)) {
    $companiesFetched = \Bitrix\Crm\CompanyTable::getList([
        'filter' => ['@ID' => $allCompanyIds],
        'select' => ['ID', 'TITLE', 'UF_CRM_1717094712004'],
    ])->fetchAll();
    foreach ($companiesFetched as $row) {
        $companyInfoMap[$row['ID']] = [
            'id'      => (int)$row['ID'],
            'name'    => $row['TITLE'],
            'country' => $row['UF_CRM_1717094712004'],
        ];
    }
}

$companies = [];
foreach ($companyIds as $cid) {
    if (isset($companyInfoMap[$cid])) $companies[] = $companyInfoMap[$cid];
}

$contacts = [];
foreach ($contactsRaw as $ctid => $ct) {
    $contactCompanyId = (int)($ct['COMPANY_ID'] ?? 0);
    $contacts[] = [
        'id'              => $ctid,
        'name'            => trim(($ct['NAME'] ?? '') . ' ' . ($ct['LAST_NAME'] ?? '')),
        'company_id'      => $contactCompanyId,
        'company_name'    => $companyInfoMap[$contactCompanyId]['name'] ?? null,
        'company_country' => $companyInfoMap[$contactCompanyId]['country'] ?? null,
    ];
}

$orders = [];
if (!empty($limitedDeals)) {
    $dealIds = array_column($limitedDeals, 'ID');

    $productRowsRaw = \Bitrix\Crm\ProductRowTable::getList([
        'filter' => [
            '@OWNER_ID'    => $dealIds,
            '=OWNER_TYPE'  => 'D',
            '>PRICE'       => 0,
            '!=PRODUCT_ID' => 521,
        ],
        'select' => ['OWNER_ID', 'PRODUCT_NAME', 'PRODUCT_ID', 'PRICE', 'QUANTITY'],
    ])->fetchAll();

    $productsByDeal = [];
    foreach ($productRowsRaw as $row) {
        $productsByDeal[$row['OWNER_ID']][] = [
            'product_id' => $row['PRODUCT_ID'],
            'name'       => $row['PRODUCT_NAME'],
            'price'      => $row['PRICE'],
            'quantity'   => $row['QUANTITY'],
        ];
    }

    foreach ($limitedDeals as $d) {
        $dealCompanyId = (int)$d['COMPANY_ID'];
        $orders[] = [
            'deal_id'         => $d['ID'],
            'title'           => $d['TITLE'],
            'date'            => $d['DATE_CREATE'] ? (string)$d['DATE_CREATE'] : null,
            'stage_id'        => $d['STAGE_ID'],
            'currency'        => $d['UF_CRM_1718027018701'] ?: $d['CURRENCY_ID'],
            'incoterms'       => $d['UF_CRM_1718024604516'],
            'invoice_date'    => $d['UF_CRM_1741189617279'] ? (string)$d['UF_CRM_1741189617279'] : '',
            'comments'        => $d['COMMENTS'],
            'company_id'      => $dealCompanyId,
            'company_name'    => $companyInfoMap[$dealCompanyId]['name'] ?? null,
            'company_country' => $companyInfoMap[$dealCompanyId]['country'] ?? null,
            'contact_id'      => (int)$d['CONTACT_ID'],
            'products'        => $productsByDeal[$d['ID']] ?? [],
        ];
    }
}

// ── Ответ ─────────────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'found'              => true,
    'match_type'         => $matchType,
    'companies'          => $companies,
    'contacts'           => $contacts,
    'total_orders_found' => $totalOrdersFound,
    'truncated'          => $totalOrdersFound > count($orders),
    'orders'             => $orders,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
die();
