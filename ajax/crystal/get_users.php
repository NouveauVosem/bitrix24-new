<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

$res = CUser::GetList('LAST_NAME', 'ASC', ['ACTIVE' => 'Y'], [
    'FIELDS' => ['ID', 'NAME', 'LAST_NAME', 'SECOND_NAME', 'EMAIL'],
    'NAV_PARAMS' => ['nPageSize' => 500],
]);

$users = [];
while ($u = $res->Fetch()) {
    $parts = array_filter([$u['NAME'], $u['SECOND_NAME'], $u['LAST_NAME']]);
    $name = trim(implode(' ', $parts)) ?: $u['EMAIL'];
    // пропускаем технических пользователей без имени
    if (!$name || $name === $u['EMAIL'] && empty($u['NAME']) && empty($u['LAST_NAME'])) continue;
    $users[] = [
        'id'   => (int)$u['ID'],
        'name' => $name,
    ];
}

echo json_encode($users, JSON_UNESCAPED_UNICODE);
