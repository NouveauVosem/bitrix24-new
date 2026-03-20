<?php
define("NO_KEEP_STATISTIC", true);
define("NO_AGENT_STATISTIC", true);
define("NO_AGENT_CHECK", true);
require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

use Bitrix\Main\Loader;
use Bitrix\Catalog\StoreDocumentElementTable;
use Bitrix\Catalog\StoreDocumentTable;
use Bitrix\Sale\Internals\ShipmentTable;
use Bitrix\Crm\ProductRowTable;
use Bitrix\Crm\Binding\OrderEntityTable;

Loader::includeModule('crm');
Loader::includeModule('catalog');

//Формула: 
// от поля "Сумма заказа с НДС" - Общая сумма с НДС - UF_CRM_1728403359608 - 5880
// посчитать сумму предоплаты, 
// имея при этом поле "% предоплаты" - UF_CRM_1717096950839 - 30
// а затем отнять ее (число Х). 
// Далее должна быть проверка, совпадает ли сумма в поле 
// "Осталось оплатить" - UF_CRM_1738587359094 - 4116
// с отминусованной суммой предоплаты (число Х)
// Если да - то поле "Можно ли брать заказ в работу" - UF_CRM_1760724756
// автоматически выбирается как "да", если нет, то "нет". 

$dealId = 266;

$dealData = CCrmDeal::GetListEx([],["ID"=>$dealId],false,false,
    [
        "ID",
        "UF_CRM_1728403359608",
        'UF_CRM_1717096950839',
        'UF_CRM_1738587359094',
        'UF_CRM_1738142772006',
        'UF_CRM_1760724756',
        'UF_CRM_1760724869',
    ]
)->Fetch();

// if ($dealData['UF_CRM_1738142772006'] > 0) {
//     $checkDealToShip = checkDealToShip($dealData);
// } else {
//     $checkDealToWork = checkDealToWork($dealData);
// }
$checkDealToWork = checkDealToWork($dealData);

$checkDealToShip = checkDealToShip($dealData);

?>
<pre>
    <? var_dump($dealData) ?>
</pre>
<?

function checkDealToWork ($dealData) {

    global $USER_FIELD_MANAGER;
    // Поля:
    $totalWithVAT = (float)$dealData['UF_CRM_1728403359608']; // Сумма заказа с НДС
    $prepaymentPercent = (float)$dealData['UF_CRM_1717096950839']; // % предоплаты
    $remainingToPay = (float)$dealData['UF_CRM_1738587359094']; // Осталось оплатить

    // Формула:
    // 1. Рассчитать сумму предоплаты
    $prepaymentSum = $totalWithVAT * $prepaymentPercent / 100;

    // 2. Рассчитать сумму после вычета предоплаты
    $calculatedRemaining = $totalWithVAT - $prepaymentSum;

    // 3. Проверка совпадения с полем "Осталось оплатить"
    $canBeTaken = abs($calculatedRemaining - $remainingToPay) < 0.01 ? 1 : 0;

    ?>
    <pre>
        <? var_dump('prepaymentSum ' . $prepaymentSum); ?>
        <? var_dump('calculatedRemaining ' . $calculatedRemaining); ?>
        <? var_dump('remainingToPay ' . $remainingToPay); ?>
        <? var_dump('canBeTaken ' . $canBeTaken); ?>
    </pre>
    <?

    // 4. Обновить поле "Можно ли брать заказ в работу"
    if ($dealData['UF_CRM_1760724756'] != $canBeTaken) {
        $USER_FIELD_MANAGER->Update('CRM_DEAL', $dealData['ID'], array("UF_CRM_1760724756" => $canBeTaken));
    }
    // if ($dealData['UF_CRM_1760724869'] != $canBeShipped) {
    //     //$USER_FIELD_MANAGER->Update('CRM_DEAL', $dealData['ID'], array("UF_CRM_1760724756" => $canBeTaken));
    //     $USER_FIELD_MANAGER->Update('CRM_DEAL', $dealData['ID'], array("UF_CRM_1760724869" => $canBeShipped));
    // }
}

// Название поля "Можно ли отгружать заказ", - UF_CRM_1760724869
// варианты заполнения поля (автоматически!): да / нет 
// Формула: от поля "Сумма заказа с НДС" - Общая сумма с НДС - UF_CRM_1728403359608 - 5880
// посчитать сумму предоплаты + доплаты 
// (при этом условие того, что доплата будет необязательное), 
// имея при этом поле "% предоплаты" - UF_CRM_1717096950839 - 30
// и "% доплаты", - UF_CRM_1738142772006 - 0
// а затем отнять эту сумму (число Y). 
// Далее должна быть проверка, совпадает ли сумма в поле "Осталось оплатить" 
// с отминусованной суммой предоплаты (число Y). 
// Если да - то поле "Можно ли брать заказ в работу" - 
// автоматически выбирается как "да", если нет, то "нет". 

function checkDealToShip ($dealData) {

    global $USER_FIELD_MANAGER;
    // Поля:
    $totalWithVAT = (float)$dealData['UF_CRM_1728403359608']; // Сумма заказа с НДС
    $prepaymentPercent = (float)$dealData['UF_CRM_1717096950839']; // % предоплаты
    $additionalPaymentPercent = (float)$dealData['UF_CRM_1738142772006']; // % доплаты
    $remainingToPay = (float)$dealData['UF_CRM_1738587359094']; // Осталось оплатить

    // Формула:
    // 1. Рассчитать сумму предоплаты + доплаты
    $prepaymentSum = $totalWithVAT * $prepaymentPercent / 100;
    $additionalPaymentSum = $totalWithVAT * $additionalPaymentPercent / 100;
    $totalPaymentSum = $prepaymentSum + $additionalPaymentSum;

    // 2. Рассчитать сумму после вычета предоплаты + доплаты
    $calculatedRemaining = $totalWithVAT - $totalPaymentSum;

    // 3. Проверка совпадения с полем "Осталось оплатить"
    $canBeShipped = abs($calculatedRemaining - $remainingToPay) < 0.01 ? 1 : 0;

    ?>
    <pre>
        <? var_dump('totalPaymentSum ' . $totalPaymentSum); ?>
        <? var_dump('calculatedRemaining ' . $calculatedRemaining); ?>
        <? var_dump('remainingToPay ' . $remainingToPay); ?>
        <? var_dump('canBeShipped ' . $canBeShipped); ?>
    </pre>
    <?

    // 4. Обновить поле "Можно ли отгружать заказ"
    // if ($dealData['UF_CRM_1760724756'] != $canBeTaken) {
    //     $USER_FIELD_MANAGER->Update('CRM_DEAL', $dealData['ID'], array("UF_CRM_1760724756" => $canBeTaken));
    // }
    if ($dealData['UF_CRM_1760724869'] != $canBeShipped) {
        //$USER_FIELD_MANAGER->Update('CRM_DEAL', $dealData['ID'], array("UF_CRM_1760724756" => $canBeTaken));
        $USER_FIELD_MANAGER->Update('CRM_DEAL', $dealData['ID'], array("UF_CRM_1760724869" => $canBeShipped));
    }
}

// $result = OrderEntityTable::getList([
//     'filter' => [
//         'OWNER_ID' => intval($ID),
//         'OWNER_TYPE_ID' => 2, // 4
//     ],
//     'select' => ['ORDER_ID', 'OWNER_ID', 'OWNER_TYPE_ID']
// ]);

// global $USER_FIELD_MANAGER;

// while ($row = $result->fetch()) {
//     $arSaleDocs = ShipmentTable::getList([
//         'filter' => [
//             'ORDER_ID' => $row['ORDER_ID'],
//             'DEDUCTED' => 'Y'
//         ],
//         'select' => ['*']
//     ])->fetchAll();

//     foreach ($arSaleDocs as $doc) {
//         $USER_FIELD_MANAGER->Update('CRM_DEAL', $ID, array("UF_DOC" => $doc["ID"])); 
//         $USER_FIELD_MANAGER->Update('CRM_DEAL', $ID, array("UF_ORDER_ID" => $doc["ORDER_ID"])); 
//         $USER_FIELD_MANAGER->Update('CRM_DEAL', $ID, array("UF_ACCOUNT_NUMBER" => $doc["ACCOUNT_NUMBER"])); 
//     }
        
// }
?>