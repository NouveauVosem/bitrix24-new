<?

use Bitrix\Crm\FieldMultiTable;
use Bitrix\Crm\LeadTable;

class CCrmLeadHandler{
	public static function checkDuplicatePhoneAndLoseLead($arFields){
		
		if (empty($arFields['ID']) || empty($arFields['FM']['PHONE'])) {
			return;
		}

		$leadId = (int)$arFields['ID'];

		// --- беремо всі телефони ліда ---
		$phones = [];
		
		foreach ($arFields['FM']['PHONE'] as $phone) {
			if (!empty($phone['VALUE'])) {
				$phones[] = substr($phone['VALUE'], -11);
			}
		}

		if (empty($phones)) {
			return;
		}
		
		$duplicate = FieldMultiTable::getList([
			'select' => ['ID', 'ENTITY_ID', 'ELEMENT_ID'],
			'filter' => [
				'=TYPE_ID' => 'PHONE',
				'%VALUE' => $phones,
				'!=ELEMENT_ID' => $leadId, 
				'@ENTITY_ID' => ['LEAD', 'CONTACT', 'COMPANY']
			],
			'limit' => 1
		])->fetch();

		if (!$duplicate) {
			return;
		}
		
		 // --- переводимо лід у програш ---
		LeadTable::update($leadId, [
			'STATUS_ID' => '7'
		]);
		
		
	}
}