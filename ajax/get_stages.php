<?php
require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

\Bitrix\Main\Loader::includeModule("crm");

$stages = \CCrmDealStage::GetListEx(
    ['SORT' => 'ASC'],
    [],
    false,
    false,
    ['STATUS_ID', 'NAME', 'CATEGORY_ID', 'SORT']
);

$result = [];
while ($s = $stages->Fetch()) {
    $result[] = $s;
}

header('Content-Type: application/json; charset=utf-8');
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
die();
