<?php
// Сборочный лист сделки: собирает товары сделки (артикул + суммарное к-во)
// и отправляет их в Crystal (/kits/sheet). Профили комплектации живут в Crystal.
//   ?dealId=N             → JSON: {status, kitsCount, kits[] (с drawings[]), missing[]}
//   ?dealId=N&format=pdf  → PDF сборочного листа (отдаётся как есть из Crystal)
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

const CRYSTAL_KITS_URL = 'https://crystal.alvla.tools/api/kits/sheet';
const CRYSTAL_API_KEY  = 'legenda';

$format = ($_GET['format'] ?? '') === 'pdf' ? 'pdf' : 'json';

function kitFail($code, $message, $format)
{
    http_response_code($code);
    if ($format === 'pdf') {
        header('Content-Type: text/plain; charset=utf-8');
        echo $message;
    } else {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['status' => 'error', 'message' => $message], JSON_UNESCAPED_UNICODE);
    }
    die();
}

if (!$USER->IsAuthorized()) {
    kitFail(401, 'Unauthorized', $format);
}

if (!CModule::IncludeModule('crm') || !CModule::IncludeModule('iblock')) {
    kitFail(500, 'Модули crm/iblock недоступны', $format);
}

$dealId = (int)($_GET['dealId'] ?? 0);
if (!$dealId) {
    kitFail(400, 'dealId required', $format);
}

$deal = \Bitrix\Crm\DealTable::getList([
    'filter' => ['=ID' => $dealId],
    'select' => ['ID', 'TITLE', 'COMPANY_ID', 'CONTACT_ID'],
])->fetch();
if (!$deal) {
    kitFail(404, 'Сделка не найдена', $format);
}

// ── Клиент для титула: компания, если нет — контакт ─────────────────────────
$clientName = '';
if ((int)$deal['COMPANY_ID'] > 0) {
    $company = \CCrmCompany::GetByID((int)$deal['COMPANY_ID'], false);
    $clientName = trim((string)($company['TITLE'] ?? ''));
}
if ($clientName === '' && (int)$deal['CONTACT_ID'] > 0) {
    $contact = \CCrmContact::GetByID((int)$deal['CONTACT_ID'], false);
    if ($contact) {
        $clientName = trim((string)($contact['FULL_NAME'] ?? ''));
        if ($clientName === '') {
            $clientName = trim(($contact['NAME'] ?? '') . ' ' . ($contact['LAST_NAME'] ?? ''));
        }
    }
}

// ── Строки товаров сделки ────────────────────────────────────────────────────
$productRows = \Bitrix\Crm\ProductRowTable::getList([
    'filter' => ['=OWNER_TYPE' => 'D', '=OWNER_ID' => $dealId],
    'select' => ['PRODUCT_ID', 'PRODUCT_NAME', 'QUANTITY'],
    'order'  => ['SORT' => 'ASC', 'ID' => 'ASC'],
])->fetchAll();

if (empty($productRows)) {
    kitFail(400, 'В сделке нет товаров', $format);
}

// ── Артикулы товаров каталога ────────────────────────────────────────────────
// Как в get_product_article.php: ARTNUMBER, а если пуст — артикул из начала NAME.
// trim() обязателен: Crystal ищет артикул точным совпадением строки.
// Хвост Вентуры («11.1780.5 нв») срезаем — Crystal ждёт чистый артикул.
$productIds = array_values(array_unique(array_filter(array_map('intval', array_column($productRows, 'PRODUCT_ID')))));
$catalog = [];
if (!empty($productIds)) {
    $dbEl = \CIBlockElement::GetList([], ['ID' => $productIds], false, false, ['ID', 'IBLOCK_ID', 'NAME']);
    while ($el = $dbEl->Fetch()) {
        $article = '';
        $dbProp = \CIBlockElement::GetProperty($el['IBLOCK_ID'], $el['ID'], [], ['CODE' => 'ARTNUMBER']);
        if ($prop = $dbProp->Fetch()) {
            $article = trim(preg_replace('/\s+нв\.?$/iu', '', trim((string)$prop['VALUE'])));
        }
        $catalog[(int)$el['ID']] = ['name' => $el['NAME'], 'article' => $article];
    }
}

// ── Суммируем одинаковые товары ──────────────────────────────────────────────
$rows = [];
foreach ($productRows as $r) {
    $productId = (int)$r['PRODUCT_ID'];
    $name      = trim((string)($catalog[$productId]['name'] ?? $r['PRODUCT_NAME']));
    $article   = $catalog[$productId]['article'] ?? '';
    if ($article === '') {
        $article = preg_match('/\d+\.\d+\.\d+/', $name . ' ' . $r['PRODUCT_NAME'], $m) ? $m[0] : '';
    }

    // Товар без PRODUCT_ID (введён вручную) группируем по артикулу, иначе по названию.
    $key = $productId ? 'id:' . $productId : ($article !== '' ? 'art:' . $article : 'name:' . $name);

    if (!isset($rows[$key])) {
        $rows[$key] = [
            'bitrixProductId' => $productId ?: null,
            'article'         => $article !== '' ? $article : null,
            'name'            => $name,
            'quantity'        => 0,
        ];
    }
    $rows[$key]['quantity'] += (float)$r['QUANTITY'];
}

$payload = [
    'dealId'    => $dealId,
    'dealTitle' => $deal['TITLE'],
    'cover'     => true,
    'rows'      => array_values($rows),
];
if ($clientName !== '') {
    $payload['clientName'] = $clientName;
}

// ── Тексты для титула: рекомендация по упаковке и комментарий к сборке ──────
// UF-поля читаем через CCrmDeal::GetByID — DealTable::getList их не отдаёт.
$dealUf = \CCrmDeal::GetByID($dealId, false) ?: [];
$ufText = function ($value) {
    if (is_array($value)) {
        $value = implode("\n", array_filter(array_map('trim', array_map('strval', $value)), 'strlen'));
    }
    return trim((string)$value);
};
$packingRecommendation = $ufText($dealUf['UF_CRM_1793872168579'] ?? '');
$assemblyComment       = $ufText($dealUf['UF_CRM_1793872179793'] ?? '');
if ($packingRecommendation !== '') {
    $payload['packingRecommendation'] = $packingRecommendation;
}
if ($assemblyComment !== '') {
    $payload['assemblyComment'] = $assemblyComment;
}
$payload = json_encode($payload, JSON_UNESCAPED_UNICODE);

// ── Запрос в Crystal ─────────────────────────────────────────────────────────
$ch = curl_init(CRYSTAL_KITS_URL . ($format === 'pdf' ? '/pdf' : ''));
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'X-Api-Key: ' . CRYSTAL_API_KEY,
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 60,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_errno($ch) ? curl_error($ch) : '';
curl_close($ch);

if ($curlErr) {
    kitFail(502, 'Ошибка соединения с Crystal: ' . $curlErr, $format);
}
if ($httpCode !== 200) {
    $err = json_decode($response, true);
    kitFail(502, 'Crystal вернул ' . $httpCode . (!empty($err['message']) ? ': ' . $err['message'] : ''), $format);
}

if ($format === 'pdf') {
    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="kit_sheet_' . $dealId . '.pdf"');
    echo $response;
    die();
}

// Фронту нужна сводка + ссылки на чертежи (в PDF их нет). Позиции комплектов смотрят в PDF.
$sheet = json_decode($response, true);
$kits = [];
foreach ($sheet['blocks'] ?? [] as $b) {
    $kits[] = [
        'article'  => $b['row']['article'] ?? null,
        'name'     => $b['row']['name'] ?? '',
        'quantity' => $b['row']['quantity'] ?? 0,
        'profile'  => $b['profile']['name'] ?? '',
        'drawings' => array_values(array_filter(array_map(function ($d) {
            return empty($d['url']) ? null : [
                'name' => $d['originalName'] ?? 'чертёж',
                'url'  => $d['url'],
                'size' => (int)($d['size'] ?? 0),
            ];
        }, $b['drawings'] ?? []))),
    ];
}
$missing = [];
foreach ($sheet['missing'] ?? [] as $m) {
    $missing[] = [
        'article'  => $m['article'] ?? null,
        'name'     => $m['name'] ?? '',
        'quantity' => $m['quantity'] ?? 0,
    ];
}

header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'status'    => 'success',
    'kitsCount' => count($kits),
    'kits'      => $kits,
    'missing'   => $missing,
], JSON_UNESCAPED_UNICODE);
