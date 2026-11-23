<?php
// Дела для Кристалла: история клиента и календарь менеджера.
// Источники: дела CRM (b_crm_act) и задачи Битрикса (модуль tasks).
//
// Параметры (нужен responsible_id или хотя бы одна сущность):
//   responsible_id — исполнитель (id или список через запятую) — календарь менеджера;
//   accomplices=1  — с responsible_id: ещё задачи, где менеджер соисполнитель (role = accomplice);
//   lead_id, deal_id, contact_id, company_id — сущности CRM (id или список);
//   expand=1       — компания → ещё её контакты, сделки и лиды; контакт → его сделки и лиды;
//   source         — all (по умолчанию) | crm | tasks;
//   completed      — Y | N; без параметра — все;
//   deadline_from, deadline_to — крайний срок (YYYY-MM-DD или YYYY-MM-DD HH:MM:SS, пояс Киева);
//   created_from,  created_to  — дата создания;
//   communications=1 — включить звонки, письма и чаты CRM (по умолчанию нет: их показывает Кристалл);
//   order          — deadline (срок по возрастанию, без срока — в конце) | created (новые первыми).
//                    По умолчанию deadline, если передан deadline_from/to, иначе created;
//   limit          — 100, не больше 500; offset — 0 (offset + limit не больше 2000).
//
// Задача, привязанная к CRM, есть и в делах CRM — её отдаём один раз, как задачу.
require __DIR__ . '/_common.php';

const CRYSTAL_ACT_MAX_WINDOW = 2000;

// Дела CRM, которые на самом деле задачи модуля tasks.
const CRYSTAL_ACT_TASK_PROVIDERS = ['CRM_TASKS_TASK', 'TASKS', 'TASKS_TASK', 'TASKS_TASK_COMMENT'];
// Коммуникации: их источник — Кристалл.
const CRYSTAL_ACT_COMM_PROVIDERS = ['VOXIMPLANT_CALL', 'CRM_CALL_LIST', 'CRM_EMAIL', 'IMOPENLINES_SESSION', 'CRM_SMS', 'CRM_NOTIFICATION', 'CALL_TRACKER'];

// Статусы задач: 4 «ждёт контроля», 5 «завершена», 7 «отклонена» считаем завершёнными.
const CRYSTAL_ACT_TASK_STATUS = [
    1 => 'new', 2 => 'pending', 3 => 'in_progress', 4 => 'awaiting_control',
    5 => 'completed', 6 => 'deferred', 7 => 'declined',
];
const CRYSTAL_ACT_TASK_DONE = [4, 5, 7];

// Префиксы привязок задач к CRM в UF_CRM_TASK: L_1, D_2, C_3, CO_4.
const CRYSTAL_ACT_TASK_PREFIX = [1 => 'L', 2 => 'D', 3 => 'C', 4 => 'CO'];

// ── Параметры ────────────────────────────────────────────────────────────────
$responsible = crystalClientsIdList('responsible_id');
$owners      = crystalClientsOwnersFromParams();
$ownersGiven = crystalClientsParam('lead_id') . crystalClientsParam('deal_id')
             . crystalClientsParam('contact_id') . crystalClientsParam('company_id') !== '';

if (empty($responsible) && !$ownersGiven) {
    crystalClientsError('нужен responsible_id или одна из сущностей: lead_id, deal_id, contact_id, company_id');
}

$source = crystalClientsParam('source') ?: 'all';
if (!in_array($source, ['all', 'crm', 'tasks'], true)) crystalClientsError('source: all | crm | tasks');

$completedRaw = strtoupper(crystalClientsParam('completed'));
if ($completedRaw !== '' && !in_array($completedRaw, ['Y', 'N'], true)) crystalClientsError('completed: Y | N');
$completed = $completedRaw === '' ? null : $completedRaw === 'Y';

$deadlineFrom = crystalClientsDateParam('deadline_from');
$deadlineTo   = crystalClientsDateParam('deadline_to', true);
$createdFrom  = crystalClientsDateParam('created_from');
$createdTo    = crystalClientsDateParam('created_to', true);
$withComms    = (bool)crystalClientsFlag('communications');
$accomplices  = (bool)crystalClientsFlag('accomplices') && !empty($responsible);

$order = crystalClientsParam('order') ?: (($deadlineFrom || $deadlineTo) ? 'deadline' : 'created');
if (!in_array($order, ['deadline', 'created'], true)) crystalClientsError('order: deadline | created');

$limit  = crystalClientsNumber('limit', 100, 1, 500);
$offset = crystalClientsNumber('offset', 0, 0, null);
if ($offset + $limit > CRYSTAL_ACT_MAX_WINDOW) {
    crystalClientsError('offset + limit не больше ' . CRYSTAL_ACT_MAX_WINDOW . ' — сузьте фильтр по датам');
}
$window = $offset + $limit;

$conn      = \Bitrix\Main\Application::getConnection();
$sqlHelper = $conn->getSqlHelper();

// Сущности переданы, но ни одной не нашлось (например, expand по пустой компании не дал ничего,
// а сами id не существуют) — ответ пустой.
$ownersEmpty = $ownersGiven && empty($owners);

// ── Дела CRM ─────────────────────────────────────────────────────────────────
$crmItems = [];
$crmTotal = 0;
if ($source !== 'tasks' && !$ownersEmpty) {
    $where = [];
    if (!empty($owners)) {
        $where[] = 'a.ID IN (SELECT ACTIVITY_ID FROM b_crm_act_bind WHERE '
            . crystalClientsOwnersSql($owners, 'OWNER_TYPE_ID', 'OWNER_ID') . ')';
    }
    if (!empty($responsible)) $where[] = 'a.RESPONSIBLE_ID IN (' . implode(',', $responsible) . ')';
    if ($completed !== null)  $where[] = "a.COMPLETED = '" . ($completed ? 'Y' : 'N') . "'";

    $taskProviders = "'" . implode("','", CRYSTAL_ACT_TASK_PROVIDERS) . "'";
    $where[] = "NOT (a.TYPE_ID = 3 OR a.PROVIDER_ID IN ($taskProviders))";
    if (!$withComms) {
        $commProviders = "'" . implode("','", CRYSTAL_ACT_COMM_PROVIDERS) . "'";
        $where[] = "NOT (a.TYPE_ID IN (2, 4) OR a.PROVIDER_ID IN ($commProviders))";
    }

    if ($deadlineFrom || $deadlineTo) $where[] = "a.DEADLINE IS NOT NULL AND a.DEADLINE < '9999-01-01'";
    if ($deadlineFrom) $where[] = 'a.DEADLINE >= ' . $sqlHelper->convertToDbDateTime($deadlineFrom);
    if ($deadlineTo)   $where[] = 'a.DEADLINE <= ' . $sqlHelper->convertToDbDateTime($deadlineTo);
    if ($createdFrom)  $where[] = 'a.CREATED >= '  . $sqlHelper->convertToDbDateTime($createdFrom);
    if ($createdTo)    $where[] = 'a.CREATED <= '  . $sqlHelper->convertToDbDateTime($createdTo);

    $whereSql = implode(' AND ', $where);
    $orderSql = $order === 'deadline'
        ? "(a.DEADLINE IS NULL OR a.DEADLINE >= '9999-01-01') ASC, a.DEADLINE ASC, a.ID ASC"
        : 'a.CREATED DESC, a.ID DESC';

    $crmTotal = (int)$conn->query("SELECT COUNT(*) AS CNT FROM b_crm_act a WHERE $whereSql")->fetch()['CNT'];

    if ($crmTotal > 0) {
        $rows = $conn->query(
            'SELECT a.ID, a.TYPE_ID, a.PROVIDER_ID, a.PROVIDER_TYPE_ID, a.SUBJECT, a.DESCRIPTION, a.COMPLETED,'
            . ' a.RESPONSIBLE_ID, a.AUTHOR_ID, a.START_TIME, a.END_TIME, a.DEADLINE, a.CREATED, a.PRIORITY, a.DIRECTION'
            . " FROM b_crm_act a WHERE $whereSql ORDER BY $orderSql LIMIT $window"
        );
        while ($r = $rows->fetch()) $crmItems[(int)$r['ID']] = $r;
    }
}

// ── Задачи ───────────────────────────────────────────────────────────────────
$taskItems = [];
$taskTotal = 0;
$taskCrm   = []; // [taskId => ['D_12', 'CO_4', …]]

$tasksAvailable = \Bitrix\Main\Loader::includeModule('tasks');

$crmTaskFieldId = null;
if ($tasksAvailable) {
    $f = $conn->query("SELECT ID FROM b_user_field WHERE ENTITY_ID = 'TASKS_TASK' AND FIELD_NAME = 'UF_CRM_TASK'")->fetch();
    $crmTaskFieldId = $f ? (int)$f['ID'] : null;
}

if ($source !== 'crm' && $tasksAvailable && !$ownersEmpty && !(!empty($owners) && !$crmTaskFieldId)) {
    $filter = [];

    if (!empty($owners)) {
        $codes = [];
        foreach ($owners as $type => $ids) {
            foreach ($ids as $id) $codes[] = "'" . CRYSTAL_ACT_TASK_PREFIX[$type] . '_' . (int)$id . "'";
        }
        $taskIds = [];
        $rows = $conn->query(
            "SELECT DISTINCT VALUE_ID FROM b_utm_tasks_task WHERE FIELD_ID = $crmTaskFieldId AND VALUE IN (" . implode(',', $codes) . ')'
        );
        while ($r = $rows->fetch()) $taskIds[] = (int)$r['VALUE_ID'];
        $filter['@ID'] = $taskIds ?: [0];
    }
    if (!empty($responsible)) {
        // Соисполнители — в b_tasks_member с TYPE = 'A'.
        $accompliceTaskIds = [];
        if ($accomplices) {
            $rows = $conn->query(
                "SELECT DISTINCT TASK_ID FROM b_tasks_member WHERE TYPE = 'A' AND USER_ID IN (" . implode(',', $responsible) . ')'
            );
            while ($r = $rows->fetch()) $accompliceTaskIds[] = (int)$r['TASK_ID'];
        }
        if (empty($accompliceTaskIds)) {
            $filter['@RESPONSIBLE_ID'] = $responsible;
        } else {
            $filter[] = ['LOGIC' => 'OR', '@RESPONSIBLE_ID' => $responsible, '@ID' => $accompliceTaskIds];
        }
    }
    if ($completed === true)  $filter['@STATUS'] = CRYSTAL_ACT_TASK_DONE;
    if ($completed === false) $filter['!@STATUS'] = CRYSTAL_ACT_TASK_DONE;
    if ($deadlineFrom) $filter['>=DEADLINE'] = $deadlineFrom;
    if ($deadlineTo)   $filter['<=DEADLINE'] = $deadlineTo;
    if (($deadlineFrom || $deadlineTo)) $filter['!=DEADLINE'] = null;
    if ($createdFrom)  $filter['>=CREATED_DATE'] = $createdFrom;
    if ($createdTo)    $filter['<=CREATED_DATE'] = $createdTo;

    $entity = \Bitrix\Tasks\Internals\TaskTable::getEntity();
    if ($entity->hasField('ZOMBIE')) $filter['=ZOMBIE'] = 'N';

    $params = [
        'filter'      => $filter,
        'select'      => [
            'ID', 'TITLE', 'DESCRIPTION', 'STATUS', 'PRIORITY', 'RESPONSIBLE_ID', 'CREATED_BY',
            'DEADLINE', 'CREATED_DATE', 'CLOSED_DATE', 'START_DATE_PLAN', 'END_DATE_PLAN', 'GROUP_ID',
        ],
        'limit'       => $window,
        'count_total' => true,
    ];
    if ($order === 'deadline') {
        $params['runtime'] = [
            new \Bitrix\Main\Entity\ExpressionField('NO_DEADLINE', 'CASE WHEN %s IS NULL THEN 1 ELSE 0 END', 'DEADLINE'),
        ];
        $params['order'] = ['NO_DEADLINE' => 'ASC', 'DEADLINE' => 'ASC', 'ID' => 'ASC'];
    } else {
        $params['order'] = ['CREATED_DATE' => 'DESC', 'ID' => 'DESC'];
    }

    $result = \Bitrix\Tasks\Internals\TaskTable::getList($params);
    $taskTotal = (int)$result->getCount();
    while ($r = $result->fetch()) $taskItems[(int)$r['ID']] = $r;
}

// ── Общий порядок и страница ─────────────────────────────────────────────────
$merged = [];
foreach ($crmItems as $id => $r) {
    $merged[] = [
        'src' => 'crm', 'id' => $id,
        'deadline' => crystalClientsDeadline($r['DEADLINE']),
        'created'  => crystalClientsDateTime($r['CREATED']),
    ];
}
foreach ($taskItems as $id => $r) {
    $merged[] = [
        'src' => 'task', 'id' => $id,
        'deadline' => crystalClientsDeadline($r['DEADLINE']),
        'created'  => crystalClientsDateTime($r['CREATED_DATE']),
    ];
}
usort($merged, function ($a, $b) use ($order) {
    if ($order === 'deadline') {
        $c = strcmp($a['deadline'] ?? '9999', $b['deadline'] ?? '9999');
    } else {
        $c = strcmp((string)$b['created'], (string)$a['created']);
    }
    return $c !== 0 ? $c : strcmp($a['src'] . $a['id'], $b['src'] . $b['id']);
});
$page = array_slice($merged, $offset, $limit);
$total = $crmTotal + $taskTotal;

// ── Привязки страницы ────────────────────────────────────────────────────────
$pageCrmIds  = [];
$pageTaskIds = [];
foreach ($page as $p) {
    if ($p['src'] === 'crm') $pageCrmIds[] = $p['id']; else $pageTaskIds[] = $p['id'];
}

$pairsOf = ['crm' => [], 'task' => []];
$allPairs = [];
if (!empty($pageCrmIds)) {
    $rows = $conn->query(
        'SELECT ACTIVITY_ID, OWNER_TYPE_ID, OWNER_ID FROM b_crm_act_bind WHERE ACTIVITY_ID IN (' . implode(',', $pageCrmIds) . ')'
    );
    while ($r = $rows->fetch()) {
        $pair = [(int)$r['OWNER_TYPE_ID'], (int)$r['OWNER_ID']];
        $pairsOf['crm'][(int)$r['ACTIVITY_ID']][] = $pair;
        $allPairs[] = $pair;
    }
}
if (!empty($pageTaskIds) && $crmTaskFieldId) {
    $prefixToType = array_flip(CRYSTAL_ACT_TASK_PREFIX);
    $rows = $conn->query(
        "SELECT VALUE_ID, VALUE FROM b_utm_tasks_task WHERE FIELD_ID = $crmTaskFieldId AND VALUE_ID IN (" . implode(',', $pageTaskIds) . ')'
    );
    while ($r = $rows->fetch()) {
        if (!preg_match('/^([A-Z]+)_(\d+)$/', (string)$r['VALUE'], $m) || !isset($prefixToType[$m[1]])) continue;
        $pair = [$prefixToType[$m[1]], (int)$m[2]];
        $pairsOf['task'][(int)$r['VALUE_ID']][] = $pair;
        $allPairs[] = $pair;
    }
}
$ownerInfo = crystalClientsOwnerInfo($allPairs);

// ── Справочники ──────────────────────────────────────────────────────────────
$userIds = [];
foreach ($pageCrmIds as $id)  { $userIds[] = $crmItems[$id]['RESPONSIBLE_ID']; $userIds[] = $crmItems[$id]['AUTHOR_ID']; }
foreach ($pageTaskIds as $id) { $userIds[] = $taskItems[$id]['RESPONSIBLE_ID']; $userIds[] = $taskItems[$id]['CREATED_BY']; }
$users = crystalClientsUserNames($userIds);
$user = function ($id) use ($users) {
    $id = (int)$id;
    return $id ? ['id' => $id, 'name' => $users[$id] ?? null] : null;
};

// Тип дела CRM.
$activityType = function (array $a) {
    $byProvider = [
        'CRM_TODO' => 'todo', 'CRM_MEETING' => 'meeting', 'CRM_CALL_LIST' => 'call', 'VOXIMPLANT_CALL' => 'call',
        'CRM_EMAIL' => 'email', 'IMOPENLINES_SESSION' => 'chat', 'CRM_SMS' => 'sms', 'CRM_NOTIFICATION' => 'sms',
        'CRM_WEBFORM' => 'webform', 'CRM_REQUEST' => 'request',
    ];
    $byType = ['1' => 'meeting', '2' => 'call', '4' => 'email'];
    return $byProvider[$a['PROVIDER_ID']] ?? $byType[(string)$a['TYPE_ID']] ?? 'other';
};

// ── Ответ ────────────────────────────────────────────────────────────────────
$items = [];
foreach ($page as $p) {
    if ($p['src'] === 'crm') {
        $a = $crmItems[$p['id']];
        $b = crystalClientsBindings($pairsOf['crm'][$p['id']] ?? [], $ownerInfo);
        $items[] = [
            'uid'         => 'crm:' . $p['id'],
            'source'      => 'crm',
            'id'          => $p['id'],
            'type'        => $activityType($a),
            'provider_id' => $a['PROVIDER_ID'] ?: null,
            'subject'     => crystalClientsText($a['SUBJECT'], 500),
            'description' => crystalClientsText($a['DESCRIPTION']),
            'completed'   => $a['COMPLETED'] === 'Y',
            'status'      => $a['COMPLETED'] === 'Y' ? 'completed' : 'open',
            'deadline'    => $p['deadline'],
            'start'       => crystalClientsDeadline($a['START_TIME']),
            'end'         => crystalClientsDeadline($a['END_TIME']),
            'created'     => $p['created'],
            'closed'      => null,
            'important'   => (int)$a['PRIORITY'] === 3, // CCrmActivityPriority::High
            'direction'   => ['1' => 'in', '2' => 'out'][(string)$a['DIRECTION']] ?? null,
            'role'        => empty($responsible) ? null : 'responsible',
            'responsible' => $user($a['RESPONSIBLE_ID']),
            'author'      => $user($a['AUTHOR_ID']),
            'company'     => $b['company'],
            'bindings'    => $b['bindings'],
            'group_id'    => null,
            'url'         => $b['bindings'][0]['url'] ?? null,
        ];
    } else {
        $t = $taskItems[$p['id']];
        $b = crystalClientsBindings($pairsOf['task'][$p['id']] ?? [], $ownerInfo);
        $status = (int)$t['STATUS'];
        $items[] = [
            'uid'         => 'task:' . $p['id'],
            'source'      => 'task',
            'id'          => $p['id'],
            'type'        => 'task',
            'provider_id' => null,
            'subject'     => crystalClientsText($t['TITLE'], 500),
            'description' => crystalClientsText($t['DESCRIPTION']),
            'completed'   => in_array($status, CRYSTAL_ACT_TASK_DONE, true),
            'status'      => CRYSTAL_ACT_TASK_STATUS[$status] ?? (string)$status,
            'deadline'    => $p['deadline'],
            'start'       => crystalClientsDeadline($t['START_DATE_PLAN']),
            'end'         => crystalClientsDeadline($t['END_DATE_PLAN']),
            'created'     => $p['created'],
            'closed'      => crystalClientsDateTime($t['CLOSED_DATE']),
            'important'   => (int)$t['PRIORITY'] === 2,
            'direction'   => null,
            'role'        => empty($responsible) ? null
                : (in_array((int)$t['RESPONSIBLE_ID'], $responsible, true) ? 'responsible' : 'accomplice'),
            'responsible' => $user($t['RESPONSIBLE_ID']),
            'author'      => $user($t['CREATED_BY']),
            'company'     => $b['company'],
            'bindings'    => $b['bindings'],
            'group_id'    => (int)$t['GROUP_ID'] ?: null,
            'url'         => '/company/personal/user/' . (int)$t['RESPONSIBLE_ID'] . '/tasks/task/view/' . $p['id'] . '/',
        ];
    }
}

crystalClientsRespond([
    'tz'          => CRYSTAL_CLIENTS_TZ,
    'order'       => $order,
    'items'       => $items,
    'total'       => $total,
    'total_crm'   => $crmTotal,
    'total_tasks' => $taskTotal,
    'next_offset' => $offset + $limit < $total ? $offset + $limit : null,
]);
