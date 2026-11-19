<?php
// Карточка компании для ИИ-чата Кристала (BITRIX-TZ.md, п. 2): всё о компании одним ответом.
//
// Параметры:
//   id             — ID компании, обязательный;
//   assigned_by_id — если передан и ответственный другой → 403 «not your company».
//
// Суммы сделок — «Общая сумма с НДС» (UF_CRM_1728403359608), если пусто — сумма сделки,
// в валюте сделки, без пересчёта (как в stats/).
require __DIR__ . '/_common.php';

const CRYSTAL_COMPANY_RECENT_DEALS = 10;
const CRYSTAL_COMPANY_CONTACTS_MAX = 50;

$id           = crystalClientsId('id', true);
$assignedById = crystalClientsId('assigned_by_id');

// ── Компания ─────────────────────────────────────────────────────────────────
$company = \Bitrix\Crm\CompanyTable::getList([
    'filter' => ['=ID' => $id],
    'select' => [
        'ID', 'TITLE', 'COMPANY_TYPE', 'INDUSTRY', 'ASSIGNED_BY_ID', 'COMMENTS', 'DATE_CREATE', 'DATE_MODIFY',
        CRYSTAL_CLIENTS_VAT_FIELD, CRYSTAL_CLIENTS_COUNTRY_FIELD, CRYSTAL_CLIENTS_LEGAL_ADDRESS,
    ],
])->fetch();

if (!$company) {
    crystalClientsError('not found', 404);
}
if ($assignedById && (int)$company['ASSIGNED_BY_ID'] !== $assignedById) {
    crystalClientsError('not your company', 403);
}

$multi      = crystalClientsMultiFields('COMPANY', [$id]);
$requisites = crystalClientsRequisites([$id]);
$rq         = $requisites[$id] ?? null;
$address    = crystalClientsAddresses([$id], $requisites)[$id] ?? null;

$companyTypes = crystalClientsStatusNames('COMPANY_TYPE');
$industries   = crystalClientsStatusNames('INDUSTRY');

$userIds = [(int)$company['ASSIGNED_BY_ID']];

// ── Контакты ─────────────────────────────────────────────────────────────────
$contactIds = [];
$rows = \Bitrix\Crm\ContactTable::getList([
    'filter' => ['=COMPANY_ID' => $id],
    'select' => ['ID'],
]);
while ($r = $rows->fetch()) $contactIds[] = (int)$r['ID'];

if (class_exists('\Bitrix\Crm\Binding\ContactCompanyTable')) {
    $rows = \Bitrix\Crm\Binding\ContactCompanyTable::getList([
        'filter' => ['=COMPANY_ID' => $id],
        'select' => ['CONTACT_ID'],
    ]);
    while ($r = $rows->fetch()) $contactIds[] = (int)$r['CONTACT_ID'];
}
$contactIds = array_values(array_unique($contactIds));
rsort($contactIds);
$contactsTotal = count($contactIds);
$contactIds = array_slice($contactIds, 0, CRYSTAL_COMPANY_CONTACTS_MAX);

$contacts = [];
if (!empty($contactIds)) {
    $contactMulti = crystalClientsMultiFields('CONTACT', $contactIds);
    $rows = \Bitrix\Crm\ContactTable::getList([
        'filter' => ['@ID' => $contactIds],
        'select' => ['ID', 'NAME', 'SECOND_NAME', 'LAST_NAME', 'POST'],
        'order'  => ['ID' => 'ASC'],
    ]);
    while ($r = $rows->fetch()) {
        $cid = (int)$r['ID'];
        $name = trim(preg_replace('/\s+/u', ' ', $r['NAME'] . ' ' . $r['SECOND_NAME'] . ' ' . $r['LAST_NAME']));
        $contacts[] = [
            'id'        => $cid,
            'full_name' => $name !== '' ? $name : null,
            'post'      => trim((string)$r['POST']) ?: null,
            'phones'    => $contactMulti[$cid]['phones'],
            'emails'    => $contactMulti[$cid]['emails'],
        ];
    }
}

// ── Сделки ───────────────────────────────────────────────────────────────────
$stageNames = [];
$rows = \Bitrix\Crm\StatusTable::getList([
    'filter' => ['%=ENTITY_ID' => 'DEAL_STAGE%'],
    'select' => ['STATUS_ID', 'NAME'],
]);
while ($s = $rows->fetch()) $stageNames[$s['STATUS_ID']] = $s['NAME'];

$semanticOf = function (array $d) {
    switch ($d['STAGE_SEMANTIC_ID']) {
        case 'S': return 'won';
        case 'F': return 'lost';
        case 'P': return 'open';
    }
    $stage = (string)$d['STAGE_ID'];
    if ($stage === 'WON' || substr($stage, -4) === ':WON') return 'won';
    if ($stage === 'LOSE' || substr($stage, -5) === ':LOSE') return 'lost';
    return 'open';
};

$amountOf = function (array $d) {
    $v = (float)$d[CRYSTAL_CLIENTS_AMOUNT_FIELD];
    if ($v == 0) $v = (float)$d['OPPORTUNITY'];
    return crystalClientsMoney($v);
};

$deals = \Bitrix\Crm\DealTable::getList([
    'filter' => ['=COMPANY_ID' => $id],
    'select' => [
        'ID', 'TITLE', 'STAGE_ID', 'STAGE_SEMANTIC_ID', 'OPPORTUNITY', 'CURRENCY_ID',
        'ASSIGNED_BY_ID', 'DATE_CREATE', 'CLOSEDATE', CRYSTAL_CLIENTS_AMOUNT_FIELD,
    ],
    'order'  => ['DATE_CREATE' => 'DESC', 'ID' => 'DESC'],
])->fetchAll();

$counts = ['open' => 0, 'won' => 0, 'lost' => 0];
$wonSum = [];
foreach ($deals as $d) {
    $sem = $semanticOf($d);
    $counts[$sem]++;
    if ($sem === 'won') {
        $cur = $d['CURRENCY_ID'] ?: 'UNKNOWN';
        $wonSum[$cur] = ($wonSum[$cur] ?? 0) + $amountOf($d);
    }
}
arsort($wonSum);

$recentDeals = array_slice($deals, 0, CRYSTAL_COMPANY_RECENT_DEALS);
foreach ($recentDeals as $d) $userIds[] = (int)$d['ASSIGNED_BY_ID'];

// ── Последнее дело или комментарий таймлайна ────────────────────────────────
$conn = \Bitrix\Main\Application::getConnection();

$activity = $conn->query(
    'SELECT a.ID, a.TYPE_ID, a.PROVIDER_ID, a.SUBJECT, a.AUTHOR_ID, a.RESPONSIBLE_ID, a.CREATED, a.DIRECTION'
    . ' FROM b_crm_act a INNER JOIN b_crm_act_bind b ON b.ACTIVITY_ID = a.ID'
    . ' WHERE b.OWNER_TYPE_ID = ' . \CCrmOwnerType::Company . ' AND b.OWNER_ID = ' . $id
    . ' ORDER BY a.CREATED DESC, a.ID DESC LIMIT 1'
)->fetch();

$commentType = class_exists('\Bitrix\Crm\Timeline\TimelineType') ? \Bitrix\Crm\Timeline\TimelineType::COMMENT : 7;
$comment = $conn->query(
    'SELECT t.ID, t.COMMENT, t.AUTHOR_ID, t.CREATED'
    . ' FROM b_crm_timeline t INNER JOIN b_crm_timeline_bind tb ON tb.OWNER_ID = t.ID'
    . ' WHERE tb.ENTITY_TYPE_ID = ' . \CCrmOwnerType::Company . ' AND tb.ENTITY_ID = ' . $id
    . ' AND t.TYPE_ID = ' . (int)$commentType
    . ' ORDER BY t.CREATED DESC, t.ID DESC LIMIT 1'
)->fetch();

// Тип дела: TYPE_ID 1 встреча, 2 звонок, 3 задача, 4 письмо, 6 — по провайдеру.
$activityType = function (array $a) {
    $byType = ['1' => 'MEETING', '2' => 'CALL', '3' => 'TASK', '4' => 'EMAIL'];
    $byProvider = [
        'VOXIMPLANT_CALL' => 'CALL', 'CRM_CALL_LIST' => 'CALL', 'CRM_EMAIL' => 'EMAIL', 'CRM_MEETING' => 'MEETING',
        'CRM_TODO' => 'TODO', 'CRM_TASKS_TASK' => 'TASK', 'TASKS' => 'TASK', 'TASKS_TASK' => 'TASK',
        'IMOPENLINES_SESSION' => 'OPENLINE', 'CRM_WEBFORM' => 'WEBFORM', 'CRM_REQUEST' => 'REQUEST',
        'CRM_SMS' => 'SMS', 'CRM_NOTIFICATION' => 'SMS',
    ];
    return $byProvider[$a['PROVIDER_ID']] ?? $byType[(string)$a['TYPE_ID']] ?? ($a['PROVIDER_ID'] ?: 'ACTIVITY');
};

$lastActivity = null;
$actTs = $activity ? strtotime($activity['CREATED']) : null;
$comTs = $comment ? strtotime($comment['CREATED']) : null;
if ($activity && ($comTs === null || $actTs >= $comTs)) {
    $authorId = (int)$activity['AUTHOR_ID'] ?: (int)$activity['RESPONSIBLE_ID'];
    $direction = ['1' => 'in', '2' => 'out'][(string)$activity['DIRECTION']] ?? null;
    $lastActivity = [
        'type'      => $activityType($activity),
        'direction' => $direction,
        'subject'   => crystalClientsText($activity['SUBJECT']),
        'author_id' => $authorId ?: null,
        'created'   => crystalClientsDateTime($activity['CREATED']),
    ];
} elseif ($comment) {
    $authorId = (int)$comment['AUTHOR_ID'];
    $lastActivity = [
        'type'      => 'COMMENT',
        'direction' => null,
        'subject'   => crystalClientsText($comment['COMMENT']),
        'author_id' => $authorId ?: null,
        'created'   => crystalClientsDateTime($comment['CREATED']),
    ];
}
if ($lastActivity) $userIds[] = (int)$lastActivity['author_id'];

// ── Пользовательские поля: только заполненные, списки — подписями ───────────
global $USER_FIELD_MANAGER;
$ufRaw = $USER_FIELD_MANAGER->GetUserFields('CRM_COMPANY', $id, LANGUAGE_ID);

// Сначала соберём id сотрудников из полей типа employee, чтобы взять имена одним запросом.
foreach ($ufRaw as $f) {
    if ($f['USER_TYPE_ID'] === 'employee') {
        foreach ((array)$f['VALUE'] as $v) $userIds[] = (int)$v;
    }
}
$users = crystalClientsUserNames($userIds);

$ufValue = function (array $f) use ($users) {
    $values = array_values(array_filter((array)$f['VALUE'], function ($v) {
        return $v !== null && $v !== '' && $v !== false && $v !== [];
    }));
    if (empty($values)) return null;

    $out = [];
    foreach ($values as $v) {
        switch ($f['USER_TYPE_ID']) {
            case 'enumeration':
                $out[] = crystalClientsEnumLabels($f['FIELD_NAME'])[(int)$v] ?? (string)$v;
                break;
            case 'boolean':
                $out[] = (int)$v ? 'да' : 'нет';
                break;
            case 'employee':
                $out[] = $users[(int)$v] ?? (string)$v;
                break;
            case 'date':
                $ts = is_object($v) ? $v->getTimestamp() : \MakeTimeStamp((string)$v);
                $out[] = $ts ? date('Y-m-d', $ts) : (string)$v;
                break;
            case 'datetime':
                $ts = is_object($v) ? $v : \MakeTimeStamp((string)$v);
                $out[] = $ts ? crystalClientsDateTime($ts) : (string)$v;
                break;
            case 'file':
                $file = \CFile::GetFileArray((int)$v);
                if ($file) $out[] = $file['ORIGINAL_NAME'];
                break;
            case 'money':
                $parts = explode('|', (string)$v);
                $out[] = trim($parts[0] . ' ' . ($parts[1] ?? ''));
                break;
            case 'address':
                $out[] = crystalClientsText(explode('|', (string)$v)[0]);
                break;
            case 'iblock_element':
            case 'iblock_section':
                $name = null;
                if (\Bitrix\Main\Loader::includeModule('iblock')) {
                    $table = $f['USER_TYPE_ID'] === 'iblock_element' ? '\Bitrix\Iblock\ElementTable' : '\Bitrix\Iblock\SectionTable';
                    $row = $table::getList(['filter' => ['=ID' => (int)$v], 'select' => ['NAME']])->fetch();
                    $name = $row['NAME'] ?? null;
                }
                $out[] = $name ?? (string)$v;
                break;
            default:
                $out[] = is_scalar($v) ? crystalClientsText($v) : null;
        }
    }
    $out = array_values(array_filter($out, function ($v) { return $v !== null && $v !== ''; }));
    if (empty($out)) return null;
    return $f['MULTIPLE'] === 'Y' ? $out : $out[0];
};

$uf = [];
foreach ($ufRaw as $code => $f) {
    $value = $ufValue($f);
    if ($value === null) continue;
    $title = trim((string)($f['EDIT_FORM_LABEL'] ?: $f['LIST_COLUMN_LABEL'] ?: $f['LIST_FILTER_LABEL'])) ?: $code;
    $uf[$code] = ['title' => $title, 'value' => $value];
}

// ── Ответ ─────────────────────────────────────────────────────────────────────
$assigned = (int)$company['ASSIGNED_BY_ID'];

$recent = [];
foreach ($recentDeals as $d) {
    $recent[] = [
        'id'               => (int)$d['ID'],
        'title'            => $d['TITLE'],
        'stage_id'         => $d['STAGE_ID'],
        'stage_name'       => $stageNames[$d['STAGE_ID']] ?? null,
        'stage_semantic'   => $semanticOf($d),
        'opportunity'      => $amountOf($d),
        'currency'         => $d['CURRENCY_ID'] ?: null,
        'assigned_by_id'   => (int)$d['ASSIGNED_BY_ID'] ?: null,
        'assigned_by_name' => $users[(int)$d['ASSIGNED_BY_ID']] ?? null,
        'created'          => crystalClientsDateTime($d['DATE_CREATE']),
        'close_date'       => crystalClientsDateTime($d['CLOSEDATE']),
    ];
}

$wonSumRows = [];
foreach ($wonSum as $cur => $sum) {
    $wonSumRows[] = ['currency' => $cur, 'opportunity' => crystalClientsMoney($sum)];
}

if ($lastActivity) {
    $lastActivity['author_name'] = $users[(int)$lastActivity['author_id']] ?? null;
}

$legalAddress = crystalClientsText($company[CRYSTAL_CLIENTS_LEGAL_ADDRESS] ?? '');

crystalClientsRespond([
    'tz'                => CRYSTAL_CLIENTS_TZ,
    'id'                => (int)$company['ID'],
    'title'             => $company['TITLE'],
    'full_title'        => crystalClientsFullTitle($rq),
    'company_type'      => $company['COMPANY_TYPE'] ?: null,
    'company_type_name' => $companyTypes[$company['COMPANY_TYPE']] ?? null,
    'industry'          => $company['INDUSTRY'] ?: null,
    'industry_name'     => $industries[$company['INDUSTRY']] ?? null,
    'country'           => crystalClientsCountry($company, $address),
    'country_code'      => $address['country_code'] ?? null,
    'city'              => $address['city'] ?? null,
    'address'           => $address['address'] ?? $legalAddress,
    'legal_address'     => $legalAddress,
    'vat'               => crystalClientsVat($company, $rq),
    'reg_number'        => crystalClientsRegNumber($rq),
    'assigned_by_id'    => $assigned ?: null,
    'assigned_by_name'  => $users[$assigned] ?? null,
    'phones'            => $multi[$id]['phones'],
    'emails'            => $multi[$id]['emails'],
    'web'               => $multi[$id]['web'],
    'comments'          => crystalClientsText($company['COMMENTS']),
    'created'           => crystalClientsDateTime($company['DATE_CREATE']),
    'modified'          => crystalClientsDateTime($company['DATE_MODIFY']),
    'contacts'          => $contacts,
    'contacts_total'    => $contactsTotal,
    'deals'             => [
        'open'      => $counts['open'],
        'won'       => $counts['won'],
        'lost'      => $counts['lost'],
        'last_date' => isset($deals[0]) ? crystalClientsDate($deals[0]['DATE_CREATE']) : null,
        'won_sum'   => $wonSumRows,
        'recent'    => $recent,
    ],
    'last_activity'     => $lastActivity,
    'uf'                => $uf,
]);
