<?php
define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_CHECK', true);
define('DisableEventsCheck', true);

require_once $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';

header('Content-Type: application/json; charset=utf-8');

if (!CModule::IncludeModule('crm')) {
    echo json_encode(['status' => 'error', 'message' => 'CRM module not available']);
    die();
}

$dealId = (int)($_POST['dealId'] ?? 0);
if (!$dealId) {
    echo json_encode(['status' => 'error', 'message' => 'dealId required']);
    die();
}

$deal = CCrmDeal::GetByID($dealId);
if (!$deal) {
    echo json_encode(['status' => 'error', 'message' => 'Deal not found']);
    die();
}

// Delivery address from deal UF_ fields
$deliveryCity    = trim($deal['UF_CRM_1720604913416'] ?? '');
$deliveryStreet  = trim($deal['UF_CRM_1720604937540'] ?? '');
$deliveryHouse   = trim($deal['UF_CRM_1720604951910'] ?? '');
$deliveryZip     = trim($deal['UF_CRM_1720604926030'] ?? '');
$deliveryCountry = trim($deal['UF_CRM_67BF208ADD735']  ?? '');

$deliveryLine = implode(', ', array_filter([
    $deliveryStreet . ($deliveryHouse ? ', ' . $deliveryHouse : ''),
    $deliveryZip ? $deliveryZip . ' ' . $deliveryCity : $deliveryCity,
    $deliveryCountry,
]));

// Resolve seller via USER_FIELD_MANAGER (CCrmDeal::GetByID does not return UF_ fields)
global $USER_FIELD_MANAGER;
$dealUfFields = $USER_FIELD_MANAGER->GetUserFields('CRM_DEAL', $deal['ID'], LANGUAGE_ID);

// Seller
$sellerField = $dealUfFields['UF_CRM_1718209313308'] ?? [];
$sellerValue = '';
if (!empty($sellerField['VALUE'])) {
    if (($sellerField['USER_TYPE_ID'] ?? '') === 'enumeration') {
        $enumRes = CUserFieldEnum::GetList([], ['ID' => $sellerField['VALUE']]);
        if ($enumRow = $enumRes->Fetch()) $sellerValue = $enumRow['VALUE'];
    } else {
        $sellerValue = (string)$sellerField['VALUE'];
    }
}

// KP language (e.g. "EN английский" → "EN")
$langField = $dealUfFields['UF_CRM_6634E9B2269F2'] ?? [];
$langRaw   = '';
if (!empty($langField['VALUE'])) {
    if (($langField['USER_TYPE_ID'] ?? '') === 'enumeration') {
        $enumRes = CUserFieldEnum::GetList([], ['ID' => $langField['VALUE']]);
        if ($enumRow = $enumRes->Fetch()) $langRaw = $enumRow['VALUE'];
    } else {
        $langRaw = (string)$langField['VALUE'];
    }
}
$langCode = strtoupper(trim(explode(' ', trim($langRaw))[0]));

$result = [
    'status' => 'success',
    'deal'   => [
        'id'        => $deal['ID'],
        'title'     => $deal['TITLE'],
        'currency'  => $deal['CURRENCY_ID'] ?: 'EUR',
        'seller'    => $sellerValue,
        'lang'      => $langCode ?: 'EN',
        'companyId' => (int)($deal['COMPANY_ID'] ?? 0),
        'contactId' => (int)($deal['CONTACT_ID'] ?? 0),
    ],
    'delivery' => [
        'street'  => $deliveryStreet . ($deliveryHouse ? ', ' . $deliveryHouse : ''),
        'city'    => $deliveryCity,
        'zip'     => $deliveryZip,
        'country' => $deliveryCountry,
        'line'    => $deliveryLine,
    ],
    'company' => null,
    'contact' => null,
];

// Company linked to deal
$companyId = (int)($deal['COMPANY_ID'] ?? 0);
if ($companyId > 0) {
    $company = CCrmCompany::GetByID($companyId);

    if ($company) {
        $phone = '';
        $email = '';
        $dbMulti = CCrmFieldMulti::GetList(
            ['ID' => 'asc'],
            ['ENTITY_ID' => 'COMPANY', 'ELEMENT_ID' => $companyId]
        );
        while ($row = $dbMulti->Fetch()) {
            if ($row['TYPE_ID'] === 'PHONE' && !$phone) $phone = $row['VALUE'];
            if ($row['TYPE_ID'] === 'EMAIL' && !$email) $email = $row['VALUE'];
        }

        global $USER_FIELD_MANAGER;
        $ufFields     = $USER_FIELD_MANAGER->GetUserFields('CRM_COMPANY', $companyId, LANGUAGE_ID);
        $vat          = trim($ufFields['UF_CRM_1717094608804']['VALUE'] ?? '');
        $legalAddress = trim($ufFields['UF_CRM_1718030299507']['VALUE'] ?? '');

        $result['company'] = [
            'id'            => $company['ID'],
            'name'          => $company['TITLE'],
            'vat'           => $vat,
            'legal_address' => $legalAddress,
            'phone'         => $phone,
            'email'         => $email,
            'address'       => implode(', ', array_filter([
                $company['ADDRESS']             ?? '',
                $company['ADDRESS_CITY']        ?? '',
                $company['ADDRESS_POSTAL_CODE'] ?? '',
                $company['ADDRESS_COUNTRY']     ?? '',
            ])),
        ];
    }
}

// Contact linked to deal
$contactId = (int)($deal['CONTACT_ID'] ?? 0);
if ($contactId > 0) {
    $contact = CCrmContact::GetByID($contactId);
    if ($contact) {
        $result['contact'] = [
            'id'   => $contact['ID'],
            'name' => trim(($contact['NAME'] ?? '') . ' ' . ($contact['LAST_NAME'] ?? '')),
        ];
    }
}

// Hierarchy items from crm_deal_hierarchy table
$connection = \Bitrix\Main\Application::getConnection();
$res        = $connection->query("SELECT ITEMS FROM crm_deal_hierarchy WHERE DEAL_ID = " . $dealId);
$row        = $res->fetch();
$items      = $row ? (json_decode($row['ITEMS'], true) ?: []) : [];

// Resolve missing bitrixId and get baseNormArticle via Crystal API
$crystalBase = 'https://crystal.alvla.tools';
$crystalKey  = 'legenda';

$ctx = stream_context_create(['http' => [
    'method'  => 'GET',
    'header'  => 'X-Api-Key: ' . $crystalKey . "\r\n",
    'timeout' => 3,
]]);

$result['_debug_enrich'] = [];
foreach ($items as &$item) {
    $normId = $item['normId'] ?? null;
    $dbg = ['article' => $item['article'] ?? '?', 'normId' => $normId, 'hasSnapshot' => !empty($item['slotSnapshot']), 'snapshotLen' => count($item['slotSnapshot'] ?? [])];

    if (!$normId) { $dbg['skip'] = 'no normId'; $result['_debug_enrich'][] = $dbg; continue; }

    $hasSlotSnapshot = !empty($item['slotSnapshot']);
    $needBitrixId    = empty($item['bitrixId']);
    $needNormArticle = empty($item['baseNormArticle']);

    if (!$needBitrixId && !$needNormArticle && !$hasSlotSnapshot) { $dbg['skip'] = 'nothing needed'; $result['_debug_enrich'][] = $dbg; continue; }

    $raw = @file_get_contents($crystalBase . '/api/product-form-norms/' . urlencode($normId), false, $ctx);
    if (!$raw) continue;

    $norm = json_decode($raw, true);
    $dbg['templateId'] = $norm['templateId'] ?? null;

    if ($needBitrixId) {
        $bid = (int)($norm['template']['bitrixId'] ?? 0);
        if ($bid) $item['bitrixId'] = $bid;
    }
    if ($needNormArticle) {
        $item['baseNormArticle'] = $norm['baseNormArticle'] ?? null;
    }

    // Enrich slotSnapshot with fresh slot names from the form template
    if ($hasSlotSnapshot) {
        $templateId = $norm['templateId'] ?? null;
        if ($templateId) {
            $formRaw = @file_get_contents($crystalBase . '/api/product-forms/' . urlencode($templateId), false, $ctx);
            if ($formRaw) {
                $form = json_decode($formRaw, true);
                $freshNames = [];
                foreach ($form['slots'] ?? [] as $slot) {
                    $sid = isset($slot['id']) ? (string)$slot['id'] : null;
                    if ($sid !== null && isset($slot['name'])) {
                        $freshNames[$sid] = $slot['name'];
                    }
                }
                $dbg['freshNamesCount'] = count($freshNames);
                $dbg['snapshotSlotIds'] = array_column($item['slotSnapshot'], 'slotId');
                $dbg['freshSlotIds']    = array_keys($freshNames);
                if (!empty($freshNames)) {
                    foreach ($item['slotSnapshot'] as &$snap) {
                        $sid = isset($snap['slotId']) ? (string)$snap['slotId'] : null;
                        if ($sid !== null && isset($freshNames[$sid])) {
                            $snap['slotName'] = $freshNames[$sid];
                        }
                    }
                    unset($snap);
                }
            }
        }
    }
    $result['_debug_enrich'][] = $dbg;
}
unset($item);

// Fetch product specs and physical params from Crystal for items with baseNormArticle
$specsPerArticle    = [];
$physicalPerArticle = [];
$mediaPerArticle    = [];
$specKeysByCode     = [];
$specValuesByKey    = [];

$uniqueArticles = [];
foreach ($items as $item) {
    $a = $item['baseNormArticle'] ?? null;
    if ($a && !in_array($a, $uniqueArticles, true)) $uniqueArticles[] = $a;
}

foreach ($uniqueArticles as $article) {
    $url = $crystalBase . '/api/products/getAll?search=' . urlencode($article) . '&limit=5';
    $raw = @file_get_contents($url, false, $ctx);
    if (!$raw) continue;
    $resp     = json_decode($raw, true);
    $products = is_array($resp['data'] ?? null) ? $resp['data'] : (is_array($resp) ? $resp : []);
    foreach ($products as $prod) {
        foreach ($prod['variants'] ?? [] as $v) {
            if (($v['article'] ?? '') === $article) {
                if (!empty($v['specs'])) $specsPerArticle[$article] = $v['specs'];
                $w = isset($v['weight']) && $v['weight'] !== null ? (float)$v['weight'] : null;
                $d = !empty($v['dimensions']) ? $v['dimensions'] : null;
                if ($w !== null || $d) $physicalPerArticle[$article] = ['weight' => $w, 'dimensions' => $d];
                $images = [];
                foreach ($v['media'] ?? [] as $m) {
                    if (($m['typeOfMedia'] ?? '') === 'image' && !empty($m['url'])) {
                        $images[] = $crystalBase . '/api/files/image?path=' . urlencode($m['url']);
                    }
                    if (count($images) >= 3) break;
                }
                if ($images) $mediaPerArticle[$article] = $images;
                break 2;
            }
        }
    }
}

if (!empty($specsPerArticle)) {
    $skRaw = @file_get_contents($crystalBase . '/api/spec-keys/', false, $ctx);
    if ($skRaw) {
        foreach (json_decode($skRaw, true) ?: [] as $sk) {
            $specKeysByCode[$sk['code']] = $sk;
        }
    }

    $enumKeysDone = [];
    foreach ($specsPerArticle as $specs) {
        foreach ($specs as $code => $val) {
            if (isset($enumKeysDone[$code])) continue;
            $sk = $specKeysByCode[$code] ?? null;
            if ($sk && in_array($sk['valueType'], ['enum', 'enum_rich'], true)) {
                $svRaw = @file_get_contents($crystalBase . '/api/products/spec-values?specKey=' . urlencode($code), false, $ctx);
                $specValuesByKey[$code] = [];
                if ($svRaw) {
                    foreach (json_decode($svRaw, true) ?: [] as $sv) {
                        $specValuesByKey[$code][$sv['code']] = $sv['value'] ?? ['en' => $sv['code'], 'ru' => $sv['code']];
                    }
                }
                $enumKeysDone[$code] = true;
            }
        }
    }

    foreach ($items as &$item) {
        $article = $item['baseNormArticle'] ?? null;
        if (!$article || !isset($specsPerArticle[$article])) continue;

        $rawSpecs = $specsPerArticle[$article];
        uksort($rawSpecs, function ($a, $b) use ($specKeysByCode) {
            return (int)($specKeysByCode[$a]['sortOrder'] ?? 999) - (int)($specKeysByCode[$b]['sortOrder'] ?? 999);
        });

        $resolved = [];
        foreach ($rawSpecs as $code => $val) {
            $sk = $specKeysByCode[$code] ?? null;
            if (!$sk) continue;
            $labelI18n = $sk['labels'] ?? ['en' => $code, 'ru' => $code];
            $rawUnit   = $sk['unit'] ?? null;
            $vtype     = $sk['valueType'] ?? 'text';

            if (in_array($vtype, ['enum', 'enum_rich'], true)) {
                $enumObj    = $specValuesByKey[$code][$val] ?? null;
                $displayVal = is_array($enumObj)
                    ? $enumObj
                    : ['en' => $val, 'ru' => $val];
            } elseif ($vtype === 'float') {
                if (is_array($val)) {
                    $parts  = array_values(array_filter($val, function ($v) { return $v !== null; }));
                    $numStr = implode('–', $parts);
                } else {
                    $numStr = (string)$val;
                }
                $unitEn = is_array($rawUnit) ? ($rawUnit['en'] ?: ($rawUnit['ru'] ?? '')) : ($rawUnit ?? '');
                $unitRu = is_array($rawUnit) ? ($rawUnit['ru'] ?: ($rawUnit['en'] ?? '')) : ($rawUnit ?? '');
                $displayVal = [
                    'en' => $numStr . ($unitEn ? ' ' . $unitEn : ''),
                    'ru' => $numStr . ($unitRu ? ' ' . $unitRu : ''),
                ];
            } else {
                $displayVal = (string)$val;
            }

            $isEmpty = is_array($displayVal)
                ? (($displayVal['en'] ?? '') === '' && ($displayVal['ru'] ?? '') === '')
                : ($displayVal === '');
            if (!$isEmpty) {
                $resolved[] = ['label' => $labelI18n, 'value' => $displayVal];
            }
        }

        if (!empty($resolved)) $item['specs'] = $resolved;
    }
    unset($item);
}

// Assign physical params (weight / dimensions) to items
if (!empty($physicalPerArticle)) {
    foreach ($items as &$item) {
        $article = $item['baseNormArticle'] ?? null;
        if ($article && isset($physicalPerArticle[$article])) {
            $item['physical'] = $physicalPerArticle[$article];
        }
    }
    unset($item);
}

// Assign media (images) to items
if (!empty($mediaPerArticle)) {
    foreach ($items as &$item) {
        $article = $item['baseNormArticle'] ?? null;
        if ($article && isset($mediaPerArticle[$article])) {
            $item['media'] = $mediaPerArticle[$article];
        }
    }
    unset($item);
}

// Collect all bitrixIds — from items and their components
\CModule::IncludeModule('iblock');
$allBitrixIds = [];
foreach ($items as $item) {
    if (!empty($item['bitrixId'])) $allBitrixIds[] = (int)$item['bitrixId'];
    foreach ($item['components'] ?? [] as $c) {
        if (!empty($c['bitrixId'])) $allBitrixIds[] = (int)$c['bitrixId'];
    }
}
$allBitrixIds = array_values(array_unique(array_filter($allBitrixIds)));

// Enrich with multilingual names (PROPERTY_73 = CZ, PROPERTY_74 = EN)
$nameMap = [];
if (!empty($allBitrixIds)) {
    $dbEl = \CIBlockElement::GetList([], ['ID' => $allBitrixIds], false, false, ['ID', 'PROPERTY_73', 'PROPERTY_74']);
    while ($el = $dbEl->GetNext()) {
        $nameMap[(int)$el['ID']] = [
            'nameCz' => $el['PROPERTY_73_VALUE'] ?? '',
            'nameEn' => $el['PROPERTY_74_VALUE'] ?? '',
        ];
    }
}


foreach ($items as &$item) {
    $bid = (int)($item['bitrixId'] ?? 0);
    if ($bid && isset($nameMap[$bid])) {
        $item['nameCz'] = $nameMap[$bid]['nameCz'];
        $item['nameEn'] = $nameMap[$bid]['nameEn'];
    }
    if (!empty($item['components'])) {
        foreach ($item['components'] as &$c) {
            $cbid = (int)($c['bitrixId'] ?? 0);
            if ($cbid && isset($nameMap[$cbid])) {
                $c['nameCz'] = $nameMap[$cbid]['nameCz'];
                $c['nameEn'] = $nameMap[$cbid]['nameEn'];
            }
        }
        unset($c);
    }
}
unset($item);

$result['items'] = $items;

echo json_encode($result, JSON_UNESCAPED_UNICODE);
