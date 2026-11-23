<?php
// Общее для эндпоинтов «Клиенты» Кристала (ТЗ — BITRIX-TZ.md):
//   companies_search.php — поиск компаний (автодополнение в делах, tool ИИ-чата);
//   company.php          — полная карточка компании для ИИ-чата.
//
// В отличие от stats/, ошибки здесь отдаются с HTTP-кодом 4xx/5xx — так в ТЗ.
// Токен тот же, что у stats/ (в коде хранится его SHA-256).
//
// Данные берём через ORM и прямой SQL, а не через CCrmCompany/CCrmContact::GetList:
// легаси-API без сессии пользователя молча возвращает пустоту (см. client_by_email.php).

define('CRYSTAL_CLIENTS_STARTED', microtime(true));

define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', true);
require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

\Bitrix\Main\Loader::includeModule('crm');

const CRYSTAL_CLIENTS_TZ            = 'Europe/Kyiv';
const CRYSTAL_CLIENTS_TEXT_MAX      = 2000;
const CRYSTAL_CLIENTS_VAT_FIELD     = 'UF_CRM_1717094608804'; // VAT номер
const CRYSTAL_CLIENTS_COUNTRY_FIELD = 'UF_CRM_1717094712004'; // Страна компании (список)
const CRYSTAL_CLIENTS_LEGAL_ADDRESS = 'UF_CRM_1718030299507'; // Юридический адрес
const CRYSTAL_CLIENTS_AMOUNT_FIELD  = 'UF_CRM_1728403359608'; // Общая сумма сделки с НДС
const CRYSTAL_CLIENTS_TOKEN_SHA256  = '61154f2a8bab2dfcb2aa6c0c0ea46874317214043ddb4af4c83858d4e736dd71';

// ── Ответ ─────────────────────────────────────────────────────────────────────
function crystalClientsRespond(array $data, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Response-Time-Ms: ' . (int)round((microtime(true) - CRYSTAL_CLIENTS_STARTED) * 1000));
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    die();
}

function crystalClientsError($message, $status = 400)
{
    crystalClientsRespond(['error' => $message], $status);
}

set_exception_handler(function ($e) {
    crystalClientsError('internal error: ' . $e->getMessage(), 500);
});

// ── Авторизация ──────────────────────────────────────────────────────────────
$crystalClientsToken = (string)($_SERVER['HTTP_X_API_TOKEN'] ?? $_GET['token'] ?? $_POST['token'] ?? '');
if (!hash_equals(CRYSTAL_CLIENTS_TOKEN_SHA256, hash('sha256', $crystalClientsToken))) {
    crystalClientsError('Unauthorized', 401);
}

// ── Параметры ────────────────────────────────────────────────────────────────
function crystalClientsParam($name)
{
    return trim((string)($_GET[$name] ?? $_POST[$name] ?? ''));
}

// Положительное целое; null, если параметр не передан.
function crystalClientsId($name, $required = false)
{
    $raw = crystalClientsParam($name);
    if ($raw === '') {
        if ($required) crystalClientsError("параметр $name обязателен");
        return null;
    }
    if (!ctype_digit($raw) || (int)$raw <= 0) {
        crystalClientsError("неверный $name: «{$raw}», нужно целое число больше 0");
    }
    return (int)$raw;
}

function crystalClientsIdList($name)
{
    $raw = crystalClientsParam($name);
    if ($raw === '') return [];
    $ids = [];
    foreach (explode(',', $raw) as $v) {
        $v = trim($v);
        if ($v === '') continue;
        if (!ctype_digit($v) || (int)$v <= 0) {
            crystalClientsError("неверный $name: «{$v}», нужны числовые ID через запятую");
        }
        $ids[] = (int)$v;
    }
    return array_values(array_unique($ids));
}

function crystalClientsNumber($name, $default, $min, $max)
{
    $raw = crystalClientsParam($name);
    if ($raw === '') return $default;
    if (!ctype_digit($raw) || (int)$raw < $min) {
        crystalClientsError("неверный $name: «{$raw}», нужно целое число не меньше $min");
    }
    return $max === null ? (int)$raw : min((int)$raw, $max);
}

// ── Форматирование ───────────────────────────────────────────────────────────
// Дата-время → 'YYYY-MM-DD HH:MM:SS' в поясе Киева. Принимает объекты Битрикса,
// строки из прямого SQL (время сервера) и unix-время.
function crystalClientsDateTime($value)
{
    if ($value === null || $value === '' || $value === false) return null;
    try {
        if ($value instanceof \Bitrix\Main\Type\Date) {
            if (!($value instanceof \Bitrix\Main\Type\DateTime)) {
                return $value->format('Y-m-d') . ' 00:00:00';
            }
            $ts = $value->getTimestamp();
        } elseif (is_int($value)) {
            $ts = $value;
        } else {
            $value = (string)$value;
            if (strpos($value, '0000-00-00') === 0) return null;
            $ts = (new \DateTime($value))->getTimestamp();
        }
    } catch (\Throwable $e) {
        return null;
    }
    return (new \DateTime('@' . $ts))->setTimezone(new \DateTimeZone(CRYSTAL_CLIENTS_TZ))->format('Y-m-d H:i:s');
}

function crystalClientsDate($value)
{
    $dt = crystalClientsDateTime($value);
    return $dt === null ? null : substr($dt, 0, 10);
}

// Текст для модели: без HTML и BB-кодов, не длиннее 2000 символов. Пусто → null.
function crystalClientsText($s, $max = CRYSTAL_CLIENTS_TEXT_MAX)
{
    $s = (string)$s;
    if (trim($s) === '') return null;

    $s = preg_replace('~\[disk file id=[^\]]*\]~iu', ' ', $s);
    $s = preg_replace(
        '~\[/?(?:b|i|u|s|url|img|user|list|\*|quote|code|color|size|font|table|tr|td|th|p|left|right|center|justify|br|hr|video|sub|sup|indent|h[1-6])(?:=[^\]]*)?\]~iu',
        ' ',
        $s
    );
    $s = preg_replace('~<br\s*/?>|</p>|</div>|</li>~iu', "\n", $s);
    $s = strip_tags($s);
    $s = html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $s = str_replace(["\r\n", "\r", "\xC2\xA0"], ["\n", "\n", ' '], $s);
    $s = preg_replace('/[ \t]+/u', ' ', $s);
    $s = preg_replace('/ *\n */u', "\n", $s);
    $s = preg_replace('/\n{3,}/u', "\n\n", $s);
    $s = trim($s);
    if ($s === '') return null;

    if (mb_strlen($s, 'UTF-8') > $max) {
        $s = rtrim(mb_substr($s, 0, $max - 1, 'UTF-8')) . '…';
    }
    return $s;
}

// Телефон: только цифры; ведущее «00» международного формата убираем.
// Код страны остаётся, если он был в номере; местный номер без кода дополнить нечем.
function crystalClientsPhoneDigits($raw)
{
    $digits = preg_replace('/\D+/', '', (string)$raw);
    if (strpos($digits, '00') === 0) $digits = substr($digits, 2);
    return $digits;
}

// Сайт → домен: «https://www.Inteal.fr/contact» → «inteal.fr».
function crystalClientsDomain($raw)
{
    $s = mb_strtolower(trim((string)$raw), 'UTF-8');
    $s = preg_replace('~^[a-z][a-z0-9+.-]*://~', '', $s);
    $s = preg_replace('~^www\.~', '', $s);
    $s = preg_split('~[/?#\s]~', $s)[0];
    return rtrim($s, '.');
}

function crystalClientsMoney($v)
{
    return round((float)$v, 2);
}

// ── Справочники ──────────────────────────────────────────────────────────────
function crystalClientsUserNames(array $ids)
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (empty($ids)) return [];
    $names = [];
    $rows = \Bitrix\Main\UserTable::getList([
        'filter' => ['@ID' => $ids],
        'select' => ['ID', 'NAME', 'LAST_NAME', 'LOGIN'],
    ]);
    while ($u = $rows->fetch()) {
        $name = trim($u['NAME'] . ' ' . $u['LAST_NAME']);
        $names[(int)$u['ID']] = $name !== '' ? $name : $u['LOGIN'];
    }
    return $names;
}

// Варианты списочного UF-поля: [id варианта => подпись].
function crystalClientsEnumLabels($fieldName)
{
    static $cache = [];
    if (!isset($cache[$fieldName])) {
        $cache[$fieldName] = [];
        $enum = \CUserFieldEnum::GetList([], ['USER_FIELD_NAME' => $fieldName]);
        while ($e = $enum->Fetch()) {
            $cache[$fieldName][(int)$e['ID']] = $e['VALUE'];
        }
    }
    return $cache[$fieldName];
}

// Справочник CRM (COMPANY_TYPE, INDUSTRY…): [STATUS_ID => название].
function crystalClientsStatusNames($entityId)
{
    $names = [];
    $rows = \Bitrix\Crm\StatusTable::getList([
        'filter' => ['=ENTITY_ID' => $entityId],
        'select' => ['STATUS_ID', 'NAME'],
    ]);
    while ($s = $rows->fetch()) {
        $names[$s['STATUS_ID']] = $s['NAME'];
    }
    return $names;
}

// Телефоны, email и сайты: [id => ['phones' => [...], 'emails' => [...], 'web' => [...]]].
// $entity — 'COMPANY' или 'CONTACT'.
function crystalClientsMultiFields($entity, array $ids)
{
    $out = [];
    foreach ($ids as $id) $out[(int)$id] = ['phones' => [], 'emails' => [], 'web' => []];
    if (empty($ids)) return $out;

    $rows = \Bitrix\Crm\FieldMultiTable::getList([
        'filter' => ['=ENTITY_ID' => $entity, '@ELEMENT_ID' => array_keys($out), '@TYPE_ID' => ['PHONE', 'EMAIL', 'WEB']],
        'select' => ['ELEMENT_ID', 'TYPE_ID', 'VALUE_TYPE', 'VALUE'],
        'order'  => ['ID' => 'ASC'],
    ]);
    while ($r = $rows->fetch()) {
        $id = (int)$r['ELEMENT_ID'];
        $value = trim((string)$r['VALUE']);
        if ($value === '') continue;

        if ($r['TYPE_ID'] === 'PHONE') {
            $out[$id]['phones'][] = [
                'value' => crystalClientsPhoneDigits($value),
                'raw'   => $value,
                'type'  => $r['VALUE_TYPE'] ?: null,
            ];
        } elseif ($r['TYPE_ID'] === 'EMAIL') {
            $email = mb_strtolower($value, 'UTF-8');
            if (!in_array($email, $out[$id]['emails'], true)) $out[$id]['emails'][] = $email;
        } else {
            $domain = crystalClientsDomain($value);
            if ($domain !== '' && !in_array($domain, $out[$id]['web'], true)) $out[$id]['web'][] = $domain;
        }
    }
    return $out;
}

// Первый реквизит каждой компании (полное название, VAT, рег. номер): [companyId => row].
function crystalClientsRequisites(array $companyIds)
{
    $companyIds = array_values(array_unique(array_filter(array_map('intval', $companyIds))));
    if (empty($companyIds)) return [];
    $out = [];
    try {
        $rows = \Bitrix\Main\Application::getConnection()->query(
            'SELECT * FROM b_crm_requisite WHERE ENTITY_TYPE_ID = ' . \CCrmOwnerType::Company
            . ' AND ENTITY_ID IN (' . implode(',', $companyIds) . ') ORDER BY SORT ASC, ID ASC'
        );
        while ($r = $rows->fetch()) {
            $cid = (int)$r['ENTITY_ID'];
            if (!isset($out[$cid])) $out[$cid] = $r;
        }
    } catch (\Throwable $e) {
        return [];
    }
    return $out;
}

// Адрес компании: [companyId => ['address' => '…', 'city' => '…', 'country' => '…', 'country_code' => 'FR']].
// Приоритет: адрес самой компании, потом адреса её реквизитов; внутри — фактический (1), юридический (6), прочие.
function crystalClientsAddresses(array $companyIds, array $requisites)
{
    $companyIds = array_values(array_unique(array_filter(array_map('intval', $companyIds))));
    if (empty($companyIds)) return [];

    $requisiteOwner = [];
    foreach ($requisites as $cid => $rq) $requisiteOwner[(int)$rq['ID']] = (int)$cid;

    $where = '(ENTITY_TYPE_ID = ' . \CCrmOwnerType::Company . ' AND ENTITY_ID IN (' . implode(',', $companyIds) . '))';
    if (!empty($requisiteOwner)) {
        $where .= ' OR (ENTITY_TYPE_ID = ' . \CCrmOwnerType::Requisite . ' AND ENTITY_ID IN (' . implode(',', array_keys($requisiteOwner)) . '))';
    }

    $best = [];
    try {
        $rows = \Bitrix\Main\Application::getConnection()->query("SELECT * FROM b_crm_addr WHERE $where");
        while ($a = $rows->fetch()) {
            $isCompany = (int)$a['ENTITY_TYPE_ID'] === \CCrmOwnerType::Company;
            $cid = $isCompany ? (int)$a['ENTITY_ID'] : ($requisiteOwner[(int)$a['ENTITY_ID']] ?? 0);
            if (!$cid) continue;

            $parts = [];
            foreach (['ADDRESS_1', 'ADDRESS_2', 'POSTAL_CODE', 'CITY', 'REGION', 'PROVINCE', 'COUNTRY'] as $f) {
                $v = trim((string)($a[$f] ?? ''));
                if ($v !== '') $parts[] = $v;
            }
            if (empty($parts)) continue;

            $typeRank = ['1' => 0, '6' => 1][(string)$a['TYPE_ID']] ?? 2;
            $rank = ($isCompany ? 0 : 10) + $typeRank;
            if (isset($best[$cid]) && $best[$cid]['rank'] <= $rank) continue;

            $best[$cid] = [
                'rank'         => $rank,
                'address'      => implode(', ', $parts),
                'city'         => trim((string)($a['CITY'] ?? '')) ?: null,
                'country'      => trim((string)($a['COUNTRY'] ?? '')) ?: null,
                'country_code' => strtoupper(trim((string)($a['COUNTRY_CODE'] ?? ''))) ?: null,
            ];
        }
    } catch (\Throwable $e) {
        return [];
    }
    foreach ($best as &$b) unset($b['rank']);
    unset($b);
    return $best;
}

// Поля реквизита, в которых может лежать регистрационный номер (IČO, EDRPOU, REGON, SIREN…).
const CRYSTAL_CLIENTS_REG_FIELDS = [
    'RQ_IN', 'RQ_EDRPOU', 'RQ_REGON', 'RQ_KRS', 'RQ_SIREN', 'RQ_SIRET',
    'RQ_OGRN', 'RQ_STATE_REG', 'RQ_COMPANY_REG_NO', 'RQ_INN',
];

function crystalClientsRegNumber(?array $rq)
{
    if (!$rq) return null;
    foreach (CRYSTAL_CLIENTS_REG_FIELDS as $f) {
        $v = trim((string)($rq[$f] ?? ''));
        if ($v !== '') return $v;
    }
    return null;
}

// VAT: UF-поле компании, если пусто — VAT/ИНН из реквизита.
function crystalClientsVat(array $company, ?array $rq)
{
    $v = trim((string)($company[CRYSTAL_CLIENTS_VAT_FIELD] ?? ''));
    if ($v === '' && $rq) $v = trim((string)($rq['RQ_VAT_ID'] ?? '')) ?: trim((string)($rq['RQ_INN'] ?? ''));
    return $v !== '' ? $v : null;
}

function crystalClientsFullTitle(?array $rq)
{
    if (!$rq) return null;
    $v = trim((string)($rq['RQ_COMPANY_FULL_NAME'] ?? '')) ?: trim((string)($rq['RQ_COMPANY_NAME'] ?? ''));
    return $v !== '' ? $v : null;
}

// Страна: подпись из списка «Страна компании», иначе страна из адреса.
function crystalClientsCountry(array $company, ?array $address)
{
    $labels = crystalClientsEnumLabels(CRYSTAL_CLIENTS_COUNTRY_FIELD);
    $enumId = (int)($company[CRYSTAL_CLIENTS_COUNTRY_FIELD] ?? 0);
    return $labels[$enumId] ?? ($address['country'] ?? null);
}

// Компании, к которым привязаны контакты: [contactId => [companyId, …]].
function crystalClientsContactCompanies(array $contactIds)
{
    $contactIds = array_values(array_unique(array_filter(array_map('intval', $contactIds))));
    $out = [];
    if (empty($contactIds)) return $out;

    $rows = \Bitrix\Crm\ContactTable::getList([
        'filter' => ['@ID' => $contactIds, '>COMPANY_ID' => 0],
        'select' => ['ID', 'COMPANY_ID'],
    ]);
    while ($r = $rows->fetch()) $out[(int)$r['ID']][] = (int)$r['COMPANY_ID'];

    if (class_exists('\Bitrix\Crm\Binding\ContactCompanyTable')) {
        $rows = \Bitrix\Crm\Binding\ContactCompanyTable::getList([
            'filter' => ['@CONTACT_ID' => $contactIds],
            'select' => ['CONTACT_ID', 'COMPANY_ID'],
        ]);
        while ($r = $rows->fetch()) $out[(int)$r['CONTACT_ID']][] = (int)$r['COMPANY_ID'];
    }
    foreach ($out as &$list) $list = array_values(array_unique($list));
    unset($list);
    return $out;
}

// ── Дата из параметра (пояс Киева) → объект Битрикса ─────────────────────────
// Принимает 'YYYY-MM-DD' или 'YYYY-MM-DD HH:MM[:SS]'. Для $endOfDay дата без
// времени означает конец дня (23:59:59). null, если параметр не передан.
function crystalClientsDateParam($name, $endOfDay = false)
{
    $raw = str_replace('T', ' ', crystalClientsParam($name));
    if ($raw === '') return null;
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
        $raw .= $endOfDay ? ' 23:59:59' : ' 00:00:00';
    } elseif (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $raw)) {
        $raw .= ':00';
    }
    $dt = \DateTime::createFromFormat('Y-m-d H:i:s', $raw, new \DateTimeZone(CRYSTAL_CLIENTS_TZ));
    if (!$dt || $dt->format('Y-m-d H:i:s') !== $raw) {
        crystalClientsError("неверный $name: «{$raw}», нужно YYYY-MM-DD или YYYY-MM-DD HH:MM:SS");
    }
    return \Bitrix\Main\Type\DateTime::createFromPhp($dt);
}

// Дата-время из БД, где «нет срока» записано как 9999-12-31 → null.
function crystalClientsDeadline($value)
{
    if ($value instanceof \Bitrix\Main\Type\Date) {
        if ((int)$value->format('Y') >= 9999) return null;
    } elseif (strpos((string)$value, '9999') === 0) {
        return null;
    }
    return crystalClientsDateTime($value);
}

// Да/нет из параметра; null, если не передан.
function crystalClientsFlag($name)
{
    $v = mb_strtolower(crystalClientsParam($name));
    if ($v === '') return null;
    return in_array($v, ['1', 'y', 'yes', 'true'], true);
}

// ── Сущности CRM из параметров ───────────────────────────────────────────────
// lead_id, deal_id, contact_id, company_id — id или список через запятую.
// expand=1: компания → её контакты, сделки и лиды; контакт → его сделки и лиды.
// Возвращает [ownerTypeId => [id, …]] (1 лид, 2 сделка, 3 контакт, 4 компания);
// пустой массив, если ни один параметр не передан.
const CRYSTAL_CLIENTS_EXPAND_LIMIT = 5000;

function crystalClientsOwnersFromParams()
{
    $owners = [
        \CCrmOwnerType::Lead    => crystalClientsIdList('lead_id'),
        \CCrmOwnerType::Deal    => crystalClientsIdList('deal_id'),
        \CCrmOwnerType::Contact => crystalClientsIdList('contact_id'),
        \CCrmOwnerType::Company => crystalClientsIdList('company_id'),
    ];
    if (empty(array_filter($owners))) return [];

    if (crystalClientsFlag('expand')) {
        $add = function ($type, array $ids) use (&$owners) {
            $owners[$type] = array_values(array_unique(array_merge($owners[$type], $ids)));
        };
        $column = function ($class, array $filter, $field) {
            $rows = $class::getList(['filter' => $filter, 'select' => [$field], 'limit' => CRYSTAL_CLIENTS_EXPAND_LIMIT]);
            $ids = [];
            while ($r = $rows->fetch()) $ids[] = (int)$r[$field];
            return $ids;
        };

        $companyIds = $owners[\CCrmOwnerType::Company];
        if (!empty($companyIds)) {
            $add(\CCrmOwnerType::Contact, $column('\Bitrix\Crm\ContactTable', ['@COMPANY_ID' => $companyIds], 'ID'));
            if (class_exists('\Bitrix\Crm\Binding\ContactCompanyTable')) {
                $add(\CCrmOwnerType::Contact, $column('\Bitrix\Crm\Binding\ContactCompanyTable', ['@COMPANY_ID' => $companyIds], 'CONTACT_ID'));
            }
            $add(\CCrmOwnerType::Deal, $column('\Bitrix\Crm\DealTable', ['@COMPANY_ID' => $companyIds], 'ID'));
            $add(\CCrmOwnerType::Lead, $column('\Bitrix\Crm\LeadTable', ['@COMPANY_ID' => $companyIds], 'ID'));
        }

        $contactIds = $owners[\CCrmOwnerType::Contact];
        if (!empty($contactIds)) {
            $add(\CCrmOwnerType::Deal, $column('\Bitrix\Crm\DealTable', ['@CONTACT_ID' => $contactIds], 'ID'));
            if (class_exists('\Bitrix\Crm\Binding\DealContactTable')) {
                $add(\CCrmOwnerType::Deal, $column('\Bitrix\Crm\Binding\DealContactTable', ['@CONTACT_ID' => $contactIds], 'DEAL_ID'));
            }
            $add(\CCrmOwnerType::Lead, $column('\Bitrix\Crm\LeadTable', ['@CONTACT_ID' => $contactIds], 'ID'));
        }
    }

    foreach ($owners as $type => $ids) {
        $ids = array_values(array_filter(array_unique(array_map('intval', $ids))));
        if (empty($ids)) {
            unset($owners[$type]);
        } else {
            $owners[$type] = $ids;
        }
    }
    return $owners;
}

// SQL-условие «привязан к одной из сущностей» для таблиц вида b_crm_act_bind / b_crm_timeline_bind.
function crystalClientsOwnersSql(array $owners, $typeColumn, $idColumn)
{
    $parts = [];
    foreach ($owners as $type => $ids) {
        $parts[] = "($typeColumn = " . (int)$type . " AND $idColumn IN (" . implode(',', array_map('intval', $ids)) . '))';
    }
    return '(' . implode(' OR ', $parts) . ')';
}

// ── Подписи привязок ─────────────────────────────────────────────────────────
// $pairs — [[ownerTypeId, id], …] по всем элементам страницы.
// Возвращает [ownerTypeId => [id => ['title' => …, 'company_id' => …]]], включая компании сделок, контактов и лидов.
function crystalClientsOwnerInfo(array $pairs)
{
    $byType = [];
    foreach ($pairs as $p) $byType[(int)$p[0]][(int)$p[1]] = true;
    $out = [];

    foreach ([\CCrmOwnerType::Lead => '\Bitrix\Crm\LeadTable', \CCrmOwnerType::Deal => '\Bitrix\Crm\DealTable'] as $type => $class) {
        if (empty($byType[$type])) continue;
        $rows = $class::getList([
            'filter' => ['@ID' => array_keys($byType[$type])],
            'select' => ['ID', 'TITLE', 'COMPANY_ID'],
        ]);
        while ($r = $rows->fetch()) {
            $out[$type][(int)$r['ID']] = ['title' => $r['TITLE'], 'company_id' => (int)$r['COMPANY_ID'] ?: null];
        }
    }

    if (!empty($byType[\CCrmOwnerType::Contact])) {
        $ids = array_keys($byType[\CCrmOwnerType::Contact]);
        $companies = crystalClientsContactCompanies($ids);
        $rows = \Bitrix\Crm\ContactTable::getList([
            'filter' => ['@ID' => $ids],
            'select' => ['ID', 'NAME', 'LAST_NAME'],
        ]);
        while ($r = $rows->fetch()) {
            $id = (int)$r['ID'];
            $out[\CCrmOwnerType::Contact][$id] = [
                'title'      => trim(preg_replace('/\s+/u', ' ', $r['NAME'] . ' ' . $r['LAST_NAME'])),
                'company_id' => $companies[$id][0] ?? null,
            ];
        }
    }

    $companyIds = array_keys($byType[\CCrmOwnerType::Company] ?? []);
    foreach ($out as $list) {
        foreach ($list as $info) {
            if ($info['company_id']) $companyIds[] = $info['company_id'];
        }
    }
    $companyIds = array_values(array_unique($companyIds));
    if (!empty($companyIds)) {
        $rows = \Bitrix\Crm\CompanyTable::getList([
            'filter' => ['@ID' => $companyIds],
            'select' => ['ID', 'TITLE'],
        ]);
        while ($r = $rows->fetch()) {
            $out[\CCrmOwnerType::Company][(int)$r['ID']] = ['title' => $r['TITLE'], 'company_id' => (int)$r['ID']];
        }
    }
    return $out;
}

const CRYSTAL_CLIENTS_OWNER_NAMES = [1 => 'lead', 2 => 'deal', 3 => 'contact', 4 => 'company'];

// Привязки одного элемента → ['bindings' => [...], 'company' => {id, title} | null].
// Компания: привязанная напрямую, иначе компания сделки, контакта, лида.
function crystalClientsBindings(array $pairs, array $info)
{
    $priority = [4 => 0, 2 => 1, 3 => 2, 1 => 3];
    $bindings = [];
    $companyId = null;
    $best = 99;
    foreach ($pairs as $p) {
        $type = (int)$p[0];
        $id = (int)$p[1];
        $name = CRYSTAL_CLIENTS_OWNER_NAMES[$type] ?? null;
        if ($name === null) continue; // смарт-процессы и прочее пока не отдаём
        $i = $info[$type][$id] ?? null;
        $bindings[] = [
            'type'  => $name,
            'id'    => $id,
            'title' => $i['title'] ?? null,
            'url'   => "/crm/$name/details/$id/",
        ];
        if (!empty($i['company_id']) && $priority[$type] < $best) {
            $best = $priority[$type];
            $companyId = $i['company_id'];
        }
    }
    $company = null;
    if ($companyId && isset($info[\CCrmOwnerType::Company][$companyId])) {
        $company = ['id' => $companyId, 'title' => $info[\CCrmOwnerType::Company][$companyId]['title']];
    }
    return ['bindings' => $bindings, 'company' => $company];
}
