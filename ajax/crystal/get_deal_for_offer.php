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
        $phones = $company['PHONE'] ?? [];
        $emails = $company['EMAIL'] ?? [];
        $phone  = is_array($phones) && !empty($phones) ? $phones[0]['VALUE'] : '';
        $email  = is_array($emails) && !empty($emails) ? $emails[0]['VALUE'] : '';

        $result['company'] = [
            'id'      => $company['ID'],
            'name'    => $company['TITLE'],
            'vat'            => trim($company['UF_CRM_1717094608804'] ?? ''),
            'legal_address'  => trim($company['UF_CRM_1718030299507'] ?? ''),
            'phone'          => $phone,
            'email'          => $email,
            'address'        => implode(', ', array_filter([
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

echo json_encode($result, JSON_UNESCAPED_UNICODE);
