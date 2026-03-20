<?php
$APPLICATION->IncludeComponent(
    'bitrix:main.ui.grid',
    '',
    [
        'GRID_ID' => 'products-warehouse-report-grid',
        'COLUMNS' => $arResult['COLUMNS'],
        'ROWS' => $arResult['ROWS'],
        'AJAX_MODE' => 'Y',
        'SHOW_CHECK_ALL_CHECKBOXES' => true,
        'SHOW_ROW_ACTIONS_MENU' => true,
        'SHOW_ROW_CHECKBOXES' => false,
        'ALLOW_PIN_HEADER' => true,
        'ALLOW_COLUMNS_RESIZE' => false
    ]
);