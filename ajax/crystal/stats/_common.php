<?php
// Общее для эндпоинтов статистики, через которые ИИ-чат Кристала берёт данные CRM:
// авторизация, разбор параметров, правила отбора сделок, справочники имён, ответ.
//
// ── ПРИНЯТО ДЛЯ НАБРОСКА, ПОДТВЕРДИТЬ С ОЛЕНОЙ / ЕГОРОМ ──────────────────────
// 1. Сделку к периоду относит дата закрытия (CLOSEDATE). У сделок, которые ещё
//    не в «Успешно» (ZV, сборка, в пути…), это плановая дата закрытия.
// 2. Закрытые сделки — стадии воронки «Заказы» (0) с ZV и до «Успешно»
//    (список $acceptedStages из history-эндпоинтов). Без воронки 1 и без стадии
//    «Доставка частями» (UC_MFKCTZ): это части уже посчитанных заказов.
// 3. Проход = сумма 8 полей «Проход <категория>», как в отчёте эффективности
//    менеджеров; считаем, что в гривне (единицы не подтверждены).
// 4. Сумма = «Общая сумма с НДС» в валюте сделки (CURRENCY_ID), без пересчёта:
//    суммы в разных валютах не складываем, каждая строка со своей валютой.
//    В общую валюту пересчитывает Кристал (согласовано с Егором 2026-11-09).
// 5. Сделки без компании (только контакт) в топ клиентов и динамику по клиентам
//    не попадают; в ответе отдаётся их количество.
// ──────────────────────────────────────────────────────────────────────────────

define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', true);
require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

\Bitrix\Main\Loader::includeModule("crm");

// ── Ответ ─────────────────────────────────────────────────────────────────────
// Ошибки — тоже HTTP 200 и {"error": "..."}: так просил Кристал, ИИ читает текст.
function crystalStatsRespond(array $data)
{
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    die();
}

function crystalStatsError($message)
{
    crystalStatsRespond(['error' => $message]);
}

// ── Авторизация ──────────────────────────────────────────────────────────────
// В коде только SHA-256 токена: сам токен в git не попадает, он есть у Кристала.
define('CRYSTAL_STATS_TOKEN_SHA256', '676771e54e79eb4bd63d77e8412e8d721d194e79abd1d0d25ba08d141d7f976d');

// IP сервера Кристала. Пусто — без ограничения по IP.
define('CRYSTAL_STATS_ALLOWED_IPS', []);

$token = (string)($_SERVER['HTTP_X_API_TOKEN'] ?? $_GET['token'] ?? $_POST['token'] ?? '');
if (!hash_equals(CRYSTAL_STATS_TOKEN_SHA256, hash('sha256', $token))) {
    crystalStatsError('Unauthorized');
}
if (!empty(CRYSTAL_STATS_ALLOWED_IPS) && !in_array($_SERVER['REMOTE_ADDR'] ?? '', CRYSTAL_STATS_ALLOWED_IPS, true)) {
    crystalStatsError('Unauthorized');
}

// ── Параметры ────────────────────────────────────────────────────────────────
function crystalStatsParam($name)
{
    return trim((string)($_GET[$name] ?? $_POST[$name] ?? ''));
}

// Список через запятую: "WON,UC_TB1B18" → ['WON', 'UC_TB1B18'].
function crystalStatsList($name)
{
    $raw = crystalStatsParam($name);
    if ($raw === '') return [];
    return array_values(array_unique(array_filter(array_map('trim', explode(',', $raw)), 'strlen')));
}

function crystalStatsIdList($name)
{
    $ids = [];
    foreach (crystalStatsList($name) as $v) {
        if (!ctype_digit($v) || (int)$v <= 0) {
            crystalStatsError("неверный $name: «{$v}», нужны числовые ID через запятую");
        }
        $ids[] = (int)$v;
    }
    return $ids;
}

// from / to — YYYY-MM-DD, обе даты включительно. null, если обе не переданы и не обязательны.
function crystalStatsPeriod($required)
{
    $from = crystalStatsParam('from');
    $to   = crystalStatsParam('to');
    if ($from === '' && $to === '' && !$required) return null;

    foreach (['from' => $from, 'to' => $to] as $name => $value) {
        $dt = \DateTime::createFromFormat('!Y-m-d', $value);
        if (!$dt || $dt->format('Y-m-d') !== $value) {
            crystalStatsError("неверный формат даты $name: «{$value}», нужно YYYY-MM-DD");
        }
    }
    if ($from > $to) {
        crystalStatsError('дата from позже даты to');
    }
    return ['from' => $from, 'to' => $to];
}

function crystalStatsLimit($default, $max)
{
    $raw = crystalStatsParam('limit');
    if ($raw === '') return $default;
    if (!ctype_digit($raw) || (int)$raw <= 0) {
        crystalStatsError("неверный limit: «{$raw}», нужно целое число больше 0");
    }
    return min((int)$raw, $max);
}

// manager_id → ['id' => 15, 'name' => '…'] или ['id' => null, 'name' => 'все менеджеры'].
function crystalStatsManager()
{
    $raw = crystalStatsParam('manager_id');
    if ($raw === '') return ['id' => null, 'name' => 'все менеджеры'];
    if (!ctype_digit($raw) || (int)$raw <= 0) {
        crystalStatsError("неверный manager_id: «{$raw}»");
    }
    $names = crystalStatsUserNames([(int)$raw]);
    if (!isset($names[(int)$raw])) {
        crystalStatsError("менеджер не найден: manager_id={$raw}");
    }
    return ['id' => (int)$raw, 'name' => $names[(int)$raw]];
}

// ── Правила отбора сделок ────────────────────────────────────────────────────
const CRYSTAL_STATS_CATEGORY = 0; // воронка «Заказы»

// Закрытые стадии воронки 0: с ZV и до «Успешно», без «Доставки частями» (UC_MFKCTZ).
const CRYSTAL_STATS_CLOSED_STAGES = [
    'UC_TB1B18', 'UC_L8JVGQ', 'UC_3S4WFS', 'UC_KPW8X6',
    'UC_WR1KV9', 'UC_HOG6VO', 'UC_V8FMSP', 'WON',
];

const CRYSTAL_STATS_AMOUNT_FIELD = 'UF_CRM_1728403359608'; // Общая сумма с НДС (в валюте CURRENCY_ID)
const CRYSTAL_STATS_COUNTRY_FIELD = 'UF_CRM_1717094712004'; // Страна компании (список)
const CRYSTAL_STATS_PASS_CURRENCY = 'UAH';

// top_clients с sort=amount: сколько строк отдать максимум (limit там не действует).
const CRYSTAL_STATS_AMOUNT_ROWS_MAX = 500;

// «Проход <категория>»; проход сделки — их сумма (как в reports/manager_efficiency.php).
const CRYSTAL_STATS_PASS_FIELDS = [
    'UF_CRM_1738248743869', // Контейнеры
    'UF_CRM_1738248812670', // Чехлы
    'UF_CRM_1738568381424', // Тележки
    'UF_CRM_1738568412044', // Алюминий
    'UF_CRM_1738568447882', // Сетка
    'UF_CRM_1738568867342', // Стеллажи
    'UF_CRM_1738568894666', // Сумки
    'UF_CRM_1738568909962', // Мешки
];

// Фильтр DealTable: воронка, стадии, период по дате закрытия, менеджер.
function crystalStatsDealFilter($period, $managerId, array $stages)
{
    $filter = [
        '=CATEGORY_ID' => CRYSTAL_STATS_CATEGORY,
        '@STAGE_ID'    => $stages,
    ];
    if ($period) {
        // Полуинтервал [from 00:00, to+1 00:00) — чтобы последний день попал целиком.
        $filter['>=CLOSEDATE'] = new \Bitrix\Main\Type\DateTime($period['from'] . ' 00:00:00', 'Y-m-d H:i:s');
        $filter['<CLOSEDATE']  = new \Bitrix\Main\Type\DateTime(date('Y-m-d', strtotime($period['to'] . ' +1 day')) . ' 00:00:00', 'Y-m-d H:i:s');
    }
    if ($managerId) {
        $filter['=ASSIGNED_BY_ID'] = $managerId;
    }
    return $filter;
}

function crystalStatsDealSelect()
{
    return array_merge(
        ['ID', 'TITLE', 'STAGE_ID', 'CLOSEDATE', 'CURRENCY_ID', 'OPPORTUNITY', 'COMPANY_ID', 'ASSIGNED_BY_ID', CRYSTAL_STATS_AMOUNT_FIELD],
        CRYSTAL_STATS_PASS_FIELDS
    );
}

// Проход сделки; null — ни одна категория не заполнена.
function crystalStatsPass(array $deal)
{
    $sum = 0.0;
    $filled = false;
    foreach (CRYSTAL_STATS_PASS_FIELDS as $f) {
        $v = (float)$deal[$f];
        if ($v != 0) {
            $sum += $v;
            $filled = true;
        }
    }
    return $filled ? round($sum, 2) : null;
}

// Сумма сделки: «Общая сумма с НДС», если пусто — сумма сделки.
function crystalStatsAmount(array $deal)
{
    $v = (float)$deal[CRYSTAL_STATS_AMOUNT_FIELD];
    if ($v == 0) $v = (float)$deal['OPPORTUNITY'];
    return round($v, 2);
}

function crystalStatsDate($value)
{
    return $value ? $value->format('Y-m-d') : null;
}

// ── Справочники имён ─────────────────────────────────────────────────────────
function crystalStatsUserNames(array $ids)
{
    $ids = array_values(array_unique(array_filter($ids)));
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

// [id => ['company' => 'ABC s.r.o.', 'country' => 'Чехия' | null]]
function crystalStatsCompanies(array $ids)
{
    $ids = array_values(array_unique(array_filter($ids)));
    if (empty($ids)) return [];

    $countryNames = [];
    $enum = \CUserFieldEnum::GetList([], ['USER_FIELD_NAME' => CRYSTAL_STATS_COUNTRY_FIELD]);
    while ($e = $enum->Fetch()) {
        $countryNames[(int)$e['ID']] = $e['VALUE'];
    }

    $companies = [];
    $rows = \Bitrix\Crm\CompanyTable::getList([
        'filter' => ['@ID' => $ids],
        'select' => ['ID', 'TITLE', CRYSTAL_STATS_COUNTRY_FIELD],
    ]);
    while ($c = $rows->fetch()) {
        $companies[(int)$c['ID']] = [
            'company' => $c['TITLE'],
            'country' => $countryNames[(int)$c[CRYSTAL_STATS_COUNTRY_FIELD]] ?? null,
        ];
    }
    return $companies;
}

// Стадии воронки 0: [STATUS_ID => название].
function crystalStatsStageNames()
{
    $names = [];
    $rows = \Bitrix\Crm\StatusTable::getList([
        'filter' => ['=ENTITY_ID' => 'DEAL_STAGE'],
        'select' => ['STATUS_ID', 'NAME'],
        'order'  => ['SORT' => 'ASC'],
    ]);
    while ($s = $rows->fetch()) {
        $names[$s['STATUS_ID']] = $s['NAME'];
    }
    return $names;
}
