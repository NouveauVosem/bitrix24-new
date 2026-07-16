<?php
define('NOT_CHECK_PERMISSIONS', true);
define('NO_KEEP_STATISTIC', true);
define('BX_SECURITY_SESSION_READONLY', true);
require_once($_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include.php');
\Bitrix\Main\Loader::includeModule('crm');

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

$data   = json_decode(file_get_contents('php://input'), true);
$dealId = intval($data['dealId'] ?? 0);
$secret = $data['secret'] ?? '';

// Проверяем секретный ключ — только alvla.services может сюда писать
$expectedSecret = 'crm_alvla_secret_2026';
if ($secret !== $expectedSecret) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit;
}

if (!$dealId) {
    echo json_encode(['status' => 'error', 'message' => 'Missing dealId']);
    exit;
}

saveOrderConfirmation($dealId, $data);
exit;

// ===== Подтверждение заказа транспорта =====
// Цены просчёта (Rhenus/DSV/Raben) больше не пишутся в поля сделки — они хранятся в базе
// расчётов и фетчатся оттуда. Этот endpoint теперь только пишет данные уже заказанного
// транспорта. alvla.services присылает: shipmentDate ('Y-m-d'), price + currency (факт. цена транспорта),
// carrier (название перевозчика — сопоставляется со значением списка UF-поля), orderNumber
// (номер заказа у перевозчика). Любое из полей необязательно — обновляем то, что пришло.
function saveOrderConfirmation($dealId, $data)
{
    $shipmentDate = trim($data['shipmentDate'] ?? '');
    $price        = $data['price'] ?? null;
    $currency     = trim($data['currency'] ?? '') ?: 'EUR';
    $carrier      = trim($data['carrier'] ?? '');
    $orderNumber  = trim($data['orderNumber'] ?? '');

    $fields = [];
    $warnings = [];

    if ($shipmentDate !== '') {
        try {
            $fields['UF_CRM_1726580880047'] = new \Bitrix\Main\Type\Date($shipmentDate, 'Y-m-d');
        } catch (\Exception $e) {
            $warnings[] = 'Invalid shipmentDate: ' . $e->getMessage();
        }
    }

    if ($price !== null && $price !== '') {
        $fields['UF_CRM_1726580806485'] = $price . '|' . $currency;
    }

    if ($orderNumber !== '') {
        $fields['UF_CRM_1726580971056'] = $orderNumber;
    }

    if ($carrier !== '') {
        $carrierEnumId = resolveCarrierEnumId($carrier);
        if ($carrierEnumId) {
            $fields['UF_CRM_1745481202729'] = $carrierEnumId;
        } else {
            $warnings[] = 'Unknown carrier: ' . $carrier;
        }
    }

    if (empty($fields)) {
        echo json_encode(['status' => 'error', 'message' => 'No valid fields to update', 'warnings' => $warnings]);
        return;
    }

    $deal = new \CCrmDeal(false);
    $result = $deal->Update($dealId, $fields);

    $logFields = $fields;
    if (isset($logFields['UF_CRM_1726580880047'])) {
        $logFields['UF_CRM_1726580880047'] = (string)$logFields['UF_CRM_1726580880047'];
    }
    $log = date('Y-m-d H:i:s') . " [order] dealId=$dealId fields=" . json_encode($logFields) . " result=" . ($result ? 'true' : 'false') . " errors=" . implode('; ', $deal->LAST_ERROR ?? []) . " warnings=" . implode('; ', $warnings) . "\n";
    file_put_contents(__DIR__ . '/save_delivery_log.txt', $log, FILE_APPEND);

    if ($result) {
        echo json_encode(['status' => 'success', 'message' => 'Saved', 'warnings' => $warnings]);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Failed to update deal', 'warnings' => $warnings]);
    }
}

// Ищет ID значения списка UF-поля "Перевозчик" по названию (регистронезависимо).
function resolveCarrierEnumId($carrierName)
{
    $fieldRes = \CUserTypeEntity::GetList([], ['ENTITY_ID' => 'CRM_DEAL', 'FIELD_NAME' => 'UF_CRM_1745481202729']);
    $field = $fieldRes->Fetch();
    if (!$field) return null;

    $enumRes = \CUserFieldEnum::GetList([], ['USER_FIELD_ID' => $field['ID']]);
    while ($enumRow = $enumRes->Fetch()) {
        if (mb_strtolower(trim($enumRow['VALUE'])) === mb_strtolower(trim($carrierName))) {
            return $enumRow['ID'];
        }
    }
    return null;
}
