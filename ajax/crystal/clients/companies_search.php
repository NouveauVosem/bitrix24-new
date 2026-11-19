<?php
// Поиск компаний для Кристала: автодополнение в делах и tool ИИ-чата (BITRIX-TZ.md, п. 1).
//
// Параметры:
//   q              — часть названия, VAT, email, домена сайта или телефона (от 2 символов);
//   ids            — id через запятую: вернуть именно эти компании (вместо q);
//   assigned_by_id — только компании этого ответственного;
//   limit          — 20, не больше 100;
//   offset         — 0.
//
// Где ищем (match — первое сработавшее, в этом порядке):
//   title — название; регистр, кавычки, пунктуация и орг.-правовая форма игнорируются,
//           каждое слово запроса должно встретиться в названии;
//   vat   — UF «VAT номер» и VAT/ИНН реквизита, без пробелов, точек и дефисов;
//   phone — телефоны компании и её контактов, по последним 9 цифрам;
//   email — email компании и её контактов;
//   web   — сайт компании.
// Сортировка: точное совпадение → начало названия → прочие; внутри — по дате последней сделки.
require __DIR__ . '/_common.php';

const CRYSTAL_SEARCH_SOURCE_LIMIT = 500; // кандидатов с одного источника

$limit        = crystalClientsNumber('limit', 20, 1, 100);
$offset       = crystalClientsNumber('offset', 0, 0, null);
$assignedById = crystalClientsId('assigned_by_id');
$ids          = crystalClientsIdList('ids');
$q            = preg_replace('/\s+/u', ' ', crystalClientsParam('q'));

// ── Нормализация названия ────────────────────────────────────────────────────
// Организационно-правовые формы — словами после удаления пунктуации («s.r.o.» → «s r o»).
const CRYSTAL_SEARCH_LEGAL_FORMS = [
    'spol s r o', 'spol sro', 's r o', 'sro', 'a s', 'as', 'k s', 'v o s',
    'gmbh und co kg', 'gmbh co kg', 'gmbh co', 'co kg', 'gmbh', 'ag', 'kg', 'ug', 'ohg', 'e k', 'e v', 'kgaa',
    's a s u', 'sasu', 's a s', 'sas', 's a r l', 'sarl', 'eurl', 'snc', 's a', 'sa', 'sa de cv',
    's r l', 'srl', 's p a', 'spa', 's n c', 's l', 'sl', 's l u', 'slu', 'lda', 'ltda',
    'sp z o o', 'sp zoo', 'spzoo', 'sp j', 'sp k', 's c', 'sc',
    'b v', 'bv', 'n v', 'nv', 'vof', 'bvba', 'sprl', 'srl',
    'co ltd', 'pty ltd', 'pty', 'ltd', 'limited', 'llc', 'l l c', 'llp', 'lp', 'inc', 'corp', 'corporation', 'plc', 'co',
    'oy', 'oyj', 'ab', 'aps', 'asa', 'a b', 'kft', 'zrt', 'nyrt', 'bt', 'd o o', 'doo', 'd d', 'dd', 'ood', 'eood', 'ad',
    'sia', 'uab', 'ou', 'as', 'aas', 'srl', 'sa',
    'ооо', 'оао', 'зао', 'пао', 'ао', 'тов', 'тзов', 'пп', 'фоп', 'ип', 'тоо', 'чп', 'прат', 'пат', 'ат', 'дп',
];

function crystalSearchLegalForms()
{
    static $forms = null;
    if ($forms === null) {
        $forms = [];
        foreach (array_unique(CRYSTAL_SEARCH_LEGAL_FORMS) as $f) $forms[] = explode(' ', $f);
        // Длинные формы первыми: «spol s r o» раньше, чем «s r o».
        usort($forms, function ($a, $b) { return count($b) - count($a); });
    }
    return $forms;
}

// «"INTEAL" S.A.» → «inteal». Если от названия ничего не осталось бы, форму не убираем.
function crystalSearchNormalizeTitle($s)
{
    $s = mb_strtolower((string)$s, 'UTF-8');
    $s = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $s);
    $tokens = preg_split('/\s+/u', trim($s), -1, PREG_SPLIT_NO_EMPTY);

    $changed = true;
    while ($changed) {
        $changed = false;
        foreach (crystalSearchLegalForms() as $form) {
            $n = count($form);
            if (count($tokens) <= $n) continue;
            if (array_slice($tokens, -$n) === $form) {
                $tokens = array_slice($tokens, 0, -$n);
                $changed = true;
                break;
            }
            if (array_slice($tokens, 0, $n) === $form) {
                $tokens = array_slice($tokens, $n);
                $changed = true;
                break;
            }
        }
    }
    return implode(' ', $tokens);
}

// ── Источники поиска: [companyId => rank], rank 0 — точное совпадение ────────
function crystalSearchByTitle($core)
{
    $tokens = array_values(array_filter(explode(' ', $core), function ($t) { return mb_strlen($t, 'UTF-8') >= 2; }));
    if (empty($tokens)) $tokens = [$core];

    $filter = ['LOGIC' => 'AND'];
    foreach ($tokens as $t) $filter[] = ['%TITLE' => $t];

    $found = [];
    $rows = \Bitrix\Crm\CompanyTable::getList([
        'filter' => $filter,
        'select' => ['ID', 'TITLE'],
        'order'  => ['ID' => 'DESC'],
        'limit'  => CRYSTAL_SEARCH_SOURCE_LIMIT,
    ]);
    while ($r = $rows->fetch()) {
        $title = crystalSearchNormalizeTitle($r['TITLE']);
        if ($title === $core) {
            $rank = 0;
        } elseif (mb_strpos($title, $core, 0, 'UTF-8') === 0) {
            $rank = 1;
        } else {
            $rank = 2;
        }
        $found[(int)$r['ID']] = $rank;
    }
    return $found;
}

// SQL-выражение: значение без пробелов, точек, дефисов, скобок, слэшей и плюсов.
function crystalSearchStripSql($column)
{
    $sql = $column;
    foreach ([' ', '.', '-', '(', ')', '/', '+', "\t"] as $ch) {
        $sql = "REPLACE($sql, '" . ($ch === "\t" ? '\\t' : $ch) . "', '')";
    }
    return $sql;
}

function crystalSearchByVat($needle)
{
    $conn = \Bitrix\Main\Application::getConnection();
    $like = $conn->getSqlHelper()->forSql('%' . $needle . '%');
    $found = [];

    $exact = function ($value) use ($needle) {
        return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)$value)) === $needle ? 0 : 2;
    };

    try {
        $col = CRYSTAL_CLIENTS_VAT_FIELD;
        $rows = $conn->query(
            "SELECT VALUE_ID, $col AS V FROM b_uts_crm_company WHERE UPPER(" . crystalSearchStripSql($col) . ") LIKE '$like'"
            . ' LIMIT ' . CRYSTAL_SEARCH_SOURCE_LIMIT
        );
        while ($r = $rows->fetch()) $found[(int)$r['VALUE_ID']] = $exact($r['V']);
    } catch (\Throwable $e) {
    }

    try {
        $rows = $conn->query(
            'SELECT ENTITY_ID, RQ_VAT_ID, RQ_INN FROM b_crm_requisite WHERE ENTITY_TYPE_ID = ' . \CCrmOwnerType::Company
            . " AND (UPPER(" . crystalSearchStripSql('RQ_VAT_ID') . ") LIKE '$like' OR UPPER(" . crystalSearchStripSql('RQ_INN') . ") LIKE '$like')"
            . ' LIMIT ' . CRYSTAL_SEARCH_SOURCE_LIMIT
        );
        while ($r = $rows->fetch()) {
            $cid = (int)$r['ENTITY_ID'];
            $rank = min($exact($r['RQ_VAT_ID']), $exact($r['RQ_INN']));
            $found[$cid] = min($found[$cid] ?? 2, $rank);
        }
    } catch (\Throwable $e) {
    }
    return $found;
}

// Телефоны/email/сайты компаний и контактов. $sqlWhere — условие на VALUE.
// Контакты переводятся в их компании. $rankOf(VALUE) — ранг совпадения.
function crystalSearchByMulti($typeId, array $entities, $sqlWhere, callable $rankOf)
{
    $conn = \Bitrix\Main\Application::getConnection();
    $entitiesSql = "'" . implode("','", $entities) . "'";
    $rows = $conn->query(
        "SELECT ENTITY_ID, ELEMENT_ID, VALUE FROM b_crm_field_multi"
        . " WHERE TYPE_ID = '$typeId' AND ENTITY_ID IN ($entitiesSql) AND $sqlWhere"
        . ' LIMIT ' . CRYSTAL_SEARCH_SOURCE_LIMIT
    );

    $companies = [];
    $contacts  = [];
    while ($r = $rows->fetch()) {
        $id = (int)$r['ELEMENT_ID'];
        $rank = $rankOf($r['VALUE']);
        if ($r['ENTITY_ID'] === 'COMPANY') {
            $companies[$id] = min($companies[$id] ?? 2, $rank);
        } else {
            $contacts[$id] = min($contacts[$id] ?? 2, $rank);
        }
    }

    foreach (crystalClientsContactCompanies(array_keys($contacts)) as $contactId => $companyIds) {
        foreach ($companyIds as $cid) {
            $companies[$cid] = min($companies[$cid] ?? 2, $contacts[$contactId]);
        }
    }
    return $companies;
}

// ── Кандидаты: [companyId => ['match' => …, 'rank' => …]] ───────────────────
$candidates = [];

if (!empty($ids)) {
    foreach ($ids as $id) $candidates[$id] = ['match' => 'id', 'rank' => 0];
} else {
    if (mb_strlen($q, 'UTF-8') < 2) {
        crystalClientsError('нужен параметр q (от 2 символов) или ids');
    }

    $add = function (array $found, $match) use (&$candidates) {
        foreach ($found as $cid => $rank) {
            if (!isset($candidates[$cid])) {
                $candidates[$cid] = ['match' => $match, 'rank' => $rank];
            } elseif ($rank < $candidates[$cid]['rank']) {
                // Точное совпадение по VAT/телефону важнее частичного по названию.
                $candidates[$cid] = ['match' => $match, 'rank' => $rank];
            }
        }
    };
    $sqlHelper = \Bitrix\Main\Application::getConnection()->getSqlHelper();

    $core = crystalSearchNormalizeTitle($q);
    $singleToken = ($core !== '' && strpos($core, ' ') === false && mb_strlen($core, 'UTF-8') >= 3) ? $core : null;

    // Название
    if ($core !== '') {
        $add(crystalSearchByTitle($core), 'title');
    }

    // VAT: в запросе есть цифры, после чистки от 5 символов
    $vatNeedle = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $q));
    if (strlen($vatNeedle) >= 5 && preg_match('/\d/', $vatNeedle)) {
        $add(crystalSearchByVat($vatNeedle), 'vat');
    }

    // Телефон: запрос похож на номер, от 7 цифр; сравниваем последние 9
    $digits = crystalClientsPhoneDigits($q);
    if (strlen($digits) >= 7 && preg_match('/^[\d\s+\-().\/]+$/', $q)) {
        $tail = substr($digits, -9);
        $add(crystalSearchByMulti(
            'PHONE', ['COMPANY', 'CONTACT'],
            crystalSearchStripSql('VALUE') . " LIKE '" . $sqlHelper->forSql('%' . $tail) . "'",
            function ($value) use ($tail) {
                return substr(crystalClientsPhoneDigits($value), -9) === $tail ? 0 : 2;
            }
        ), 'phone');
    }

    // Домен: «inteal.fr», «www.inteal.fr», «https://inteal.fr/…»
    $domain = crystalClientsDomain($q);
    $isDomain = strpos($q, '@') === false && preg_match('/^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)*\.\p{L}{2,}$/u', $domain);

    // Email: целиком, домен или одно слово названия
    $emailNeedle = strpos($q, '@') !== false ? mb_strtolower($q, 'UTF-8') : ($isDomain ? $domain : $singleToken);
    if ($emailNeedle !== null && mb_strlen($emailNeedle, 'UTF-8') >= 3) {
        $add(crystalSearchByMulti(
            'EMAIL', ['COMPANY', 'CONTACT'],
            "VALUE LIKE '" . $sqlHelper->forSql('%' . $emailNeedle . '%') . "'",
            function ($value) use ($emailNeedle) {
                $v = mb_strtolower(trim($value), 'UTF-8');
                return ($v === $emailNeedle || mb_substr($v, -mb_strlen('@' . $emailNeedle)) === '@' . $emailNeedle) ? 0 : 2;
            }
        ), 'email');
    }

    // Сайт компании
    $webNeedle = $isDomain ? $domain : $singleToken;
    if ($webNeedle !== null) {
        $add(crystalSearchByMulti(
            'WEB', ['COMPANY'],
            "VALUE LIKE '" . $sqlHelper->forSql('%' . $webNeedle . '%') . "'",
            function ($value) use ($webNeedle) {
                return crystalClientsDomain($value) === $webNeedle ? 0 : 2;
            }
        ), 'web');
    }
}

if (empty($candidates)) {
    crystalClientsRespond(['items' => [], 'total' => 0, 'next_offset' => null]);
}

// ── Компании-кандидаты (с фильтром по ответственному) ────────────────────────
$filter = ['@ID' => array_keys($candidates)];
if ($assignedById) $filter['=ASSIGNED_BY_ID'] = $assignedById;

$companies = [];
$rows = \Bitrix\Crm\CompanyTable::getList([
    'filter' => $filter,
    'select' => ['ID', 'TITLE', 'ASSIGNED_BY_ID', CRYSTAL_CLIENTS_VAT_FIELD, CRYSTAL_CLIENTS_COUNTRY_FIELD],
]);
while ($c = $rows->fetch()) $companies[(int)$c['ID']] = $c;

if (empty($companies)) {
    crystalClientsRespond(['items' => [], 'total' => 0, 'next_offset' => null]);
}

// ── Сделки: дата последней и число открытых ──────────────────────────────────
$dealStats = [];
$rows = \Bitrix\Main\Application::getConnection()->query(
    "SELECT COMPANY_ID, MAX(DATE_CREATE) AS LAST_DATE, SUM(CASE WHEN STAGE_SEMANTIC_ID = 'P' THEN 1 ELSE 0 END) AS OPEN_CNT"
    . ' FROM b_crm_deal WHERE COMPANY_ID IN (' . implode(',', array_keys($companies)) . ') GROUP BY COMPANY_ID'
);
while ($r = $rows->fetch()) {
    $dealStats[(int)$r['COMPANY_ID']] = [
        'last' => crystalClientsDate($r['LAST_DATE']),
        'open' => (int)$r['OPEN_CNT'],
    ];
}

// ── Сортировка и страница ────────────────────────────────────────────────────
$order = array_keys($companies);
if (!empty($ids)) {
    $pos = array_flip($ids);
    usort($order, function ($a, $b) use ($pos) { return $pos[$a] - $pos[$b]; });
} else {
    usort($order, function ($a, $b) use ($candidates, $dealStats) {
        if ($candidates[$a]['rank'] !== $candidates[$b]['rank']) {
            return $candidates[$a]['rank'] - $candidates[$b]['rank'];
        }
        $da = $dealStats[$a]['last'] ?? '';
        $db = $dealStats[$b]['last'] ?? '';
        if ($da !== $db) return strcmp($db, $da);
        return $b - $a;
    });
}

$total = count($order);
$page = array_slice($order, $offset, $limit);

// ── Подробности только для страницы ─────────────────────────────────────────
$multi      = crystalClientsMultiFields('COMPANY', $page);
$requisites = crystalClientsRequisites($page);
$addresses  = crystalClientsAddresses($page, array_intersect_key($requisites, array_flip($page)));
$users      = crystalClientsUserNames(array_map(function ($id) use ($companies) {
    return $companies[$id]['ASSIGNED_BY_ID'];
}, $page));

$items = [];
foreach ($page as $id) {
    $c  = $companies[$id];
    $rq = $requisites[$id] ?? null;
    $ad = $addresses[$id] ?? null;
    $assigned = (int)$c['ASSIGNED_BY_ID'];

    $items[] = [
        'id'               => $id,
        'title'            => $c['TITLE'],
        'full_title'       => crystalClientsFullTitle($rq),
        'country'          => crystalClientsCountry($c, $ad),
        'country_code'     => $ad['country_code'] ?? null,
        'city'             => $ad['city'] ?? null,
        'vat'              => crystalClientsVat($c, $rq),
        'assigned_by_id'   => $assigned ?: null,
        'assigned_by_name' => $users[$assigned] ?? null,
        'phones'           => $multi[$id]['phones'],
        'emails'           => $multi[$id]['emails'],
        'web'              => $multi[$id]['web'],
        'last_deal_date'   => $dealStats[$id]['last'] ?? null,
        'open_deals'       => $dealStats[$id]['open'] ?? 0,
        'match'            => $candidates[$id]['match'],
    ];
}

crystalClientsRespond([
    'items'       => $items,
    'total'       => $total,
    'next_offset' => $offset + $limit < $total ? $offset + $limit : null,
]);
