<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');
error_reporting(0);

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

// ── Helpers ──────────────────────────────────────────────────

function extractUfFields(array $row): array {
    $uf = [];
    foreach ($row as $k => $v) {
        if (strpos($k, 'UF_') === 0 && $v !== false && $v !== null && $v !== '') {
            $uf[$k] = is_array($v) ? implode(', ', $v) : (string)$v;
        }
    }
    return $uf;
}

// ── Company card ─────────────────────────────────────────────
$companyId = (int)($deal['COMPANY_ID'] ?? 0);
if ($companyId > 0) {
    // Use ORM — avoids the PHP 8 count(false) crash in old CCrmCompany::GetList
    try {
        $companyRow = \Bitrix\Crm\CompanyTable::getList([
            'filter' => ['=ID' => $companyId],
            'select' => [
                'ID', 'TITLE',
                'ADDRESS', 'ADDRESS_2', 'ADDRESS_CITY',
                'ADDRESS_POSTAL_CODE', 'ADDRESS_REGION', 'ADDRESS_COUNTRY',
            ],
            'limit' => 1,
        ])->fetch();
    } catch (\Exception $e) {
        $companyRow = null;
        $result['company_error'] = $e->getMessage();
    }

    // UF_ values are in a separate user-fields table — fetch via entity manager
    $ufFields = [];
    try {
        $ufEntity = new \CCrmCompany(false);
        $arUF = $ufEntity->GetUserFields($companyId, 0, LANGUAGE_ID);
        foreach ((array)$arUF as $fieldName => $fieldData) {
            $val = $fieldData['VALUE'] ?? null;
            if ($val !== null && $val !== false && $val !== '') {
                $ufFields[$fieldName] = is_array($val) ? implode(', ', $val) : (string)$val;
            }
        }
    } catch (\Exception $e) {
        $result['company_uf_error'] = $e->getMessage();
    }

    if ($companyRow) {
        $city    = trim($companyRow['ADDRESS_CITY']        ?? '');
        $zip     = trim($companyRow['ADDRESS_POSTAL_CODE'] ?? '');
        $street  = trim($companyRow['ADDRESS']             ?? '');
        $country = trim($companyRow['ADDRESS_COUNTRY']     ?? '');

        $result['company'] = [
            'id'      => $companyRow['ID'],
            'name'    => $companyRow['TITLE'] ?? '',
            'address' => implode(', ', array_filter([
                $street,
                trim($zip . ' ' . $city),
                $country,
            ])),
            'uf' => $ufFields,
        ];
    }
}

// ── Contact card ─────────────────────────────────────────────
$contactId = (int)($deal['CONTACT_ID'] ?? 0);
if ($contactId > 0) {
    try {
        $contactRow = \Bitrix\Crm\ContactTable::getList([
            'filter' => ['=ID' => $contactId],
            'select' => ['ID', 'NAME', 'LAST_NAME', 'POST'],
            'limit'  => 1,
        ])->fetch();
    } catch (\Exception $e) {
        $contactRow = null;
        $result['contact_error'] = $e->getMessage();
    }

    if ($contactRow) {
        $result['contact'] = [
            'id'   => $contactRow['ID'],
            'name' => trim(($contactRow['NAME'] ?? '') . ' ' . ($contactRow['LAST_NAME'] ?? ''), " '\""),
            'post' => $contactRow['POST'] ?? '',
        ];
    }
}

echo json_encode($result, JSON_UNESCAPED_UNICODE);
