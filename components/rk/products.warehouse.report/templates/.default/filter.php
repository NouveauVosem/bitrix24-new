<?php
$arFilterWarehouses = [];
foreach ($arResult['WAREHOUSES'] as $warehouse) {
    $arFilterWarehouses[$warehouse['ID']] = $warehouse['TITLE'];
}
$filterFields = [
    [
        'id' => 'DATE',
        'name' => 'Отчетный период',
        'type' => 'date',
    ],
    [
        'id' => 'WAREHOUSE',
        'name' => 'Склад',
        'type' => 'list',
        'items' => $arFilterWarehouses,
        'params' => ['multiple' => 'N']
    ],

    [
        'id' => 'SECTIONS',
        'name' => 'Категория товара',
        'type' => 'list',
        'items' => $arResult['SECTIONS'],
        'params' => ['multiple' => 'Y']
    ],
    [
        'id' => 'HIDE_ZERO',
        'name' => 'Скрыть товары где всё 0',
        'type' => 'list',
        'items' => ['Y' => 'Да', 'N' => 'Нет'],
        'params' => ['multiple' => 'N']
    ]


];


$APPLICATION->IncludeComponent(
    'bitrix:main.ui.filter',
    '',
    [
        'FILTER_ID' => 'products-warehouse-report',
        'GRID_ID' => 'products-warehouse-report',
        'FILTER' => $filterFields,
        'ENABLE_LABEL' => true,
        'ENABLE_SEARCH' => false,
        'AJAX_MODE' => 'Y',
        'AJAX_OPTION_JUMP' => 'N',
        'AJAX_OPTION_HISTORY' => 'N',
    ]
);