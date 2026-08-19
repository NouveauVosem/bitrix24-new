<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

$q = trim($_GET['q'] ?? '');

$filter = ['ACTIVE' => 'Y'];
if ($q !== '') {
    $filter['%NAME'] = $q . '%';
}

$res = CUser::GetList('NAME', 'ASC', $filter, [
    'FIELDS' => ['ID', 'NAME', 'LAST_NAME', 'SECOND_NAME', 'EMAIL', 'PERSONAL_PHOTO'],
    'NAV_PARAMS' => ['nPageSize' => 30],
]);

$users = [];
while ($u = $res->Fetch()) {
    $name = trim($u['NAME'] . ' ' . $u['LAST_NAME']);
    if ($u['SECOND_NAME']) $name = trim($u['NAME'] . ' ' . $u['SECOND_NAME'] . ' ' . $u['LAST_NAME']);
    $users[] = [
        'id'   => (int)$u['ID'],
        'name' => $name ?: $u['EMAIL'],
    ];
}

echo json_encode($users, JSON_UNESCAPED_UNICODE);
