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
    'company' => null,
];

$companyId = (int)($deal['COMPANY_ID'] ?? 0);
if ($companyId > 0) {
    $company = CCrmCompany::GetByID($companyId);
    if ($company) {
        $addressParts = array_filter([
            $company['ADDRESS']             ?? '',
            $company['ADDRESS_2']           ?? '',
            $company['ADDRESS_CITY']        ?? '',
            $company['ADDRESS_POSTAL_CODE'] ?? '',
            $company['ADDRESS_COUNTRY']     ?? '',
        ]);

        $result['company'] = [
            'id'      => $company['ID'],
            'name'    => $company['TITLE'],
            'address' => implode(', ', $addressParts),
            'vat'     => $company['UF_CRM_1_VAT_ID'] ?? ($company['UF_CRM_COMPANY_VAT'] ?? ''),
        ];
    }
}

echo json_encode($result, JSON_UNESCAPED_UNICODE);
