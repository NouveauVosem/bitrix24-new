<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', true);
require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

\Bitrix\Main\Loader::includeModule("crm");

// Отчёт «Анализ эффективности менеджеров» в Кристале: сырые данные за период.
// Агрегация по менеджерам, перевод в гривну и проход из Вентуры — на стороне
// Кристала; здесь только выборка из CRM, как в history-эндпоинтах.

// ── Авторизация ──────────────────────────────────────────────────────────────
define('CRYSTAL_API_TOKEN', 'Legenda');

$token = $_SERVER['HTTP_X_API_TOKEN'] ?? $_GET['token'] ?? $_POST['token'] ?? '';
if ($token !== CRYSTAL_API_TOKEN) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Unauthorized']);
    die();
}

// ── Входные данные ────────────────────────────────────────────────────────────
// date_from / date_to — Y-m-d, обе даты включительно.
// assigned_ids — ответственные через запятую; пусто — все.
$dateFrom = (string)($_GET['date_from'] ?? $_POST['date_from'] ?? '');
$dateTo   = (string)($_GET['date_to'] ?? $_POST['date_to'] ?? '');

$isDate = function ($s) {
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) && \DateTime::createFromFormat('Y-m-d', $s) !== false;
};
if (!$isDate($dateFrom) || !$isDate($dateTo) || $dateFrom > $dateTo) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'date_from and date_to (Y-m-d, from <= to) are required']);
    die();
}

$assignedIds = array_values(array_filter(array_map('intval', explode(',', (string)($_GET['assigned_ids'] ?? $_POST['assigned_ids'] ?? '')))));

// Полуинтервал [from 00:00, to+1 00:00) — чтобы последний день попал целиком.
$periodFrom = new \Bitrix\Main\Type\DateTime($dateFrom . ' 00:00:00', 'Y-m-d H:i:s');
$periodTo   = new \Bitrix\Main\Type\DateTime(date('Y-m-d', strtotime($dateTo . ' +1 day')) . ' 00:00:00', 'Y-m-d H:i:s');

// ── Константы CRM ────────────────────────────────────────────────────────────
// Только воронка «Заказы»: «Доставка частями» — части уже посчитанных заказов.
$CATEGORY_ORDERS = 0;

// «Новый клиент или существующий?»
$CLIENT_TYPE_FIELD = 'UF_CRM_1717698088311';
$CLIENT_TYPE_BY_ENUM = [
    229 => 'new',      // Новый
    230 => 'existing', // Существующий
];

$TOTAL_WITH_VAT_FIELD = 'UF_CRM_1728403359608'; // Общая сумма с НДС (в валюте CURRENCY_ID)
$ZV_NUMBERS_FIELD     = 'UF_CRM_1736861473825'; // Номера заказа в ZV

// Задача на сделке, с которой заказ считается поступившим в работу.
// Бывает «Запустить заказ в работу.» и «Запустить заказ в работу - Образцы (БЕСПЛАТНО)»:
// образцы в заказы не идут, а отдаются отдельным списком.
$LAUNCH_TASK_SUBJECT = 'Запустить заказ в работу';
$isSampleTask = function ($subject) {
    return mb_stripos((string)$subject, 'Образц') !== false;
};

$clientTypeOf = function ($deal) use ($CLIENT_TYPE_FIELD, $CLIENT_TYPE_BY_ENUM) {
    return $CLIENT_TYPE_BY_ENUM[(int)$deal[$CLIENT_TYPE_FIELD]] ?? null;
};

// ── Запросы: сделки, созданные в периоде ─────────────────────────────────────
$requestFilter = [
    '=CATEGORY_ID' => $CATEGORY_ORDERS,
    '>=DATE_CREATE' => $periodFrom,
    '<DATE_CREATE'  => $periodTo,
];
if (!empty($assignedIds)) {
    $requestFilter['@ASSIGNED_BY_ID'] = $assignedIds;
}

$requestsRaw = \Bitrix\Crm\DealTable::getList([
    'filter' => $requestFilter,
    'select' => ['ID', 'TITLE', 'DATE_CREATE', 'ASSIGNED_BY_ID', 'CURRENCY_ID', $CLIENT_TYPE_FIELD, $TOTAL_WITH_VAT_FIELD],
    'order'  => ['ID' => 'ASC'],
])->fetchAll();

$requests = [];
foreach ($requestsRaw as $d) {
    $requests[] = [
        'deal_id'        => (int)$d['ID'],
        'title'          => $d['TITLE'],
        'date_create'    => $d['DATE_CREATE'] ? (string)$d['DATE_CREATE'] : null,
        'assigned_by_id' => (int)$d['ASSIGNED_BY_ID'],
        'client_type'    => $clientTypeOf($d),
        'amount'         => (float)$d[$TOTAL_WITH_VAT_FIELD],
        'currency'       => $d['CURRENCY_ID'],
    ];
}

// ── Задачи «Запустить заказ в работу» на сделках ─────────────────────────────
// Через ORM (ActivityTable), а не CCrmActivity::GetList — легаси-API без сессии
// пользователя молча возвращает пустоту (см. client_by_email.php).
$launchTasks = function (array $extraFilter) use ($LAUNCH_TASK_SUBJECT) {
    return \Bitrix\Crm\ActivityTable::getList([
        'filter' => array_merge([
            '=OWNER_TYPE_ID' => \CCrmOwnerType::Deal,
            '=PROVIDER_ID'   => 'CRM_TASKS_TASK',
            '%=SUBJECT'      => $LAUNCH_TASK_SUBJECT . '%',
        ], $extraFilter),
        'select' => ['ID', 'OWNER_ID', 'SUBJECT', 'CREATED'],
        'order'  => ['CREATED' => 'ASC', 'ID' => 'ASC'],
    ])->fetchAll();
};

// Первая задача каждого вида на сделке в периоде.
$firstOrderTask  = [];
$firstSampleTask = [];
foreach ($launchTasks(['>=CREATED' => $periodFrom, '<CREATED' => $periodTo]) as $t) {
    $dealId = (int)$t['OWNER_ID'];
    if ($isSampleTask($t['SUBJECT'])) {
        if (!isset($firstSampleTask[$dealId])) $firstSampleTask[$dealId] = $t;
    } elseif (!isset($firstOrderTask[$dealId])) {
        $firstOrderTask[$dealId] = $t;
    }
}

// Заказ засчитывается один раз — в периоде первой задачи. Если задача уже
// ставилась раньше периода, сделку отсюда убираем.
if (!empty($firstOrderTask)) {
    $earlierTasks = $launchTasks([
        '@OWNER_ID' => array_keys($firstOrderTask),
        '<CREATED'  => $periodFrom,
    ]);
    foreach ($earlierTasks as $t) {
        if (!$isSampleTask($t['SUBJECT'])) unset($firstOrderTask[(int)$t['OWNER_ID']]);
    }
}

// ── Сделки задач — одним запросом, с теми же фильтрами по воронке и менеджеру ──
$taskDealIds = array_values(array_unique(array_merge(array_keys($firstOrderTask), array_keys($firstSampleTask))));

$taskDeals = [];
if (!empty($taskDealIds)) {
    $taskDealFilter = [
        '@ID'          => $taskDealIds,
        '=CATEGORY_ID' => $CATEGORY_ORDERS,
    ];
    if (!empty($assignedIds)) {
        $taskDealFilter['@ASSIGNED_BY_ID'] = $assignedIds;
    }
    $taskDealsRaw = \Bitrix\Crm\DealTable::getList([
        'filter' => $taskDealFilter,
        'select' => ['ID', 'TITLE', 'ASSIGNED_BY_ID', $CLIENT_TYPE_FIELD, $ZV_NUMBERS_FIELD],
    ])->fetchAll();
    foreach ($taskDealsRaw as $d) {
        $taskDeals[(int)$d['ID']] = $d;
    }
}

$taskRows = function (array $firstTasks) use ($taskDeals, $clientTypeOf, $ZV_NUMBERS_FIELD) {
    $rows = [];
    foreach ($firstTasks as $dealId => $t) {
        $d = $taskDeals[$dealId] ?? null;
        if (!$d) continue; // другая воронка или не наш менеджер
        $rows[] = [
            'deal_id'        => $dealId,
            'title'          => $d['TITLE'],
            'assigned_by_id' => (int)$d['ASSIGNED_BY_ID'],
            'client_type'    => $clientTypeOf($d),
            'task_created'   => $t['CREATED'] ? (string)$t['CREATED'] : null,
            'zv_numbers'     => trim((string)$d[$ZV_NUMBERS_FIELD]),
        ];
    }
    return $rows;
};

// ── Ответ ─────────────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'date_from'      => $dateFrom,
    'date_to'        => $dateTo,
    'requests'       => $requests,
    'orders_in_work' => $taskRows($firstOrderTask),
    'samples'        => $taskRows($firstSampleTask),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
die();
