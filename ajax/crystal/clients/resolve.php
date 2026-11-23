<?php
// Кто это? Привязка входящего письма или звонка Кристалла к клиенту CRM.
//
// Параметры (один из двух обязателен):
//   phone — номер в любом формате; сравниваем по последним 9 цифрам (от 7 цифр);
//   email — адрес; сначала точное совпадение, затем (если точного нет и домен
//           не публичный, а strict не передан) — по домену у контактов и компаний;
//   strict=1 — для email не искать по домену.
//
// Ответ:
//   contacts  — найденные контакты и их компании;
//   companies — компании: найденные напрямую + компании найденных контактов;
//   leads     — лиды с этим телефоном/email (открытые первыми);
//   deals     — открытые сделки найденных компаний и контактов;
//   suggested — предложенная привязка {contact_id, company_id}, если она однозначна, иначе null.
//
// Кристалл хранит у письма/звонка contact_id и company_id, остальное — через другие эндпоинты.
require __DIR__ . '/_common.php';

const CRYSTAL_RESOLVE_LIMIT      = 50; // совпадений с одного источника
const CRYSTAL_RESOLVE_DEAL_LIMIT = 20;

const CRYSTAL_RESOLVE_PUBLIC_DOMAINS = [
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

$phone  = crystalClientsParam('phone');
$email  = mb_strtolower(crystalClientsParam('email'), 'UTF-8');
$strict = in_array(mb_strtolower(crystalClientsParam('strict')), ['1', 'true', 'yes', 'y'], true);

if (($phone === '') === ($email === '')) {
    crystalClientsError('нужен ровно один параметр: phone или email');
}

$conn      = \Bitrix\Main\Application::getConnection();
$sqlHelper = $conn->getSqlHelper();

// ── Поиск в b_crm_field_multi: [ENTITY_ID => [ELEMENT_ID => match]] ─────────
// match: phone | email | domain
$found = ['CONTACT' => [], 'COMPANY' => [], 'LEAD' => []];

$collect = function ($sql, callable $matchOf) use ($conn, &$found) {
    $rows = $conn->query($sql . ' LIMIT ' . (CRYSTAL_RESOLVE_LIMIT * 3));
    while ($r = $rows->fetch()) {
        $match = $matchOf($r['VALUE']);
        if ($match === null) continue;
        $id = (int)$r['ELEMENT_ID'];
        if (count($found[$r['ENTITY_ID']]) >= CRYSTAL_RESOLVE_LIMIT && !isset($found[$r['ENTITY_ID']][$id])) continue;
        $found[$r['ENTITY_ID']][$id] = $match;
    }
};

$query = [];
if ($phone !== '') {
    $digits = crystalClientsPhoneDigits($phone);
    if (strlen($digits) < 7) crystalClientsError('в номере меньше 7 цифр');
    $tail = substr($digits, -9);
    $query = ['phone' => $phone, 'digits' => $digits];

    $stripped = 'VALUE';
    foreach ([' ', '.', '-', '(', ')', '/', '+'] as $ch) $stripped = "REPLACE($stripped, '$ch', '')";

    $collect(
        "SELECT ENTITY_ID, ELEMENT_ID, VALUE FROM b_crm_field_multi WHERE TYPE_ID = 'PHONE'"
        . " AND ENTITY_ID IN ('CONTACT', 'COMPANY', 'LEAD')"
        . " AND $stripped LIKE '" . $sqlHelper->forSql('%' . $tail) . "'",
        function ($value) use ($tail) {
            return substr(crystalClientsPhoneDigits($value), -9) === $tail ? 'phone' : null;
        }
    );
} else {
    $at = mb_strpos($email, '@');
    if ($at === false || $at === 0 || $at === mb_strlen($email) - 1) crystalClientsError('неверный email');
    $domain = mb_substr($email, $at + 1);
    $query = ['email' => $email];

    $collect(
        "SELECT ENTITY_ID, ELEMENT_ID, VALUE FROM b_crm_field_multi WHERE TYPE_ID = 'EMAIL'"
        . " AND ENTITY_ID IN ('CONTACT', 'COMPANY', 'LEAD')"
        . " AND VALUE = '" . $sqlHelper->forSql($email) . "'",
        function ($value) use ($email) {
            return mb_strtolower(trim($value), 'UTF-8') === $email ? 'email' : null;
        }
    );

    $nothingExact = empty($found['CONTACT']) && empty($found['COMPANY']);
    if ($nothingExact && !$strict && !in_array($domain, CRYSTAL_RESOLVE_PUBLIC_DOMAINS, true)) {
        $suffix = '@' . $domain;
        $collect(
            "SELECT ENTITY_ID, ELEMENT_ID, VALUE FROM b_crm_field_multi WHERE TYPE_ID = 'EMAIL'"
            . " AND ENTITY_ID IN ('CONTACT', 'COMPANY')"
            . " AND VALUE LIKE '" . $sqlHelper->forSql('%' . $suffix) . "'",
            function ($value) use ($suffix) {
                $v = mb_strtolower(trim($value), 'UTF-8');
                return mb_substr($v, -mb_strlen($suffix)) === $suffix ? 'domain' : null;
            }
        );
    }
}

// ── Контакты ─────────────────────────────────────────────────────────────────
$contactIds = array_keys($found['CONTACT']);
$contactRows = [];
if (!empty($contactIds)) {
    $rows = \Bitrix\Crm\ContactTable::getList([
        'filter' => ['@ID' => $contactIds],
        'select' => ['ID', 'NAME', 'LAST_NAME', 'SECOND_NAME', 'POST', 'ASSIGNED_BY_ID', 'DATE_CREATE'],
    ]);
    while ($r = $rows->fetch()) $contactRows[(int)$r['ID']] = $r;
}
$contactIds = array_keys($contactRows);
$contactCompanies = crystalClientsContactCompanies($contactIds);

// ── Лиды ─────────────────────────────────────────────────────────────────────
$leadRows = [];
if (!empty($found['LEAD'])) {
    $rows = \Bitrix\Crm\LeadTable::getList([
        'filter' => ['@ID' => array_keys($found['LEAD'])],
        'select' => [
            'ID', 'TITLE', 'NAME', 'LAST_NAME', 'COMPANY_TITLE', 'STATUS_ID', 'STATUS_SEMANTIC_ID',
            'ASSIGNED_BY_ID', 'DATE_CREATE', 'CONTACT_ID', 'COMPANY_ID',
        ],
        'order' => ['DATE_CREATE' => 'DESC', 'ID' => 'DESC'],
    ]);
    while ($r = $rows->fetch()) $leadRows[(int)$r['ID']] = $r;
}

// ── Компании: напрямую + компании контактов ──────────────────────────────────
$companyVia = [];
foreach ($found['COMPANY'] as $cid => $match) $companyVia[$cid] = $match;
foreach ($contactCompanies as $ctId => $cids) {
    foreach ($cids as $cid) {
        if (!isset($companyVia[$cid])) $companyVia[$cid] = 'contact';
    }
}

$companyRows = [];
if (!empty($companyVia)) {
    $rows = \Bitrix\Crm\CompanyTable::getList([
        'filter' => ['@ID' => array_keys($companyVia)],
        'select' => ['ID', 'TITLE', 'ASSIGNED_BY_ID', CRYSTAL_CLIENTS_COUNTRY_FIELD],
    ]);
    while ($r = $rows->fetch()) $companyRows[(int)$r['ID']] = $r;
}
$companyIds = array_keys($companyRows);

// ── Открытые сделки компаний и контактов ─────────────────────────────────────
$dealIds = [];
if (!empty($companyIds)) {
    $rows = \Bitrix\Crm\DealTable::getList([
        'filter' => ['@COMPANY_ID' => $companyIds, '=STAGE_SEMANTIC_ID' => 'P'],
        'select' => ['ID'],
    ]);
    while ($r = $rows->fetch()) $dealIds[(int)$r['ID']] = true;
}
if (!empty($contactIds)) {
    $rows = \Bitrix\Crm\DealTable::getList([
        'filter' => ['@CONTACT_ID' => $contactIds, '=STAGE_SEMANTIC_ID' => 'P'],
        'select' => ['ID'],
    ]);
    while ($r = $rows->fetch()) $dealIds[(int)$r['ID']] = true;

    if (class_exists('\Bitrix\Crm\Binding\DealContactTable')) {
        $rows = \Bitrix\Crm\Binding\DealContactTable::getList([
            'filter' => ['@CONTACT_ID' => $contactIds],
            'select' => ['DEAL_ID'],
        ]);
        $bound = [];
        while ($r = $rows->fetch()) $bound[] = (int)$r['DEAL_ID'];
        if (!empty($bound)) {
            $rows = \Bitrix\Crm\DealTable::getList([
                'filter' => ['@ID' => array_values(array_unique($bound)), '=STAGE_SEMANTIC_ID' => 'P'],
                'select' => ['ID'],
            ]);
            while ($r = $rows->fetch()) $dealIds[(int)$r['ID']] = true;
        }
    }
}

$dealRows = [];
$dealsTotal = count($dealIds);
if ($dealsTotal > 0) {
    $dealRows = \Bitrix\Crm\DealTable::getList([
        'filter' => ['@ID' => array_keys($dealIds)],
        'select' => [
            'ID', 'TITLE', 'STAGE_ID', 'CATEGORY_ID', 'OPPORTUNITY', 'CURRENCY_ID',
            'ASSIGNED_BY_ID', 'DATE_CREATE', 'COMPANY_ID', 'CONTACT_ID', CRYSTAL_CLIENTS_AMOUNT_FIELD,
        ],
        'order' => ['DATE_CREATE' => 'DESC', 'ID' => 'DESC'],
        'limit' => CRYSTAL_RESOLVE_DEAL_LIMIT,
    ])->fetchAll();
}

// ── Справочники ──────────────────────────────────────────────────────────────
$userIds = [];
foreach ([$contactRows, $companyRows, $leadRows, $dealRows] as $list) {
    foreach ($list as $r) $userIds[] = (int)$r['ASSIGNED_BY_ID'];
}
$users = crystalClientsUserNames($userIds);

$stageNames = [];
if (!empty($dealRows)) {
    $rows = \Bitrix\Crm\StatusTable::getList([
        'filter' => ['%=ENTITY_ID' => 'DEAL_STAGE%'],
        'select' => ['STATUS_ID', 'NAME'],
    ]);
    while ($s = $rows->fetch()) $stageNames[$s['STATUS_ID']] = $s['NAME'];
}
$leadStatusNames = !empty($leadRows) ? crystalClientsStatusNames('STATUS') : [];

$contactMulti = crystalClientsMultiFields('CONTACT', $contactIds);
$companyMulti = crystalClientsMultiFields('COMPANY', $companyIds);

$userRef = function ($id) use ($users) {
    $id = (int)$id;
    return ['assigned_by_id' => $id ?: null, 'assigned_by_name' => $users[$id] ?? null];
};
$companyTitle = function ($id) use ($companyRows) {
    return isset($companyRows[$id]) ? $companyRows[$id]['TITLE'] : null;
};

// ── Ответ ────────────────────────────────────────────────────────────────────
$contacts = [];
foreach ($contactRows as $id => $c) {
    $companies = [];
    foreach ($contactCompanies[$id] ?? [] as $cid) {
        if (isset($companyRows[$cid])) $companies[] = ['id' => $cid, 'title' => $companyRows[$cid]['TITLE']];
    }
    $contacts[] = [
        'id'        => $id,
        'full_name' => trim(preg_replace('/\s+/u', ' ', $c['NAME'] . ' ' . $c['SECOND_NAME'] . ' ' . $c['LAST_NAME'])),
        'post'      => trim((string)$c['POST']) ?: null,
        'match'     => $found['CONTACT'][$id],
        'companies' => $companies,
        'phones'    => $contactMulti[$id]['phones'],
        'emails'    => $contactMulti[$id]['emails'],
        'created'   => crystalClientsDateTime($c['DATE_CREATE']),
    ] + $userRef($c['ASSIGNED_BY_ID']);
}

$companies = [];
foreach ($companyRows as $id => $c) {
    $companies[] = [
        'id'      => $id,
        'title'   => $c['TITLE'],
        'country' => crystalClientsCountry($c, null),
        'match'   => $companyVia[$id], // phone | email | domain | contact
        'phones'  => $companyMulti[$id]['phones'],
        'emails'  => $companyMulti[$id]['emails'],
    ] + $userRef($c['ASSIGNED_BY_ID']);
}
// Найденные напрямую — первыми.
usort($companies, function ($a, $b) {
    return (int)($a['match'] === 'contact') - (int)($b['match'] === 'contact');
});

$leadSemantic = function ($s) {
    return ['S' => 'converted', 'F' => 'lost'][$s] ?? 'open';
};
$leads = [];
foreach ($leadRows as $id => $l) {
    $leads[] = [
        'id'           => $id,
        'title'        => $l['TITLE'],
        'name'         => trim($l['NAME'] . ' ' . $l['LAST_NAME']) ?: null,
        'company_title'=> trim((string)$l['COMPANY_TITLE']) ?: null,
        'status_id'    => $l['STATUS_ID'],
        'status_name'  => $leadStatusNames[$l['STATUS_ID']] ?? null,
        'status_semantic' => $leadSemantic($l['STATUS_SEMANTIC_ID']),
        'contact_id'   => (int)$l['CONTACT_ID'] ?: null,
        'company_id'   => (int)$l['COMPANY_ID'] ?: null,
        'created'      => crystalClientsDateTime($l['DATE_CREATE']),
    ] + $userRef($l['ASSIGNED_BY_ID']);
}
usort($leads, function ($a, $b) {
    return (int)($a['status_semantic'] !== 'open') - (int)($b['status_semantic'] !== 'open');
});

$deals = [];
foreach ($dealRows as $d) {
    $amount = (float)$d[CRYSTAL_CLIENTS_AMOUNT_FIELD] ?: (float)$d['OPPORTUNITY'];
    $deals[] = [
        'id'          => (int)$d['ID'],
        'title'       => $d['TITLE'],
        'category_id' => (int)$d['CATEGORY_ID'],
        'stage_id'    => $d['STAGE_ID'],
        'stage_name'  => $stageNames[$d['STAGE_ID']] ?? null,
        'opportunity' => crystalClientsMoney($amount),
        'currency'    => $d['CURRENCY_ID'] ?: null,
        'company_id'  => (int)$d['COMPANY_ID'] ?: null,
        'company_title' => $companyTitle((int)$d['COMPANY_ID']),
        'contact_id'  => (int)$d['CONTACT_ID'] ?: null,
        'created'     => crystalClientsDateTime($d['DATE_CREATE']),
    ] + $userRef($d['ASSIGNED_BY_ID']);
}

// ── Предложенная привязка ────────────────────────────────────────────────────
// Однозначно: ровно один контакт (его компания — если она одна) или, без контактов,
// ровно одна компания, найденная напрямую. Совпадение по домену — только компания.
$suggested = null;
$exactContacts = array_keys(array_filter($found['CONTACT'], function ($m) { return $m !== 'domain'; }));
$exactContacts = array_values(array_intersect($exactContacts, $contactIds));
$directCompanies = array_values(array_intersect(array_keys($found['COMPANY']), $companyIds));

if (count($exactContacts) === 1) {
    $ctId = $exactContacts[0];
    $cids = array_values(array_intersect($contactCompanies[$ctId] ?? [], $companyIds));
    $suggested = ['contact_id' => $ctId, 'company_id' => count($cids) === 1 ? $cids[0] : null];
} elseif (empty($exactContacts) && count($directCompanies) === 1) {
    $suggested = ['contact_id' => null, 'company_id' => $directCompanies[0]];
} elseif (empty($exactContacts) && empty($directCompanies)) {
    // Только по домену: если все найденные контакты из одной компании — её и предлагаем.
    if (count($companyIds) === 1) $suggested = ['contact_id' => null, 'company_id' => $companyIds[0]];
}

crystalClientsRespond([
    'tz'          => CRYSTAL_CLIENTS_TZ,
    'query'       => $query,
    'found'       => !empty($contacts) || !empty($companies) || !empty($leads),
    'suggested'   => $suggested,
    'contacts'    => $contacts,
    'companies'   => $companies,
    'leads'       => $leads,
    'deals'       => $deals,
    'deals_total' => $dealsTotal,
]);
