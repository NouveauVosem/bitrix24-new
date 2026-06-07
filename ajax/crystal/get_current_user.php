<?php
define('NO_KEEP_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', false);

require($_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php');

header('Content-Type: application/json; charset=utf-8');

if (!$USER->IsAuthorized()) {
    echo json_encode(['error' => 'Unauthorized']);
    die();
}

echo json_encode([
    'id'       => (int)$USER->GetID(),
    'name'     => $USER->GetFullName(),
    'login'    => $USER->GetLogin(),
]);
