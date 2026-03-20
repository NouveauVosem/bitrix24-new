<?
// 200 "Успішний дзвінок";
// 304 "Пропущений дзвінок";
// 402 "Недостатньо коштів на рахунку";
// 402-B24 "Недоступно на безкоштовному тарифі";
// 403 "Заборонено";
// 404 "Невірний номер";
// 423 "Заблоковано";
// 480 "Тимчасово не доступний";
// 484 "Даний напрямок не доступно";
// 486 "Зайнято";
// 500 "Внутрішня помилка сервера";
// 503 "Даний напрямок не доступний";
// 603 "Відхилено";
// 603-S "Виклик скасований";
 

class MissedCalls{

	public static function checkCall($callFields){
		 
		$hourNow = (int)date("G"); // 0–23
		
		if($callFields["CALL_FAILED_CODE"]==304){
			
		}
		
		//Пропущений дзвінок //вхідний
		if($callFields["CALL_FAILED_CODE"]==304 && $callFields["CALL_TYPE"]==2){
			
			if ($callFields["CALL_START_DATE"]) {
				$hourStart = (int)$callFields["CALL_START_DATE"]->format("G"); // 00-23
			}
			
			if (abs($hourNow - $hourStart) > 1) {
				
				ob_start();
				echo date("d.m.Y H:i:s");
				echo "<pre>";
				print_r($hourNow);
				echo "</pre>";
				echo "<pre>";
				print_r($hourStart);
				echo "</pre>";
				echo "<pre>";
				print_r($callFields);
				echo "</pre>";
				$text = ob_get_clean();
				file_put_contents($_SERVER["DOCUMENT_ROOT"]."/error_start_date.txt",$text,FILE_APPEND);
				 
				return true;
			}
			
			CModule::IncludeModule("crm");
			
			$phone = substr($callFields["PHONE_NUMBER"],-10);
			$res = Bitrix\Crm\FieldMultiTable::getList([
				"filter"=>["VALUE"=>"%".$phone,"TYPE_ID"=>"PHONE"],
				"order"=>["ELEMENT_ID"=>"ASC"]]
			);
			
			$arEntity = [];
			
			while($row = $res->Fetch()){
				
				
				
				switch($row["ENTITY_ID"]){
					case "LEAD":
						$entities["L_".$row["ELEMENT_ID"]] = "L_".$row["ELEMENT_ID"];
						$entity = new CrmLead(false);
					break;
					case "CONTACT":
						$entities["C_".$row["ELEMENT_ID"]] = "C_".$row["ELEMENT_ID"];
						$entity = new CrmContact(false);
					break;
					case "COMPANY":
						$entities["CO_".$row["ELEMENT_ID"]] = "CO_".$row["ELEMENT_ID"];
						$entity = new CrmCompany(false);
					break;
					case "DEAL":
						$entities["D_".$row["ELEMENT_ID"]] = "D_".$row["ELEMENT_ID"];
						$entity = new CrmDeal(false);
					break;
				}
				
				$arEntity = $entity->GetListEx(
					[],
					["ID"=>$row["ELEMENT_ID"],"CHECK_PERMISIONS"=>"N"],
					false,
					false,
					["ID","ASSIGNED_BY_ID"]
				)->Fetch();
				
				$responsibles[] = $arEntity["ASSIGNED_BY_ID"];
				
			}
			
			if(!empty($entities)){
				
				$responsibles = array_unique($responsibles);
				
				self::addTask($entities,$responsibles,$callFields["PHONE_NUMBER"],$callFields);
			}
			
		}
	 
		
	}

	public static function addTask($entities,$responsibles,$phone='',$callFields){

		 
	
		CModule::IncludeModule("crm");
		CModule::IncludeModule("tasks");

		if(!empty($entities)){
			
			
			CModule::IncludeModule("tasks");
			 
			
			$arTaskAdd = [
				"TITLE" => "Missed call on ".$phone,
				"UF_CRM_TASK" => $entities,
				"RESPONSIBLE_ID" => $responsibles[0],
				"ACCOMPLICES" => $responsibles,
				"UF_CALL_ID" => $callFields["CALL_ID"],
			];

			$crmFilter = ['LOGIC' => 'OR'];

			foreach ($entities as $entity) {
				$crmFilter[] = ['=UF_CRM_TASK' => $entity];
			}


			$arFilter = [
				"@UF_CRM_TASK" => $entities,
				"%TITLE" => "Missed call on",
				"!=STATUS" => 5,
			];

			// Вибірка через D7
			$rsTasks = Bitrix\Tasks\Internals\TaskTable::getList([
				'select' => ['ID', 'UF_CRM_TASK', 'TITLE', 'STATUS', 'DEADLINE', 'RESPONSIBLE_ID'],
				'filter' => $arFilter,
			]);
 
			// Перший результат
			$arActiveTask = $rsTasks->fetch();
 
			if($arActiveTask["ID"]>0){
				
				ob_start();
				echo "Active Task <pre>".date("d.m.Y H:i:s");
				print_r($arActiveTask);
				echo "</pre>";
				echo "<pre>";
				print_r($callFields);
				echo "</pre>";
				
				$text = ob_get_clean();
				file_put_contents($_SERVER["DOCUMENT_ROOT"]."/log_m_calls.txt",$text,FILE_APPEND);
				
				return $arFields;
			}

			$cTask = new \CTasks;
			$taskId = $cTask->Add($arTaskAdd);
			
			if (!$taskId) {
				
				
				ob_start();
				echo "Task error<pre>".date("d.m.Y H:i:s");
				print_r($arTaskAdd);
				echo "</pre>";
				echo "<pre>";
				print_r($cTask->LAST_ERROR);
				echo "</pre>";
				$text = ob_get_clean();
				file_put_contents($_SERVER["DOCUMENT_ROOT"]."/log_m_calls.txt",$text,FILE_APPEND);
				
			}
			
		}
		 
	}
	
} 