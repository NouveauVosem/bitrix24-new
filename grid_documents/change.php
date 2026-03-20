<?php
require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

use Bitrix\Main\Loader;
use Bitrix\Main\Context;
use Bitrix\Crm\DealTable;
use Bitrix\Main\Type\DateTime;
use Bitrix\Main\Entity;
use Bitrix\Main\Application;
use Bitrix\Catalog\StoreDocumentTable;

Loader::includeModule("main");
Loader::includeModule("crm");

$request = Context::getCurrent()->getRequest();

$document_id = $request->getPost("document_id");
$new_date = $request->getPost("new_date");

$typeDoc = $request->getPost("typeDoc");


global $DB;
CModule::IncludeModule("crm");
global $USER;

if($document_id>0 && $new_date){
	 
	$ts = MakeTimeStamp($new_date, "DD.MM.YYYY HH:MI:SS");
	$dbDate = $sqlDate = date("Y-m-d H:i:s", $ts);
	
	switch($typeDoc){
		case "receipt_adjustment":
		case "moving":
		case "deduct":
		
			$DB->Query("
				UPDATE b_catalog_store_docs 
				SET DATE_STATUS = '".$DB->ForSql($dbDate)."'
				WHERE ID = ".$document_id
			);

			\Bitrix\Crm\Timeline\CommentEntry::create(
				array(
					'TEXT' => "Змінена дата на: ".$new_date,
					'AUTHOR_ID' => $USER->GetID(),
					'BINDINGS' => array(
						array('ENTITY_TYPE_ID' => 33, 'ENTITY_ID' => $document_id)
					)
				)
			);
			
		break;
		case "sales_order":
			$DB->Query("
				UPDATE b_sale_order_delivery 
				SET DATE_DEDUCTED = '".$DB->ForSql($dbDate)."'
				WHERE ID = ".$document_id
			);
			
			\Bitrix\Crm\Timeline\CommentEntry::create(
				array(
					'TEXT' => "Змінена дата на: ".$new_date,
					'AUTHOR_ID' => $USER->GetID(),
					'BINDINGS' => array(
						array('ENTITY_TYPE_ID' => 34, 'ENTITY_ID' => $document_id)
					)
				)
			);

		break;
	}
}

$unswer = [
	'status' => 'ok',
	'message' => ''
];

echo json_encode($unswer, JSON_UNESCAPED_UNICODE);

die();