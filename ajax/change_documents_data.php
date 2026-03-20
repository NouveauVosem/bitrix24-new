<?php
require_once(__DIR__ . '/crest/crest.php');

require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

use Bitrix\Main\Loader;
use Bitrix\Main\Context;
use Bitrix\Crm\DealTable;
use Bitrix\Main\Type\DateTime;
use Bitrix\Main\Entity;
use Bitrix\Main\Application;
//use Bitrix\Catalog\Document\DocumentManager;
use Bitrix\Catalog\StoreDocumentTable;

Loader::includeModule("main");
Loader::includeModule("crm");

$request = Context::getCurrent()->getRequest();

$document_id = $request->getPost("document_id");
$new_date = $request->getPost("new_date");

if ($document_id && $new_date) {
    //$new_date = new Type\DateTime($new_date, 'Y-m-d H:i:s');

    $unswer = [
        'status' => 'success',
        'message' => 'Дата изменена',
        'new_date' => $new_date,
        'document_id' => $document_id
    ];

    $result = CRest::call(
        'catalog.document.cancel',
        [
            'id' => $document_id
        ]
    );

    ?>
    <pre>
        <? var_dump($result) ?>
    </pre>
    <?

} else {
    $unswer = [
        'status' => 'error',
        'message' => 'Некорректные данные'
    ];
}

echo json_encode($unswer, JSON_UNESCAPED_UNICODE);

die();
?>