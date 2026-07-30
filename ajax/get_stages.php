<?php
require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

\Bitrix\Main\Loader::includeModule("crm");

// Основная воронка (category 0)
$result = [];
$stages = \CCrmStatus::GetList(['SORT' => 'ASC'], ['ENTITY_ID' => 'DEAL_STAGE']);
while ($s = $stages->Fetch()) {
    $s['CATEGORY_ID'] = 0;
    $result[] = $s;
}

// Дополнительные воронки (category 1, 2, ...)
for ($i = 1; $i <= 5; $i++) {
    $stages = \CCrmStatus::GetList(['SORT' => 'ASC'], ['ENTITY_ID' => 'DEAL_STAGE_' . $i]);
    while ($s = $stages->Fetch()) {
        $s['CATEGORY_ID'] = $i;
        $result[] = $s;
    }
}

header('Content-Type: application/json; charset=utf-8');
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
die();
