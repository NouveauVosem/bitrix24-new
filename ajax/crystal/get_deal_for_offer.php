<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

if (!CModule::IncludeModule('crm')) {
    echo json_encode(['status' => 'error', 'message' => 'CRM module not available']);
    die();
}

$dealId = (int)($_POST['dealId'] ?? 0);
if (!$dealId) {
    echo json_encode(['status' => 'error', 'message' => 'dealId required']);
    die();
}

$deal = CCrmDeal::GetByID($dealId);
if (!$deal) {
    echo json_encode(['status' => 'error', 'message' => 'Deal not found']);
    die();
}

// Delivery address from deal UF_ fields
$deliveryCity    = trim($deal['UF_CRM_1720604913416'] ?? '');
$deliveryStreet  = trim($deal['UF_CRM_1720604937540'] ?? '');
$deliveryHouse   = trim($deal['UF_CRM_1720604951910'] ?? '');
$deliveryZip     = trim($deal['UF_CRM_1720604926030'] ?? '');
$deliveryCountry = trim($deal['UF_CRM_67BF208ADD735']  ?? '');

$deliveryLine = implode(', ', array_filter([
    $deliveryStreet . ($deliveryHouse ? ', ' . $deliveryHouse : ''),
    $deliveryZip ? $deliveryZip . ' ' . $deliveryCity : $deliveryCity,
    $deliveryCountry,
]));

$result = [
    'status' => 'success',
    'deal'   => [
        'id'        => $deal['ID'],
        'title'     => $deal['TITLE'],
        'currency'  => $deal['CURRENCY_ID'] ?: 'EUR',
        'seller'    => $deal['UF_CRM_1718209313308'] ?? '',
        'companyId' => (int)($deal['COMPANY_ID'] ?? 0),
        'contactId' => (int)($deal['CONTACT_ID'] ?? 0),
    ],
    'delivery' => [
        'street'  => $deliveryStreet . ($deliveryHouse ? ', ' . $deliveryHouse : ''),
        'city'    => $deliveryCity,
        'zip'     => $deliveryZip,
        'country' => $deliveryCountry,
        'line'    => $deliveryLine,
    ],
    'company' => null,
    'contact' => null,
];

// Company linked to deal
$companyId = (int)($deal['COMPANY_ID'] ?? 0);
if ($companyId > 0) {
    $company = CCrmCompany::GetByID($companyId);

    if ($company) {
        $phone = '';
        $email = '';
        $dbMulti = CCrmFieldMulti::GetList(
            ['ID' => 'asc'],
            ['ENTITY_ID' => 'COMPANY', 'ELEMENT_ID' => $companyId]
        );
        while ($row = $dbMulti->Fetch()) {
            if ($row['TYPE_ID'] === 'PHONE' && !$phone) $phone = $row['VALUE'];
            if ($row['TYPE_ID'] === 'EMAIL' && !$email) $email = $row['VALUE'];
        }

        global $USER_FIELD_MANAGER;
        $ufFields     = $USER_FIELD_MANAGER->GetUserFields('CRM_COMPANY', $companyId, LANGUAGE_ID);
        $vat          = trim($ufFields['UF_CRM_1717094608804']['VALUE'] ?? '');
        $legalAddress = trim($ufFields['UF_CRM_1718030299507']['VALUE'] ?? '');

        $result['company'] = [
            'id'            => $company['ID'],
            'name'          => $company['TITLE'],
            'vat'           => $vat,
            'legal_address' => $legalAddress,
            'phone'         => $phone,
            'email'         => $email,
            'address'       => implode(', ', array_filter([
                $company['ADDRESS']             ?? '',
                $company['ADDRESS_CITY']        ?? '',
                $company['ADDRESS_POSTAL_CODE'] ?? '',
                $company['ADDRESS_COUNTRY']     ?? '',
            ])),
        ];
    }
}

// Contact linked to deal
$contactId = (int)($deal['CONTACT_ID'] ?? 0);
if ($contactId > 0) {
    $contact = CCrmContact::GetByID($contactId);
    if ($contact) {
        $result['contact'] = [
            'id'   => $contact['ID'],
            'name' => trim(($contact['NAME'] ?? '') . ' ' . ($contact['LAST_NAME'] ?? '')),
        ];
    }
}

// Hierarchy items from crm_deal_hierarchy table
$connection = \Bitrix\Main\Application::getConnection();
$res        = $connection->query("SELECT ITEMS FROM crm_deal_hierarchy WHERE DEAL_ID = " . $dealId);
$row        = $res->fetch();
$items      = $row ? (json_decode($row['ITEMS'], true) ?: []) : [];

// Resolve missing bitrixId via Crystal API (norm → template.bitrixId)
$crystalBase = 'https://crystal.alvla.tools';
$crystalKey  = 'legenda';

foreach ($items as &$item) {
    if (!empty($item['bitrixId'])) continue;
    $normId = $item['normId'] ?? null;
    if (!$normId) continue;

    $ctx = stream_context_create(['http' => [
        'method'  => 'GET',
        'header'  => 'X-Api-Key: ' . $crystalKey . "\r\n",
        'timeout' => 5,
    ]]);
    $raw = @file_get_contents($crystalBase . '/api/product-form-norms/' . urlencode($normId), false, $ctx);
    if ($raw) {
        $norm = json_decode($raw, true);
        $bid  = (int)($norm['template']['bitrixId'] ?? 0);
        if ($bid) $item['bitrixId'] = $bid;
    }
}
unset($item);

// Collect all bitrixIds — from items and their components
\CModule::IncludeModule('iblock');
$allBitrixIds = [];
foreach ($items as $item) {
    if (!empty($item['bitrixId'])) $allBitrixIds[] = (int)$item['bitrixId'];
    foreach ($item['components'] ?? [] as $c) {
        if (!empty($c['bitrixId'])) $allBitrixIds[] = (int)$c['bitrixId'];
    }
}
$allBitrixIds = array_values(array_unique(array_filter($allBitrixIds)));

// Enrich with multilingual names (PROPERTY_73 = CZ, PROPERTY_74 = EN)
$nameMap = [];
if (!empty($allBitrixIds)) {
    $dbEl = \CIBlockElement::GetList([], ['ID' => $allBitrixIds], false, false, ['ID', 'PROPERTY_73', 'PROPERTY_74']);
    while ($el = $dbEl->GetNext()) {
        $nameMap[(int)$el['ID']] = [
            'nameCz' => $el['PROPERTY_73_VALUE'] ?? '',
            'nameEn' => $el['PROPERTY_74_VALUE'] ?? '',
        ];
    }
}

foreach ($items as &$item) {
    $bid = (int)($item['bitrixId'] ?? 0);
    if ($bid && isset($nameMap[$bid])) {
        $item['nameCz'] = $nameMap[$bid]['nameCz'];
        $item['nameEn'] = $nameMap[$bid]['nameEn'];
    }
    foreach ($item['components'] ?? [] as &$c) {
        $cbid = (int)($c['bitrixId'] ?? 0);
        if ($cbid && isset($nameMap[$cbid])) {
            $c['nameCz'] = $nameMap[$cbid]['nameCz'];
            $c['nameEn'] = $nameMap[$cbid]['nameEn'];
        }
    }
    unset($c);
}
unset($item);

$result['items'] = $items;

echo json_encode($result, JSON_UNESCAPED_UNICODE);
