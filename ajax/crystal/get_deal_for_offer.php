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
    'deal' => [
        'id'       => $deal['ID'],
        'title'    => $deal['TITLE'],
        'currency' => $deal['CURRENCY_ID'] ?: 'EUR',
        'seller'   => $deal['UF_CRM_1718209313308'] ?? '',
    ],
    'company' => null,
    'contact' => null,
];

// ── Company card ─────────────────────────────────────────────
$companyId = (int)($deal['COMPANY_ID'] ?? 0);
if ($companyId > 0) {
    // GetByID doesn't load UF_ fields — use GetList with UF_* select
    $res = CCrmCompany::GetList(
        [],
        ['=ID' => $companyId],
        false,
        false,
        ['*', 'UF_*']
    );
    $company = $res->Fetch();

    if ($company) {
        $ufFields = [];
        foreach ($company as $k => $v) {
            if (strpos($k, 'UF_') === 0) {
                $ufFields[$k] = $v;
            }
        }

        $addressParts = array_filter([
            trim($company['ADDRESS']             ?? ''),
            trim($company['ADDRESS_2']           ?? ''),
            trim($company['ADDRESS_POSTAL_CODE'] ?? '') . ' ' . trim($company['ADDRESS_CITY'] ?? ''),
            trim($company['ADDRESS_COUNTRY']     ?? ''),
        ]);

        $result['company'] = [
            'id'      => $company['ID'],
            'name'    => $company['TITLE'] ?? '',
            'address' => implode(', ', array_filter(array_map('trim', $addressParts))),
            'uf'      => $ufFields,
        ];
    }
}

// ── Contact card ─────────────────────────────────────────────
$contactId = (int)($deal['CONTACT_ID'] ?? 0);
if ($contactId > 0) {
    $res = CCrmContact::GetList(
        [],
        ['=ID' => $contactId],
        false,
        false,
        ['*', 'UF_*']
    );
    $contact = $res->Fetch();

    if ($contact) {
        $ufContact = [];
        foreach ($contact as $k => $v) {
            if (strpos($k, 'UF_') === 0) {
                $ufContact[$k] = $v;
            }
        }

        $result['contact'] = [
            'id'   => $contact['ID'],
            'name' => trim(trim($contact['NAME'] ?? '') . ' ' . trim($contact['LAST_NAME'] ?? ''), " '\""),
            'post' => $contact['POST'] ?? '',
            'uf'   => $ufContact,
        ];
    }
}

echo json_encode($result, JSON_UNESCAPED_UNICODE);
