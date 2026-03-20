<?php

use Bitrix\Crm\Model\Dynamic\ItemTable;
use Bitrix\Crm\Service\Container;

AddEventHandler("crm", "OnBeforeCrmDealUpdate", ["CCrmHandler","productReserve"]);
AddEventHandler("crm", "OnAfterCrmDealProductRowsSave", ["CCrmHandler","OnAfterCrmDealProductRowsSave"]);
AddEventHandler("catalog", "OnDocumentAdd", ['CCatalogStoreDocumentHandler', 'OnDocumentAdd']);

AddEventHandler(
	"crm", 
	"OnAfterCrmLeadAdd", 
	["CCrmLeadHandler","checkDuplicatePhoneAndLoseLead"]
);


$eventManager = \Bitrix\Main\EventManager::getInstance();

$eventManager->addEventHandler("sale", "OnSaleShipmentEntitySaved", 'saveShipment');

$eventManager->addEventHandler(
    'main',
    "onGetPublicView",
    ["CCatalogStoreDocumentHandler", "onGetPublicView"]
);

$eventManager->addEventHandler(
    'main',
    "onGetPublicEdit",
    ["CCatalogStoreDocumentHandler", "onGetPublicEdit"]
);

function saveShipment($event){
	
	CModule::IncludeModule("crm");
	
	$request = Bitrix\Main\Application::getInstance()->getContext()->getRequest();
	$request->addFilter(new \Bitrix\Main\Web\PostDecodeFilter);
	
	$formParam = $request->toArray();
	
	$shipment = $event->getParameter("ENTITY");
	$oldValues = $event->getParameter("VALUES");
	$values = $shipment->getFields()->getValues();
	
	// UC_TB1B18 - ZV (под заказ)
    // UC_L8JVGQ - сборка
    // UC_3S4WFS - выписка инвойса
    // UC_KPW8X6 - заказ транспорта
    // UC_WR1KV9 - в пути
    // C1:UC_GI474N - ZV (под заказ) (категория 1)
    // C1:PREPARATION - сборка (категория 1)
    // C1:UC_3M0L0N - выписка инвойса (категория 1)
    // C1:UC_XELH19 - заказ транспорта (категория 1)
    // C1:UC_2DPXDX - в пути (категория 1)

	// if(($formParam["VALUE"]=="WON" || $formParam['VALUE']=='UC_L8JVGQ' || $formParam['VALUE']=='UC_3S4WFS' || $formParam['VALUE']=='UC_KPW8X6' || $formParam["VALUE"]=="UC_WR1KV9" || 
	// 	$formParam['VALUE']=='C1:PREPARATION' || $formParam['VALUE']=='C1:UC_3M0L0N' || $formParam['VALUE']=='C1:UC_XELH19' || $formParam["VALUE"]=="C1:UC_2DPXDX") && $formParam["ID"]>0)
	// {
	if($formParam["VALUE"]=="WON" || $formParam['VALUE']=='UC_L8JVGQ' || $formParam['VALUE']=='UC_3S4WFS' || $formParam['VALUE']=='UC_KPW8X6' || $formParam["VALUE"]=="UC_WR1KV9" || 
		$formParam['VALUE']=='C1:PREPARATION' || $formParam['VALUE']=='C1:UC_3M0L0N' || $formParam['VALUE']=='C1:UC_XELH19' || $formParam["VALUE"]=="C1:UC_2DPXDX")
	{
		
		$arDeal = CCrmDeal::GetListEx([],["ID"=>$formParam["ID"]],false,false,["*","UF_*"])->Fetch();
		
		if(empty($arDeal["UF_DOC"]) || $values["ID"]>$arDeal["UF_DOC"]){
			global $USER_FIELD_MANAGER;				
			$USER_FIELD_MANAGER->Update('CRM_DEAL', $formParam["ID"], array("UF_DOC" => $values["ID"])); 
			$USER_FIELD_MANAGER->Update('CRM_DEAL', $formParam["ID"], array("UF_ORDER_ID" => $values["ORDER_ID"])); 
			$USER_FIELD_MANAGER->Update('CRM_DEAL', $formParam["ID"], array("UF_ACCOUNT_NUMBER" => $values["ACCOUNT_NUMBER"])); 
		}
		
		//DATE_DEDUCTED
		
	}
	
	// if($formParam["ACTION_ENTITY_ID"]>0 && ($formParam["STAGE_ID"]=="WON" || $formParam['STAGE_ID']=='UC_L8JVGQ' || $formParam['STAGE_ID']=='UC_3S4WFS' || $formParam['STAGE_ID']=='UC_KPW8X6' || $formParam["STAGE_ID"]=="UC_WR1KV9" ||  
	// 	$formParam['STAGE_ID']=='C1:PREPARATION' || $formParam['STAGE_ID']=='C1:UC_3M0L0N' || $formParam['STAGE_ID']=='C1:UC_XELH19' || $formParam["STAGE_ID"]=="C1:UC_2DPXDX"))
	// {
	if($formParam["STAGE_ID"]=="WON" || $formParam['STAGE_ID']=='UC_L8JVGQ' || $formParam['STAGE_ID']=='UC_3S4WFS' || $formParam['STAGE_ID']=='UC_KPW8X6' || $formParam["STAGE_ID"]=="UC_WR1KV9" ||  
		$formParam['STAGE_ID']=='C1:PREPARATION' || $formParam['STAGE_ID']=='C1:UC_3M0L0N' || $formParam['STAGE_ID']=='C1:UC_XELH19' || $formParam["STAGE_ID"]=="C1:UC_2DPXDX")
	{
		
		$arDeal = CCrmDeal::GetListEx([],["ID"=>$formParam["ACTION_ENTITY_ID"]],false,false,["*","UF_*"])->Fetch();
		
		if(empty($arDeal["UF_DOC"]) || $values["ID"]>$arDeal["UF_DOC"]){
			global $USER_FIELD_MANAGER;				
			$USER_FIELD_MANAGER->Update('CRM_DEAL', $formParam["ACTION_ENTITY_ID"], array("UF_DOC" => $values["ID"])); 
			$USER_FIELD_MANAGER->Update('CRM_DEAL', $formParam["ACTION_ENTITY_ID"], array("UF_ORDER_ID" => $values["ORDER_ID"])); 
			$USER_FIELD_MANAGER->Update('CRM_DEAL', $formParam["ACTION_ENTITY_ID"], array("UF_ACCOUNT_NUMBER" => $values["ACCOUNT_NUMBER"])); 
		}
	}
	
	
	global $SHIP_DEAL_ID;
	if($SHIP_DEAL_ID>0){
		
		$arDeal = CCrmDeal::GetListEx([],["ID"=>$formParam["ID"]],false,false,["*","UF_*"])->Fetch();
		
		
		// $factory = Container::getInstance()->getFactory(31); // 31 = Smart Invoice
		// $items = $factory->getItems([
			// 'filter' => ['=PARENT_ID_2' => $SHIP_DEAL_ID],
		// ]);
		
		// foreach ($items as $invoice) {

			// $arInvoice = $invoice->getData();
			// break;
		// }
 
		// if($arInvoice["CREATED_TIME"]){
		if(!empty($arDeal["UF_CRM_1741189617279"])){
  
			$date = date("Y-m-d 09:00:00",MakeTimeStamp($arDeal["UF_CRM_1741189617279"]));
  
			CAgent::Add([
				"NAME"      => "AgentUpdateShipmentDate(".$values["ID"].", \"".$date."\");",
				"MODULE_ID" => "main",
				"ACTIVE"    => "Y",
				"NEXT_EXEC" => ConvertTimeStamp(time() + 60, "FULL"), // через хвилину
				"AGENT_INTERVAL" => 86400, // якщо треба раз на добу
				"IS_PERIOD" => "N"
			]);
		}
		//}
		 

	}
	 
}

//AddEventHandler("sale", "OnSaleShipmentEntitySaved", "saveShipmentAdd");

function saveShipmentAdd($event)
{
	CModule::IncludeModule("crm");
    $shipment = $event->getParameter("ENTITY"); // объект отгрузки
    $values = $shipment->getFields()->getValues();

    $orderId = $shipment->getOrderId();
    if (!$orderId) return;

    // Находим сделку по ORDER_ID
    $dbDeal = CCrmDeal::GetListEx([], ["UF_ORDER_ID" => $orderId], false, false, ["*","UF_*"]);
    $arDeal = $dbDeal->Fetch();
    if (!$arDeal) return;

    // Проверяем стадию сделки
    $stage = $arDeal["STAGE_ID"];
    $stagesToProcess = [
        "UC_TB1B18","UC_L8JVGQ","UC_3S4WFS","UC_KPW8X6","UC_WR1KV9",
        "C1:PREPARATION","C1:UC_3M0L0N","C1:UC_XELH19","C1:UC_2DPXDX"
    ];

    if (!in_array($stage, $stagesToProcess)) return;

    global $USER_FIELD_MANAGER;
	if(empty($arDeal["UF_DOC"]) || $values["ID"]>$arDeal["UF_DOC"]){
		$USER_FIELD_MANAGER->Update('CRM_DEAL', $arDeal["ID"], [
			"UF_DOC" => $values["ID"],
			"UF_ORDER_ID" => $values["ORDER_ID"],
			"UF_ACCOUNT_NUMBER" => $values["ACCOUNT_NUMBER"]
		]);
	}
}

function AgentUpdateShipmentDate($id,$date){
	
	global $DB;
	$DB->Query("
		UPDATE b_sale_order_delivery 
		SET DATE_DEDUCTED = '".$DB->ForSql($date)."'
		WHERE ID = ".$id
	);

}

$eventManager->addEventHandler(
    'crm',
    'onCrmDynamicItemUpdate',
    'changeCmartInvoice'
);

function changeCmartInvoice($event){

	$parameters = $event->getParameters();
	 
	$entityTypeId = $parameters["item"]->getEntityTypeId();
	if($entityTypeId==31 && $_REQUEST["fields"]["stageId"]=="DT31_1:P"){
		$entityId = $parameters["id"];
		
		$fields = $parameters["item"]->toArray();
		 
		if($fields["parentId2"]>0){
			
			$arDeal = CCrmDeal::GetListEx([],["ID"=>$fields["parentId2"]],false,false,["*","UF_*"])->Fetch();
			if($arDeal["ID"]>0){
				$factory = \Bitrix\Crm\Service\Container::getInstance()->getFactory($entityTypeId);

				$summ = 0;

				$result = $factory->getItems([
					'filter' => ['PARENT_ID_2' => $fields["parentId2"]], 
				]);
				
				foreach ($result as $item) {
					$data = $item->getData();
					
					$s = explode("|",$data["UF_CRM_SMART_INVOICE_1738856087998"]);
					
					$summ = $summ + $s[0];
					
				}
				
				if($summ>0 && $arDeal["UF_CRM_1728403359608"]>0){
					$val = $arDeal["UF_CRM_1728403359608"] - $summ;
					
					foreach ($result as $item) {
						$test = get_class_methods($item);
						$item->set("UF_CRM_67A081D9A5E31",$arDeal["UF_CRM_1728403359608"]);
						$item->set("UF_CRM_67A0CBD1BC563",$val);
						$item->save();
					}
					
					$entity = new CCrmDeal(false);
					$arUpdate = ["UF_CRM_1738587359094"=>$val,"CHECK_PERMISSIONS"=>"N"];
					$entity->Update($arDeal["ID"],$arUpdate);
				}
			}
		}
	}
}

$eventManager->addEventHandler(
    'voximplant',
    'OnCallEnd',
    ['MissedCalls', 'checkCall'],
	false,
	10000
);